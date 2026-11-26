from typing import Any, Literal, Optional, Union
from pydantic import BaseModel, Field
import time


class RepoCloneRequest(BaseModel):
    """Request to clone a repository into the workspace."""
    git_url: str = Field(..., description="Remote git repository URL (HTTPS or SSH)")
    branch: Optional[str] = Field(None, description="Branch to checkout")
    repo_name: Optional[str] = Field(None, description="Optional folder name inside workspace (defaults to repo name from URL)")
    create_branch: Optional[str] = Field(None, description="Create and switch to a new branch, e.g. hotfix/AUTH-1024")
    github_token: Optional[str] = Field(None, description="Optional GitHub Personal Access Token or OAuth token for private repos")


class SessionCreateRequest(BaseModel):
    """Request to create or initialize an agent session with multi-repo support."""
    ticket_id: Optional[str] = Field(None, description="Optional ticket/issue ID e.g. AUTH-1024")
    target_repo: Optional[str] = Field(None, description="Primary repository name for cwd in multi-repo workspace")
    git_url: Optional[str] = Field(None, description="Primary git URL to clone into workspace (or into workspace/<repo_name>)")
    branch: Optional[str] = Field(None, description="Git branch to checkout for the primary repo")
    github_token: Optional[str] = Field(None, description="GitHub token for private repository authentication")
    repos: Optional[list[Union[RepoCloneRequest, str]]] = Field(None, description="List of repositories or repository names for this sandbox session")
    session_name: Optional[str] = Field(None, description="Human-readable title or tag for this session")
    workspace_dir: Optional[str] = Field(None, description="Override target workspace directory (defaults to pod config)")
    permission_mode: Optional[str] = Field(None, description="Permission mode: 'acceptEdits' or 'bypassPermissions'")
    model: Optional[str] = Field(None, description="Claude model override, e.g. sonnet or haiku")
    system_prompt: Optional[str] = Field(None, description="Custom system prompt instructions")


class SessionResponse(BaseModel):
    """Metadata response for a created or active session."""
    session_id: str
    session_name: Optional[str] = None
    ticket_id: Optional[str] = None
    target_repo: Optional[str] = None
    workspace_dir: str
    git_url: Optional[str] = None
    git_branch: Optional[str] = None
    repos: list[str] = Field(default_factory=list, description="List of repository names present in the workspace")
    created_at: float = Field(default_factory=time.time)


class SessionInfoResponse(BaseModel):
    """Summary information for an existing session."""
    session_id: str
    summary: Optional[str] = None
    custom_title: Optional[str] = None
    git_branch: Optional[str] = None
    cwd: Optional[str] = None
    created_at: Optional[int] = None
    last_modified: Optional[int] = None
    message_count: int = 0


class MessagePostRequest(BaseModel):
    """Request to post a message/prompt to the agent in an existing session."""
    prompt: str = Field(..., description="Prompt or instruction for the coding agent")
    allowed_tools: Optional[list[str]] = Field(
        default=["Read", "Edit", "Write", "Glob", "Grep", "Bash"],
        description="List of tools to auto-approve without prompting",
    )
    max_turns: Optional[int] = Field(None, description="Maximum agentic turns for this query")


class MessageSyncResponse(BaseModel):
    """Synchronous JSON response when stream=false."""
    session_id: str
    status: Literal["success", "error", "interrupted"]
    response_text: str = ""
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    total_cost_usd: Optional[float] = None
    duration_ms: Optional[int] = None
    num_turns: Optional[int] = None


class GitCloneRequest(BaseModel):
    """Request to clone a git repository into the workspace."""
    git_url: str = Field(..., description="Remote git repository URL (HTTPS or SSH)")
    branch: Optional[str] = Field(None, description="Specific branch to clone or checkout")
    repo_name: Optional[str] = Field(None, description="Folder name inside workspace")
    create_branch: Optional[str] = Field(None, description="Create new branch if specified")
    github_token: Optional[str] = Field(None, description="Optional GitHub token for private repository authentication")


class GitCheckoutRequest(BaseModel):
    """Request to checkout or create a git branch."""
    branch: str = Field(..., description="Branch name to checkout")
    create_if_missing: bool = Field(False, description="Create new branch if it does not exist")
    checkout_from: Optional[str] = Field(None, description="Source/base branch to checkout from")


class GitCommitInfo(BaseModel):
    """Details of a git commit."""
    hash: str
    message: str
    author: str
    date: str


class GitStatusResponse(BaseModel):
    """Git status summary for a repository or the workspace."""
    is_repo: bool
    branch: Optional[str] = None
    is_clean: bool = True
    modified_files: list[str] = Field(default_factory=list)
    staged_files: list[str] = Field(default_factory=list)
    untracked_files: list[str] = Field(default_factory=list)
    latest_commit: Optional[GitCommitInfo] = None


class GitDiffResponse(BaseModel):
    """Git diff summary for uncommitted changes."""
    diff: str
    files_changed: list[str] = Field(default_factory=list)


class RepoSummary(BaseModel):
    """Summary of a repository within a multi-repo workspace."""
    name: str
    path: str
    git_url: Optional[str] = None
    branch: Optional[str] = None
    is_clean: bool = True
    modified_files_count: int = 0
    latest_commit: Optional[GitCommitInfo] = None


class WorkspaceReposResponse(BaseModel):
    """Response containing all repositories within the workspace."""
    workspace_dir: str
    repositories: list[RepoSummary] = Field(default_factory=list)
    code_workspace_file: Optional[str] = None


class IdeConfigResponse(BaseModel):
    """Configuration for code-server / IDE access."""
    code_server_url: str
    workspace_dir: str
    code_workspace_file: Optional[str] = None
    status: str = "available"


class SSEEvent(BaseModel):
    """Standardized Server-Sent Event wrapper."""
    event: str
    data: dict[str, Any]

    def to_sse_str(self) -> str:
        """Format as standard text/event-stream line."""
        import json
        return f"event: {self.event}\ndata: {json.dumps(self.data)}\n\n"


class WorkspaceSkillItem(BaseModel):
    skill_id: str
    name: str
    slug: Optional[str] = None
    filename: str = "SKILL.md"
    content: str
    version: Optional[int] = 1


class WorkspaceSkillsSyncRequest(BaseModel):
    skills: list[WorkspaceSkillItem] = Field(default_factory=list)


class WorkspaceSkillsSyncResponse(BaseModel):
    status: str = "success"
    synchronized_count: int
    skills: list[dict[str, Any]]

