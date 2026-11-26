import logging
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING

from app.database import get_db
from app.models import ChatSessionModel, current_utc_time
from app.schemas.chat import (
    ChatMessageResponse,
    ChatSessionCreateRequest,
    ChatSessionDetailResponse,
    ChatSessionListItem,
    MessagePostRequest,
)
from app.services.turn_relay import turn_relay

logger = logging.getLogger("podinino.chats")
router = APIRouter(prefix="/api/chats", tags=["Chats"])


def is_valid_uuid(val: str) -> bool:
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


@router.post("", response_model=ChatSessionDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_chat_session(
    req: ChatSessionCreateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Create a new chat conversation session."""
    session_id = req.session_id if (req.session_id and is_valid_uuid(req.session_id)) else str(uuid.uuid4())

    existing = await db.chat_sessions.find_one({"id": session_id})
    if existing:
        raise HTTPException(status_code=409, detail=f"Session {session_id} already exists")

    session = ChatSessionModel(
        id=session_id,
        user_id=req.user_id,
        title=req.title or "New Conversation",
        repo_name=req.repo_name,
        target_repo=req.target_repo,
        branch=req.branch or "main",
        workspace_id=req.workspace_id,
        repos=req.repos or [],
        status="active",
    )
    await db.chat_sessions.insert_one(session.model_dump())

    return ChatSessionDetailResponse(
        session_id=session.id,
        user_id=session.user_id,
        title=session.title,
        target_repo=session.target_repo,
        repo_name=session.repo_name,
        branch=session.branch,
        workspace_id=session.workspace_id,
        repos=session.repos,
        status=session.status,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=[],
        history=[],
    )


@router.get("", response_model=List[ChatSessionListItem])
async def list_chat_sessions(
    user_id: str = Query(..., description="GitHub/User ID"),
    workspace_id: Optional[str] = Query(None, description="Filter by workspace ID"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List recent chat sessions for a user."""
    query = {"user_id": user_id, "deleted_at": None}
    if workspace_id:
        query["workspace_id"] = workspace_id

    cursor = db.chat_sessions.find(query).sort("updated_at", DESCENDING).limit(limit)
    items = []
    async for doc in cursor:
        items.append(ChatSessionListItem(
            session_id=doc["id"],
            user_id=doc["user_id"],
            title=doc.get("title", "New Conversation"),
            target_repo=doc.get("target_repo"),
            repo_name=doc.get("repo_name"),
            branch=doc.get("branch", "main"),
            workspace_id=doc.get("workspace_id"),
            status=doc.get("status", "active"),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
            last_message_preview=None,
        ))
    return items


@router.get("/{session_id}", response_model=ChatSessionDetailResponse)
async def get_chat_session(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get full chat session detail and turn history."""
    doc = await db.chat_sessions.find_one({"id": session_id, "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Chat session not found")

    messages_cursor = db.chat_messages.find({"session_id": session_id}).sort("turn_index", ASCENDING)
    messages = []
    history = []
    async for m in messages_cursor:
        msg_resp = ChatMessageResponse(
            id=m["id"],
            session_id=m["session_id"],
            turn_index=m["turn_index"],
            role=m["role"],
            content=m.get("content"),
            payload=m.get("payload", {}),
            created_at=m["created_at"],
        )
        messages.append(msg_resp)
        history.append({
            "id": m["id"],
            "role": m["role"],
            "content": m.get("content"),
            "payload": m.get("payload", {}),
            "created_at": m["created_at"].isoformat() if hasattr(m["created_at"], "isoformat") else str(m["created_at"]),
        })

    return ChatSessionDetailResponse(
        session_id=doc["id"],
        user_id=doc["user_id"],
        title=doc.get("title", "New Conversation"),
        target_repo=doc.get("target_repo"),
        repo_name=doc.get("repo_name"),
        branch=doc.get("branch", "main"),
        workspace_id=doc.get("workspace_id"),
        repos=doc.get("repos", []),
        status=doc.get("status", "active"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
        messages=messages,
        history=history,
    )


@router.post("/{session_id}/messages")
async def post_message_to_session(
    session_id: str,
    req: MessagePostRequest,
    stream: bool = Query(True, description="Stream turns via SSE"),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Post prompt to agent session and stream back execution."""
    if stream:
        return StreamingResponse(
            turn_relay.run_turn_stream(
                session_id=session_id,
                prompt=req.prompt,
                user_id=req.user_id or "developer",
                allowed_tools=req.allowed_tools,
                max_turns=req.max_turns or 30,
                sandbox_url_override=req.sandbox_url,
                workspace_id=req.workspace_id,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    return {"message": "Non-streaming mode not supported. Set ?stream=true."}


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_session(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Soft delete chat session."""
    res = await db.chat_sessions.update_one(
        {"id": session_id},
        {"$set": {"deleted_at": current_utc_time()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return None
