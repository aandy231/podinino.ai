from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator


class SkillCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Skill name")
    description: str = Field(..., min_length=5, max_length=1000, description="Short explanation of what the skill does")
    scope: str = Field("personal", description="Ownership scope: 'personal' or 'organization'")
    organization_id: Optional[str] = Field(None, description="Target organization ID for organization scope")
    content: Optional[str] = Field(None, description="Markdown SKILL.md content if sent directly as text")
    category: Optional[str] = Field("General", description="Category/grouping for the skill")
    tags: Optional[List[str]] = Field(default_factory=list, description="Descriptive tags")
    compatible_agents: Optional[List[str]] = Field(
        default_factory=lambda: ["claudeCode", "antigravity"],
        description="Supported agent harnesses"
    )

    @field_validator("scope")
    @classmethod
    def validate_scope(cls, v: str) -> str:
        v_clean = v.strip().lower()
        if v_clean not in ("personal", "organization"):
            raise ValueError("Scope must be either 'personal' or 'organization'")
        return v_clean


class SkillUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, min_length=5, max_length=1000)
    content: Optional[str] = Field(None, description="Updated SKILL.md markdown content")
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    compatible_agents: Optional[List[str]] = None


class SkillResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    scope: str
    owner_user_id: Optional[str] = None
    organization_id: Optional[str] = None
    organization_name: Optional[str] = None
    created_by: str
    version: int
    content_hash: str
    category: Optional[str] = "General"
    tags: List[str] = Field(default_factory=list)
    compatible_agents: List[str] = Field(default_factory=list)
    can_edit: bool = False
    can_delete: bool = False
    created_at: datetime
    updated_at: datetime


class SkillDetailResponse(SkillResponse):
    skill_content: str
    filename: str = "SKILL.md"


class SkillContentResponse(BaseModel):
    id: str
    name: str
    filename: str = "SKILL.md"
    version: int
    content_hash: str
    content: str


class SandboxSkillAssignRequest(BaseModel):
    skill_ids: List[str] = Field(..., min_length=1, description="List of Skill IDs to attach to the sandbox")


class SandboxSkillAssignmentResponse(BaseModel):
    id: str
    sandbox_id: str
    skill_id: str
    skill_name: str
    skill_version: int
    content_hash: str
    assigned_by: str
    assigned_at: datetime
    status: str


class SandboxRuntimeSkill(BaseModel):
    skill_id: str
    name: str
    slug: str
    filename: str = "SKILL.md"
    content: str
    version: int
    content_hash: str


class SandboxRuntimeSkillsResponse(BaseModel):
    sandbox_id: str
    skills: List[SandboxRuntimeSkill]
