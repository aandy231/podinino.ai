import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


def current_utc_time() -> datetime:
    return datetime.now(timezone.utc)


class UserModel(BaseModel):
    github_user_id: int
    username: str
    email: Optional[str] = None
    created_at: datetime = Field(default_factory=current_utc_time)
    updated_at: datetime = Field(default_factory=current_utc_time)


class WorkspaceModel(BaseModel):
    workspace_id: str
    user_id: str
    user_github_id: int
    storage_size: str
    repos: List[Dict[str, Any]] = Field(default_factory=list)
    status: str = "Provisioning"
    url: Optional[str] = None
    encrypted_password: Optional[str] = None
    password_salt: Optional[str] = None
    created_at: datetime = Field(default_factory=current_utc_time)
    updated_at: datetime = Field(default_factory=current_utc_time)
    deleted_at: Optional[datetime] = None


class WorkspaceEventModel(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    workspace_id: str
    event_type: str
    message: str
    created_at: datetime = Field(default_factory=current_utc_time)


class SkillModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    prompt_content: str
    tags: List[str] = Field(default_factory=list)
    is_public: bool = True
    author_id: str
    created_at: datetime = Field(default_factory=current_utc_time)
    updated_at: datetime = Field(default_factory=current_utc_time)


class ChatSessionModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    repo_name: Optional[str] = None
    target_repo: Optional[str] = None
    branch: Optional[str] = "main"
    title: str = "New Conversation"
    workspace_id: Optional[str] = None
    repos: List[Dict[str, Any]] = Field(default_factory=list)
    status: str = "active"
    created_at: datetime = Field(default_factory=current_utc_time)
    updated_at: datetime = Field(default_factory=current_utc_time)
    deleted_at: Optional[datetime] = None


class ChatMessageModel(BaseModel):
    id: str = Field(default_factory=lambda: f"msg-{uuid.uuid4().hex[:12]}")
    session_id: str
    turn_index: int
    role: str
    content: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=current_utc_time)
