import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional, List, Dict, Any
import httpx
from pymongo import ASCENDING, DESCENDING

from app.config import settings
from app.database import get_db
from app.models import ChatSessionModel, ChatMessageModel, current_utc_time

logger = logging.getLogger("podinino.turn_relay")


def to_valid_uuid(sid: str) -> str:
    try:
        return str(uuid.UUID(str(sid)))
    except Exception:
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, str(sid)))


class TurnRelayService:
    """
    Coordinates prompt streaming between client and stateless sandbox pod,
    while durably persisting user and assistant turns into MongoDB.
    """

    async def run_turn_stream(
        self,
        session_id: str,
        prompt: str,
        user_id: str,
        allowed_tools: Optional[List[str]] = None,
        max_turns: int = 30,
        sandbox_url_override: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        db = get_db()
        target_sandbox_url = "http://localhost:8000"
        target_workspace_id = workspace_id

        # 1. Verify or create session
        sess_doc = await db.chat_sessions.find_one({"id": session_id, "deleted_at": None})
        if not sess_doc:
            session_obj = ChatSessionModel(
                id=session_id,
                user_id=user_id,
                title=prompt[:40] if len(prompt) > 40 else prompt,
                workspace_id=workspace_id,
            )
            await db.chat_sessions.insert_one(session_obj.model_dump())
        else:
            update_fields = {}
            if sess_doc.get("title") == "New Conversation":
                update_fields["title"] = prompt[:40] if len(prompt) > 40 else prompt
            if workspace_id and not sess_doc.get("workspace_id"):
                update_fields["workspace_id"] = workspace_id
            if update_fields:
                await db.chat_sessions.update_one({"id": session_id}, {"$set": update_fields})
            if sess_doc.get("workspace_id"):
                target_workspace_id = sess_doc.get("workspace_id")

        # Turn calculation
        count = await db.chat_messages.count_documents({"session_id": session_id})
        turn_index = count + 1

        # 2. Persist User Turn in Mongo
        user_msg = ChatMessageModel(
            id=f"msg-{uuid.uuid4().hex[:12]}",
            session_id=session_id,
            turn_index=turn_index,
            role="user",
            content=prompt,
            payload={"user_id": user_id},
        )
        await db.chat_messages.insert_one(user_msg.model_dump())
        turn_index += 1

        if sandbox_url_override:
            target_sandbox_url = sandbox_url_override

        # 3. Stream from Sandbox Pod
        accumulated_text = []
        accumulated_thinking = []
        tools_used = []
        final_result = None
        turn_error = None

        pod_session_id = to_valid_uuid(session_id)
        pod_endpoint = f"{target_sandbox_url.rstrip('/')}/api/sessions/{pod_session_id}/messages?stream=true"
        logger.info(f"Relaying prompt for session {session_id} to sandbox pod: {pod_endpoint}")

        request_body = {
            "prompt": prompt,
            "allowed_tools": allowed_tools or ["bash", "read_file", "write_file", "edit_file", "git"],
            "max_turns": max_turns,
        }
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        if target_workspace_id:
            headers["X-Workspace-Id"] = target_workspace_id

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0)) as client:
                async with client.stream("POST", pod_endpoint, json=request_body, headers=headers) as response:
                    if response.status_code != 200:
                        err_bytes = await response.aread()
                        err_msg = f"Sandbox returned HTTP {response.status_code}: {err_bytes.decode('utf-8', errors='replace')}"
                        logger.error(err_msg)
                        turn_error = err_msg
                        yield f"data: {json.dumps({'type': 'error', 'error': err_msg})}\n\n"
                    else:
                        async for raw_line in response.aiter_lines():
                            if not raw_line:
                                continue
                            if raw_line.startswith("data: "):
                                payload_str = raw_line[6:].strip()
                                if payload_str == "[DONE]":
                                    yield "data: [DONE]\n\n"
                                    break
                                try:
                                    event = json.loads(payload_str)
                                    ev_type = event.get("type")
                                    if ev_type == "text":
                                        accumulated_text.append(event.get("content", ""))
                                    elif ev_type == "thinking":
                                        accumulated_thinking.append(event.get("content", ""))
                                    elif ev_type == "tool_use":
                                        tools_used.append(event)
                                    elif ev_type == "result":
                                        final_result = event.get("data", {})
                                    elif ev_type == "error":
                                        turn_error = event.get("message")
                                except Exception:
                                    pass
                            yield f"{raw_line}\n\n"

        except Exception as exc:
            logger.exception("Error in turn relay stream")
            turn_error = str(exc)
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"

        finally:
            full_text = "".join(accumulated_text)
            assistant_payload = {
                "thinking": "".join(accumulated_thinking),
                "tools": tools_used,
                "result": final_result,
                "error": turn_error,
                "model": "claude",
            }
            asst_msg = ChatMessageModel(
                id=f"msg-{uuid.uuid4().hex[:12]}",
                session_id=session_id,
                turn_index=turn_index,
                role="assistant",
                content=full_text if full_text else (f"Error: {turn_error}" if turn_error else ""),
                payload=assistant_payload,
            )
            await db.chat_messages.insert_one(asst_msg.model_dump())
            await db.chat_sessions.update_one(
                {"id": session_id},
                {"$set": {"updated_at": current_utc_time()}}
            )
            logger.info(f"Persisted turn {turn_index} for session {session_id} into MongoDB")


turn_relay = TurnRelayService()
