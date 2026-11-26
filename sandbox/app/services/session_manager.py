import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from claude_agent_sdk import (
    ClaudeAgentOptions,
    ClaudeSDKClient,
    get_session_info,
    get_session_messages,
    list_sessions,
    rename_session,
    tag_session,
)
from app.config import settings
from app.models.schemas import SessionInfoResponse, SessionResponse
from app.services.git_manager import WorkspaceGitManager

logger = logging.getLogger(__name__)


@dataclass
class ActiveSessionContext:
    """Tracks state and live connection for an active agent session."""
    session_id: str
    workspace_path: Path
    git_url: Optional[str] = None
    git_branch: Optional[str] = None
    ticket_id: Optional[str] = None
    target_repo: Optional[str] = None
    repos: list[str] = field(default_factory=list)
    session_name: Optional[str] = None
    model: Optional[str] = None
    permission_mode: Optional[str] = None
    client: Optional[ClaudeSDKClient] = None
    is_running: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class SessionManager:
    """Manages active Claude agent sessions and transcripts."""

    def __init__(self):
        # In-memory pool of active session contexts
        self._sessions: dict[str, ActiveSessionContext] = {}

    def create_session(
        self,
        workspace_path: Path,
        session_id: Optional[str] = None,
        git_url: Optional[str] = None,
        git_branch: Optional[str] = None,
        ticket_id: Optional[str] = None,
        target_repo: Optional[str] = None,
        repos: Optional[list[str]] = None,
        session_name: Optional[str] = None,
        model: Optional[str] = None,
        permission_mode: Optional[str] = None,
    ) -> SessionResponse:
        """Register a new session context."""
        sid = session_id or str(uuid.uuid4())
        if repos is not None:
            repo_list = repos
        elif target_repo:
            repo_list = [target_repo]
        else:
            repo_list = WorkspaceGitManager(workspace_path).list_repositories()

        context = ActiveSessionContext(
            session_id=sid,
            workspace_path=workspace_path,
            git_url=git_url,
            git_branch=git_branch,
            ticket_id=ticket_id,
            target_repo=target_repo,
            repos=repo_list,
            session_name=session_name,
            model=model or settings.default_model,
            permission_mode=permission_mode or settings.default_permission_mode,
        )
        self._sessions[sid] = context

        return SessionResponse(
            session_id=sid,
            session_name=session_name,
            ticket_id=ticket_id,
            target_repo=target_repo,
            workspace_dir=str(workspace_path),
            git_url=git_url,
            git_branch=git_branch,
            repos=repo_list,
        )

    def get_context(self, session_id: str) -> Optional[ActiveSessionContext]:
        """Get the active session context by ID."""
        return self._sessions.get(session_id)

    def ensure_context(self, session_id: str, workspace_path: Path) -> ActiveSessionContext:
        """Get or lazily construct a context for an existing session ID."""
        if session_id not in self._sessions:
            self._sessions[session_id] = ActiveSessionContext(
                session_id=session_id,
                workspace_path=workspace_path,
                repos=[],
                model=settings.default_model,
                permission_mode=settings.default_permission_mode,
            )
        return self._sessions[session_id]

    async def get_or_create_client(
        self,
        context: ActiveSessionContext,
        allowed_tools: Optional[list[str]] = None,
        system_prompt: Optional[str] = None,
    ) -> ClaudeSDKClient:
        """Get or initialize a connected ClaudeSDKClient for the session context."""
        async with context.lock:
            if context.client is not None:
                return context.client

            tools = allowed_tools or ["Read", "Edit", "Write", "Glob", "Grep", "Bash"]
            
            # Determine active repositories for this session
            if context.repos:
                active_repos = [r for r in context.repos if r != "." and (context.workspace_path / r).is_dir()]
            elif context.target_repo and (context.workspace_path / context.target_repo).is_dir():
                active_repos = [context.target_repo]
            else:
                ws_mgr = WorkspaceGitManager(context.workspace_path)
                all_repos = ws_mgr.list_repositories()
                active_repos = [r for r in all_repos if r != "." and (context.workspace_path / r).is_dir()]

            # Determine primary cwd for this session
            effective_cwd = context.workspace_path
            if context.target_repo and (context.workspace_path / context.target_repo).is_dir():
                effective_cwd = context.workspace_path / context.target_repo
            elif len(active_repos) == 1:
                effective_cwd = context.workspace_path / active_repos[0]

            # Populate add_dirs with ONLY additional explicitly requested repos
            add_dirs: list[Path] = []
            for r in active_repos:
                r_path = context.workspace_path / r
                if r_path != effective_cwd and r_path not in add_dirs:
                    add_dirs.append(r_path)

            def to_uuid_str(val: str) -> str:
                try:
                    return str(uuid.UUID(str(val)))
                except (ValueError, AttributeError, TypeError):
                    return str(uuid.uuid5(uuid.NAMESPACE_DNS, str(val)))

            cli_session_id = to_uuid_str(context.session_id)

            has_prior_session = False
            try:
                has_prior_session = (
                    get_session_info(cli_session_id, directory=str(effective_cwd)) is not None
                    or get_session_info(cli_session_id, directory=str(context.workspace_path)) is not None
                )
            except Exception:
                has_prior_session = False

            logger.info(
                f"Initializing ClaudeSDKClient for session {context.session_id} (CLI UUID: {cli_session_id}): "
                f"cwd={effective_cwd}, add_dirs={[str(d) for d in add_dirs]}"
            )

            options = ClaudeAgentOptions(
                cwd=effective_cwd,
                add_dirs=add_dirs,
                allowed_tools=tools,
                permission_mode=context.permission_mode or settings.default_permission_mode,
                model=context.model or settings.default_model,
                resume=cli_session_id if has_prior_session else None,
                session_id=None if has_prior_session else cli_session_id,
                system_prompt=system_prompt,
            )


            client = ClaudeSDKClient(options=options)
            await client.connect()
            context.client = client
            return client

    async def interrupt_session(self, session_id: str) -> bool:
        """Interrupt an ongoing agent turn if currently running."""
        context = self._sessions.get(session_id)
        if not context or not context.client:
            return False

        logger.info(f"Interrupting session {session_id}")
        try:
            await context.client.interrupt()
            context.is_running = False
            return True
        except Exception as e:
            logger.error(f"Error interrupting session {session_id}: {e}")
            return False

    async def close_session(self, session_id: str):
        """Disconnect and clean up client for a session."""
        context = self._sessions.get(session_id)
        if context and context.client:
            try:
                await context.client.disconnect()
            except Exception as e:
                logger.warning(f"Error disconnecting client {session_id}: {e}")
            context.client = None
            context.is_running = False

    def list_all_sessions(self, directory: Optional[Path] = None, limit: int = 20) -> list[SessionInfoResponse]:
        """List past sessions using the SDK's list_sessions()."""
        dir_str = str(directory) if directory else None
        try:
            sdk_sessions = list_sessions(directory=dir_str, limit=limit)
            result = []
            for s in sdk_sessions:
                result.append(
                    SessionInfoResponse(
                        session_id=s.session_id,
                        summary=s.summary,
                        custom_title=s.custom_title,
                        git_branch=s.git_branch,
                        cwd=s.cwd,
                        created_at=s.created_at,
                        last_modified=s.last_modified,
                    )
                )
            return result
        except Exception as e:
            logger.error(f"Failed to list sessions: {e}")
            return []

    def get_session_history(self, session_id: str, directory: Optional[Path] = None) -> list[dict[str, Any]]:
        """Retrieve past messages for a session."""
        dir_str = str(directory) if directory else None
        try:
            messages = get_session_messages(session_id=session_id, directory=dir_str)
            return [
                {
                    "type": msg.type,
                    "uuid": msg.uuid,
                    "session_id": msg.session_id,
                    "message": msg.message,
                }
                for msg in messages
            ]
        except Exception as e:
            logger.warning(f"Could not retrieve history for session {session_id}: {e}")
            return []


# Global session manager instance
session_manager = SessionManager()
