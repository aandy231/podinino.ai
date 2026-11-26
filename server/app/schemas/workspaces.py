from typing import Optional, Union, List, Dict, Any
from pydantic import BaseModel, Field, field_validator, AliasChoices
import re
from uuid import UUID
from datetime import datetime

class RepoConfig(BaseModel):
    name: Optional[str] = None
    git_url: str
    branch: Optional[str] = "main"
    full_name: Optional[str] = None
    github_token: Optional[str] = None
    github_pat: Optional[str] = None

class QuotaStatusResponse(BaseModel):
    owner_id: Optional[str] = None
    active_count: int
    limit: int
    available: int

class WorkspaceCreateRequest(BaseModel):
    workspace_id: str = Field(
        ..., 
        description="Unique identifier for the workspace. Will be sanitized to comply with K8s requirements.",
        json_schema_extra={"example": "my-project-dev"}
    )
    name: Optional[str] = Field(
        None,
        description="Human-readable name for the sandbox workspace."
    )
    owner_id: Optional[str] = Field(
        None,
        description="User/Developer ID owning this sandbox."
    )
    org_id: Optional[str] = Field(
        None,
        description="Organization ID the workspace belongs to (defaults to user's personal org if omitted)."
    )
    team_id: Optional[str] = Field(
        None,
        description="Team ID the workspace belongs to (defaults to user's personal team if omitted)."
    )
    github_token: Optional[str] = Field(
        None,
        description="GitHub personal access token or OAuth token for private repository access."
    )
    github_pat: Optional[str] = Field(
        None,
        description="Alias for github_token."
    )
    repos: Optional[List[RepoConfig]] = Field(
        default_factory=list,
        description="List of repositories to clone into this sandbox."
    )
    skill_ids: Optional[List[str]] = Field(
        default_factory=list,
        description="Optional list of Skill IDs to attach to this sandbox."
    )
    harness: Optional[str] = Field(
        "claude-code",
        description="AI Agent harness runtime (claude-code or github-copilot)."
    )
    storage_size: str = Field(
        "10Gi", 
        description="Requested size for the PersistentVolumeClaim (PVC).",
        json_schema_extra={"example": "10Gi"}
    )
    cpu_request: str = Field(
        "100m", 
        description="Requested CPU resource for the sandbox container."
    )
    memory_request: str = Field(
        "256Mi", 
        description="Requested Memory resource for the sandbox container."
    )
    cpu_limit: str = Field(
        "1000m", 
        description="CPU limit for the sandbox container."
    )
    memory_limit: str = Field(
        "2Gi", 
        description="Memory limit for the sandbox container."
    )

    @field_validator("workspace_id")
    @classmethod
    def validate_workspace_id(cls, v: str) -> str:
        # Check if ID contains alphanumeric and hyphens and is at least 3 characters
        if len(v) < 3:
            raise ValueError("workspace_id must be at least 3 characters long")
        # Ensure it doesn't start with symbols
        if not re.match(r"^[a-zA-Z0-9]", v):
            raise ValueError("workspace_id must start with an alphanumeric character")
        return v

    @field_validator("storage_size")
    @classmethod
    def validate_storage_size(cls, v: str) -> str:
        # Validate standard Kubernetes resource sizes (e.g. 10Gi, 500Mi)
        if not re.match(r"^\d+(Gi|Mi|Ki|Li|Ti|Pi|Ei)?$", v):
            raise ValueError("Invalid storage size format. Use format like '10Gi' or '500Mi'.")
        return v


class WorkspaceCreateResponse(BaseModel):
    workspace_id: str
    name: Optional[str] = None
    owner_id: Optional[str] = None
    org_id: Optional[str] = None
    team_id: Optional[str] = None
    repos: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    skill_ids: Optional[List[str]] = Field(default_factory=list)
    harness: Optional[str] = "claude-code"
    namespace: str
    workspace_url: str
    agent_api_url: Optional[str] = None
    code_server_url: Optional[str] = None
    password: str
    status: str
    phase: Optional[str] = "Provisioning"
    pvc_name: str
    deployment_name: str
    service_name: str
    ingress_name: str
    created_at: Optional[datetime] = None


