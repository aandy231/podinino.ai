import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.config import settings
from app.models.schemas import (
    GitCheckoutRequest,
    GitCloneRequest,
    GitDiffResponse,
    GitStatusResponse,
    IdeConfigResponse,
    RepoCloneRequest,
    WorkspaceReposResponse,
    WorkspaceSkillsSyncRequest,
    WorkspaceSkillsSyncResponse,
)
import re
from app.services.git_manager import (
    GitError,
    GitManager,
    WorkspaceGitManager,
    parse_repo_name_from_url,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Workspace & Repositories"])


def get_git_manager(workspace_dir: str | None = None) -> GitManager:
    path = (
        Path(workspace_dir).resolve()
        if workspace_dir
        else settings.resolved_workspace_path
    )
    return GitManager(path)


def get_workspace_git_manager(workspace_dir: str | None = None) -> WorkspaceGitManager:
    path = (
        Path(workspace_dir).resolve()
        if workspace_dir
        else settings.resolved_workspace_path
    )
    return WorkspaceGitManager(path)


# ==========================================
# Multi-Repo Management Endpoints (/api/repos)
# ==========================================


@router.get("/api/repos", response_model=WorkspaceReposResponse)
async def list_workspace_repositories(
    workspace_dir: Optional[str] = Query(None, description="Optional workspace directory override")
) -> WorkspaceReposResponse:
    """List all cloned repositories in the workspace, their branches, dirty status, and code-workspace file."""
    ws_mgr = get_workspace_git_manager(workspace_dir)
    return await ws_mgr.get_workspace_repos_summary()


@router.post("/api/repos", status_code=status.HTTP_201_CREATED)
async def clone_into_workspace(
    request: RepoCloneRequest,
    workspace_dir: Optional[str] = Query(None, description="Optional workspace directory override")
):
    """
    Clone a repository into a subfolder of /workspace (/workspace/<repo_name>).
    Automatically updates /workspace/workspace.code-workspace for code-server multi-root support.
    """
    ws_mgr = get_workspace_git_manager(workspace_dir)
    try:
        repo_name, branch = await ws_mgr.clone_repo(
            git_url=request.git_url,
            branch=request.branch,
            repo_name=request.repo_name,
            create_branch=request.create_branch,
            github_token=request.github_token,
        )
        return {
            "status": "success",
            "repo_name": repo_name,
            "branch": branch,
            "path": str(ws_mgr.workspace_path / repo_name),
            "code_workspace_file": str(ws_mgr.workspace_path / "workspace.code-workspace"),
        }
    except GitError as e:
        logger.error(f"Failed to clone repo {request.git_url}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/api/repos/{repo_name}/git-status", response_model=GitStatusResponse)
async def get_repo_git_status(
    repo_name: str,
    workspace_dir: Optional[str] = Query(None, description="Optional workspace directory override")
) -> GitStatusResponse:
    """Get Git status for a specific repository within the workspace."""
    ws_mgr = get_workspace_git_manager(workspace_dir)
    repo_mgr = ws_mgr.get_repo_manager(repo_name)
    if not await repo_mgr.is_repo():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{repo_name}' is not found or not an initialized git repo.",
        )
    return await repo_mgr.get_status()


@router.get("/api/repos/{repo_name}/git-diff", response_model=GitDiffResponse)
async def get_repo_git_diff(
    repo_name: str,
    workspace_dir: Optional[str] = Query(None, description="Optional workspace directory override")
) -> GitDiffResponse:
    """Get uncommitted git diff for a specific repository within the workspace."""
    ws_mgr = get_workspace_git_manager(workspace_dir)
    repo_mgr = ws_mgr.get_repo_manager(repo_name)
    if not await repo_mgr.is_repo():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{repo_name}' is not found or not an initialized git repo.",
        )
    return await repo_mgr.get_diff()


