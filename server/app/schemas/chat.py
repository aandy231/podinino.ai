from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ChatSessionCreateRequest(BaseModel):
    user_id: str
    title: Optional[str] = "New Conversation"
    repo_name: Optional[str] = None
    target_repo: Optional[str] = None
    branch: Optional[str] = "main"
    workspace_id: Optional[str] = None
    repos: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    session_id: Optional[str] = None


class ChatSessionListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_id: str
    user_id: str
    title: str
    target_repo: Optional[str] = None
    repo_name: Optional[str] = None
    branch: Optional[str] = "main"
    workspace_id: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    last_message_preview: Optional[str] = None


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    turn_index: int
    role: str
    content: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class ChatSessionDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_id: str
    user_id: str
    title: str
    target_repo: Optional[str] = None
    repo_name: Optional[str] = None
    branch: Optional[str] = "main"
    workspace_id: Optional[str] = None
    repos: List[Any] = Field(default_factory=list)
    status: str
    created_at: datetime
    updated_at: datetime
    messages: List[ChatMessageResponse] = Field(default_factory=list)
    history: List[Dict[str, Any]] = Field(default_factory=list)


# Alias for convenience
ChatSessionResponse = ChatSessionDetailResponse


class MessagePostRequest(BaseModel):
    user_id: Optional[str] = "developer"
    prompt: str
    allowed_tools: Optional[List[str]] = None
    max_turns: Optional[int] = 30
    sandbox_url: Optional[str] = None
    workspace_id: Optional[str] = None