class WorkspaceDetailResponse(BaseModel):
    workspace_id: str
    name: Optional[str] = None
    owner_id: Optional[str] = None
    org_id: Optional[str] = None
    team_id: Optional[str] = None
    repos: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    skill_ids: Optional[List[str]] = Field(default_factory=list)
    harness: Optional[str] = "claude-code"
    namespace: str
    workspace_url: str
    agent_api_url: Optional[str] = None
    code_server_url: Optional[str] = None
    status: str
    phase: Optional[str] = None
    pvc_name: str
    deployment_name: str
    service_name: str
    ingress_name: str
    available_replicas: int
    ready_replicas: int
    created_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class WorkspaceDeleteResponse(BaseModel):
    workspace_id: str
    status: str
    message: str


# --- Organization Schemas ---

class OrganizationCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    slug: Optional[str] = None
    billing_email: Optional[str] = None
    settings: Optional[Dict[str, Any]] = Field(default_factory=dict)


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    is_personal: bool = False
    billing_email: Optional[str] = None
    user_role: Optional[str] = None
    created_at: datetime


# --- Team Schemas ---

class TeamCreateRequest(BaseModel):
    org_id: str
    name: str = Field(..., min_length=2, max_length=100)
    slug: Optional[str] = None
    description: Optional[str] = ""
    monthly_budget_usd: Optional[float] = 250.0
    max_concurrent_sandboxes: Optional[int] = 6


class TeamResponse(BaseModel):
    id: str
    org_id: str
    name: str
    slug: str
    description: str = ""
    monthly_budget_usd: float = 250.0
    max_concurrent_sandboxes: int = 6
    user_role: Optional[str] = None  # Role of calling user: 'team_lead', 'team_member', etc.
    member_count: Optional[int] = 0
    active_sandbox_count: Optional[int] = 0
    created_at: datetime


class TeamMemberAddRequest(BaseModel):
    user_id: str
    role: str = Field("team_member", description="Role: 'team_lead', 'team_member', or 'team_viewer'")


class TeamMembershipResponse(BaseModel):
    id: str
    org_id: str
    team_id: str
    user_id: str
    role: str
    joined_at: datetime


class UserContextResponse(BaseModel):
    user_id: str
    personal_org: Dict[str, Any]
    personal_team: Dict[str, Any]
    organizations: List[Dict[str, Any]]
    teams: List[Dict[str, Any]]


# --- AI Usage & Analytics Schemas ---

class AIUsageEventRequest(BaseModel):
    workspace_id: str
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    team_id: Optional[str] = None
    org_id: Optional[str] = None
    turn_index: Optional[int] = None
    provider: str = "anthropic"
    model: str = "claude"
    total_cost_usd: float = 0.0
    duration_ms: int = 0
    num_turns: int = 1
    stop_reason: Optional[str] = "end_turn"
    timestamp: Optional[datetime] = None


class AIUsageEventResponse(BaseModel):
    status: str = "recorded"
    record_id: str


class TeamAnalyticsResponse(BaseModel):
    team_id: str
    team_name: str
    org_id: str
    monthly_budget_usd: float
    current_period_spend_usd: float
    budget_remaining_usd: float
    total_turns: int
    total_duration_ms: int
    by_developer: List[Dict[str, Any]]
    by_sandbox: List[Dict[str, Any]]
    daily_trend: List[Dict[str, Any]]


class OrgAnalyticsResponse(BaseModel):
    org_id: str
    org_name: str
    total_spend_usd: float
    total_turns: int
    total_active_sandboxes: int
    by_team: List[Dict[str, Any]]
    by_developer: List[Dict[str, Any]]
    daily_trend: List[Dict[str, Any]]


class DeveloperAnalyticsResponse(BaseModel):
    user_id: str
    total_spend_usd: float
    total_turns: int
    by_team: List[Dict[str, Any]]
    by_sandbox: List[Dict[str, Any]]
    daily_trend: List[Dict[str, Any]]