@router.post("/api/repos/{repo_name}/git-checkout")
async def checkout_repo_branch(
    repo_name: str,
    request: GitCheckoutRequest,
    workspace_dir: Optional[str] = Query(None, description="Optional workspace directory override")
):
    """Checkout or create a branch in a specific repository within the workspace."""
    ws_mgr = get_workspace_git_manager(workspace_dir)
    repo_mgr = ws_mgr.get_repo_manager(repo_name)
    if not await repo_mgr.is_repo():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{repo_name}' is not found or not an initialized git repo.",
        )
    try:
        branch = await repo_mgr.checkout(request.branch, request.create_if_missing, request.checkout_from)
        return {
            "status": "success",
            "repo_name": repo_name,
            "branch": branch,
            "path": str(repo_mgr.repo_path),
        }
    except GitError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/api/repos/{repo_name}/branches")
async def list_repo_branches(
    repo_name: str,
    workspace_dir: Optional[str] = Query(None, description="Optional workspace directory override")
):
    """List all available git branches for a specific repository."""
    ws_mgr = get_workspace_git_manager(workspace_dir)
    repo_mgr = ws_mgr.get_repo_manager(repo_name)
    branches = await repo_mgr.get_branches()
    return {"repo_name": repo_name, "branches": branches}


# ==========================================
# Legacy / Workspace-Level Endpoints
# ==========================================


@router.get("/api/workspace/git-status", response_model=GitStatusResponse)
async def get_workspace_git_status(
    workspace_dir: str | None = Query(None, description="Optional workspace directory override"),
    repo_name: str | None = Query(None, description="Optional target repo name in multi-repo workspace")
) -> GitStatusResponse:
    """Get Git status of the workspace (or target repo in multi-repo mode)."""
    ws_mgr = get_workspace_git_manager(workspace_dir)
    return await ws_mgr.get_overall_status(target_repo=repo_name)


@router.get("/api/workspace/git-diff", response_model=GitDiffResponse)
async def get_workspace_git_diff(
    workspace_dir: str | None = Query(None, description="Optional workspace directory override"),
    repo_name: str | None = Query(None, description="Optional target repo name in multi-repo workspace")
) -> GitDiffResponse:
    """Get unified git diff of all uncommitted workspace changes (or target repo in multi-repo mode)."""
    ws_mgr = get_workspace_git_manager(workspace_dir)
    return await ws_mgr.get_overall_diff(target_repo=repo_name)


@router.post("/api/workspace/git-clone")
async def clone_repository(
    request: GitCloneRequest,
    workspace_dir: str | None = Query(None, description="Optional workspace directory override")
):
    """Clone a remote git repository into the workspace (into subfolder if repo_name specified)."""
    ws_mgr = get_workspace_git_manager(workspace_dir)
    try:
        if request.repo_name:
            repo_name, branch = await ws_mgr.clone_repo(
                git_url=request.git_url,
                branch=request.branch,
                repo_name=request.repo_name,
                create_branch=request.create_branch,
                github_token=request.github_token,
            )
            return {
                "status": "success",
                "repo_name": repo_name,
                "git_url": request.git_url,
                "branch": branch,
                "workspace_dir": str(ws_mgr.workspace_path / repo_name),
            }
        else:
            mgr = get_git_manager(workspace_dir)
            branch = await mgr.clone_or_checkout(
                git_url=request.git_url,
                branch=request.branch,
                create_branch=request.create_branch,
                github_token=request.github_token,
            )
            return {
                "status": "success",
                "git_url": request.git_url,
                "branch": branch,
                "workspace_dir": str(mgr.workspace_path),
            }
    except GitError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/api/workspace/git-checkout")
async def checkout_branch(
    request: GitCheckoutRequest,
    workspace_dir: str | None = Query(None, description="Optional workspace directory override")
):
    """Checkout or create a git branch in the workspace."""
    mgr = get_git_manager(workspace_dir)
    try:
        branch = await mgr.checkout(request.branch, request.create_if_missing, request.checkout_from)
        return {
            "status": "success",
            "branch": branch,
            "workspace_dir": str(mgr.workspace_path),
        }
    except GitError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/api/ide/config", response_model=IdeConfigResponse)
async def get_ide_config(
    workspace_dir: str | None = Query(None, description="Optional workspace directory override")
) -> IdeConfigResponse:
    """Retrieve code-server / IDE connection details, including code-workspace file if present."""
    ws_mgr = get_workspace_git_manager(workspace_dir)
    code_workspace_file = ws_mgr.workspace_path / "workspace.code-workspace"

    return IdeConfigResponse(
        code_server_url=settings.code_server_url,
        workspace_dir=str(ws_mgr.workspace_path),
        code_workspace_file=str(code_workspace_file) if code_workspace_file.exists() else None,
        status="available",
    )


