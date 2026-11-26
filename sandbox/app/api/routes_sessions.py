import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.config import settings
from app.models.schemas import (
    MessagePostRequest,
    MessageSyncResponse,
    SessionCreateRequest,
    SessionInfoResponse,
    SessionResponse,
)
from app.services.agent_runner import agent_runner
from app.services.git_manager import (
    GitError,
    GitManager,
    WorkspaceGitManager,
    parse_repo_name_from_url,
)
from app.services.session_manager import session_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sessions", tags=["Sessions"])


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(request: SessionCreateRequest) -> SessionResponse:
    """
    Create or initialize an agent session.
    Supports single-repo or multi-repo sandboxes:
    - If repos list is provided, clones all specified repositories into /workspace/<repo_name>.
    - If single git_url is provided, clones into /workspace/<repo_name>.
    - Automatically manages /workspace/workspace.code-workspace for code-server multi-root support.
    """
    workspace_path = (
        Path(request.workspace_dir).resolve()
        if request.workspace_dir
        else settings.resolved_workspace_path
    )
    workspace_path.mkdir(parents=True, exist_ok=True)
    ws_mgr = WorkspaceGitManager(workspace_path)

    git_branch: Optional[str] = request.branch
    target_repo: Optional[str] = request.target_repo
    explicit_repos: list[str] = []

    # 1. Batch clone if multiple repos provided
    if request.repos:
        for repo_item in request.repos:
            if isinstance(repo_item, str):
                explicit_repos.append(repo_item)
                continue

            logger.info(f"Cloning repo {repo_item.git_url} into sandbox {workspace_path}")
            try:
                repo_token = getattr(repo_item, "github_token", None) or request.github_token
                cloned_name, active_branch = await ws_mgr.clone_repo(
                    git_url=repo_item.git_url,
                    branch=repo_item.branch,
                    repo_name=repo_item.repo_name,
                    create_branch=repo_item.create_branch,
                    github_token=repo_token,
                )
                explicit_repos.append(cloned_name)
                if not target_repo:
                    target_repo = cloned_name
                    git_branch = active_branch
            except GitError as e:
                logger.error(f"Git clone error for {repo_item.git_url}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to clone repository {repo_item.git_url}: {str(e)}",
                )

    # 2. Single git_url clone
    elif request.git_url:
        logger.info(f"Cloning single git repo {request.git_url} into sandbox {workspace_path}")
        try:
            repo_name = target_repo or parse_repo_name_from_url(request.git_url)
            cloned_name, active_branch = await ws_mgr.clone_repo(
                git_url=request.git_url,
                branch=request.branch,
                repo_name=repo_name,
                github_token=request.github_token,
            )
            explicit_repos.append(cloned_name)
            target_repo = cloned_name
            git_branch = active_branch
        except GitError as e:
            logger.error(f"Git clone error: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to clone git repository: {str(e)}",
            )

    all_repos = ws_mgr.list_repositories()
    if not target_repo and all_repos:
        target_repo = all_repos[0] if all_repos[0] != "." else None

    # Update code-workspace file for code-server
    ws_mgr.update_code_workspace_file()

    active_repos = explicit_repos if explicit_repos else ([target_repo] if target_repo else all_repos)

    session = session_manager.create_session(
        workspace_path=workspace_path,
        git_url=request.git_url,
        git_branch=git_branch,
        ticket_id=request.ticket_id,
        target_repo=target_repo,
        repos=active_repos,
        session_name=request.session_name,
        model=request.model,
        permission_mode=request.permission_mode,
    )

    return session


@router.get("", response_model=list[SessionInfoResponse])
async def list_sessions(limit: int = Query(20, ge=1, le=100)) -> list[SessionInfoResponse]:
    """List recent agent sessions and their metadata."""
    return session_manager.list_all_sessions(
        directory=settings.resolved_workspace_path,
        limit=limit,
    )


@router.get("/{session_id}")
async def get_session(session_id: str):
    """Retrieve details and past message history for a specific session."""
    context = session_manager.get_context(session_id)
    workspace_path = context.workspace_path if context else settings.resolved_workspace_path
    history = session_manager.get_session_history(session_id, directory=workspace_path)

    return {
        "session_id": session_id,
        "is_active": context.is_running if context else False,
        "ticket_id": context.ticket_id if context else None,
        "target_repo": context.target_repo if context else None,
        "repos": context.repos if context else WorkspaceGitManager(workspace_path).list_repositories(),
        "workspace_dir": str(workspace_path),
        "git_url": context.git_url if context else None,
        "git_branch": context.git_branch if context else None,
        "history": history,
    }


@router.post("/{session_id}/messages")
async def post_message(
    session_id: str,
    request: MessagePostRequest,
    stream: bool = Query(True, description="Stream real-time SSE events (true) or wait for completion (false)"),
):
    """
    Post a prompt/message to the agent.
    - If stream=true (default): streams text/event-stream SSE events.
    - If stream=false: waits and returns aggregated JSON.
    """
    context = session_manager.get_context(session_id)
    if not context:
        # Auto-recover context for an existing session ID
        context = session_manager.ensure_context(
            session_id=session_id,
            workspace_path=settings.resolved_workspace_path,
        )

    if context.is_running:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A turn is already in progress for this session. Interrupt or wait for completion.",
        )

    if stream:
        return StreamingResponse(
            agent_runner.run_stream(
                context=context,
                prompt=request.prompt,
                allowed_tools=request.allowed_tools,
                max_turns=request.max_turns,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    else:
        sync_result: MessageSyncResponse = await agent_runner.run_sync(
            context=context,
            prompt=request.prompt,
            allowed_tools=request.allowed_tools,
            max_turns=request.max_turns,
        )
        return sync_result


@router.post("/{session_id}/interrupt")
async def interrupt_session(session_id: str):
    """Interrupt the current active turn for a session."""
    success = await session_manager.interrupt_session(session_id)
    return {
        "session_id": session_id,
        "interrupted": success,
        "status": "interrupted" if success else "not_running",
    }


@router.delete("/{session_id}")
async def close_session(session_id: str):
    """Close and disconnect the agent client for a session."""
    await session_manager.close_session(session_id)
    return {
        "session_id": session_id,
        "status": "closed",
    }