@router.post("/api/workspace/skills", response_model=WorkspaceSkillsSyncResponse, status_code=status.HTTP_201_CREATED)
async def sync_workspace_skills(
    request: WorkspaceSkillsSyncRequest,
    workspace_dir: str | None = Query(None, description="Optional workspace directory override")
) -> WorkspaceSkillsSyncResponse:
    """
    Materializes authorized skills into the sandbox container filesystem.
    Places SKILL.md under:
    1. /workspace/.claude/skills/<skill-slug>/SKILL.md (project-level Claude Code skills)
    2. /workspace/.agents/skills/<skill-slug>/SKILL.md (standard multi-agent skills)
    3. ~/.claude/skills/<skill-slug>/SKILL.md (global user Claude Code skills)
    """
    ws_mgr = get_workspace_git_manager(workspace_dir)
    ws_path = ws_mgr.workspace_path

    # Candidate global directories
    global_paths = [
        Path.home() / ".claude" / "skills",
        Path("/home/developer/.claude/skills"),
    ]

    synced_items = []
    for skill in request.skills:
        raw_slug = skill.slug or skill.name
        clean_slug = re.sub(r"[^a-zA-Z0-9_-]", "-", raw_slug).strip("-").lower()
        if not clean_slug:
            clean_slug = f"skill-{re.sub(r'[^a-zA-Z0-9]', '', skill.skill_id)[:8]}"

        # Prevent path traversal
        if ".." in clean_slug or "/" in clean_slug or "\\" in clean_slug:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid skill slug '{clean_slug}': path traversal is strictly prohibited."
            )

        content = skill.content

        # 1. Project level: .claude/skills/<slug>/SKILL.md
        project_skill_dir = ws_path / ".claude" / "skills" / clean_slug
        project_skill_dir.mkdir(parents=True, exist_ok=True)
        (project_skill_dir / "SKILL.md").write_text(content, encoding="utf-8")

        # 2. General agent standard: .agents/skills/<slug>/SKILL.md
        agent_skill_dir = ws_path / ".agents" / "skills" / clean_slug
        agent_skill_dir.mkdir(parents=True, exist_ok=True)
        (agent_skill_dir / "SKILL.md").write_text(content, encoding="utf-8")

        # 3. Global user directories (if writable)
        for g_path in global_paths:
            try:
                g_skill_dir = g_path / clean_slug
                g_skill_dir.mkdir(parents=True, exist_ok=True)
                (g_skill_dir / "SKILL.md").write_text(content, encoding="utf-8")
            except Exception as e:
                logger.debug(f"Could not write to global skill path {g_path}: {e}")

        synced_items.append({
            "skill_id": skill.skill_id,
            "name": skill.name,
            "slug": clean_slug,
            "path": str(project_skill_dir / "SKILL.md"),
            "status": "synchronized"
        })

    logger.info(f"Successfully synchronized {len(synced_items)} skills into sandbox {ws_path}")
    return WorkspaceSkillsSyncResponse(
        status="success",
        synchronized_count=len(synced_items),
        skills=synced_items
    )


@router.get("/api/workspace/skills")
async def list_installed_workspace_skills(
    workspace_dir: str | None = Query(None, description="Optional workspace directory override")
):
    """
    Lists skills installed and active in this sandbox.
    """
    ws_mgr = get_workspace_git_manager(workspace_dir)
    ws_path = ws_mgr.workspace_path
    skills_dir = ws_path / ".claude" / "skills"

    installed = []
    if skills_dir.exists() and skills_dir.is_dir():
        for item in skills_dir.iterdir():
            if item.is_dir():
                skill_file = item / "SKILL.md"
                if skill_file.exists():
                    installed.append({
                        "slug": item.name,
                        "path": str(skill_file),
                        "size_bytes": skill_file.stat().st_size
                    })

    return {
        "workspace_dir": str(ws_path),
        "installed_count": len(installed),
        "skills": installed
    }

