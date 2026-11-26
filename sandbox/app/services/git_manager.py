import asyncio
import json
import logging
import os
import re
import shutil
from pathlib import Path
from typing import Optional

from app.config import settings
from app.models.schemas import (
    GitCommitInfo,
    GitDiffResponse,
    GitStatusResponse,
    RepoSummary,
    WorkspaceReposResponse,
)

logger = logging.getLogger(__name__)


class GitError(Exception):
    """Exception raised when a git operation fails."""
    pass


def configure_git_credentials(token: Optional[str] = None) -> None:
    """
    Configure global credentials for git, .netrc, and gh CLI so git and gh commands
    non-interactively authenticate against GitHub using the OAuth/PAT token.
    """
    effective_token = token or settings.github_token or os.environ.get("GITHUB_TOKEN")
    if not effective_token:
        return

    # 1. Update os.environ for gh CLI and child subprocesses
    os.environ["GITHUB_TOKEN"] = effective_token
    os.environ["GH_TOKEN"] = effective_token

    # 2. Update /home/developer/.netrc, gh hosts.yml, and user home credentials
    netrc_content = f"machine github.com\nlogin x-access-token\npassword {effective_token}\n\n"
    home_dirs = [Path.home(), Path("/home/developer"), Path("/root")]
    
    for home_dir in home_dirs:
        try:
            if home_dir.exists():
                netrc_file = home_dir / ".netrc"
                netrc_file.write_text(netrc_content, encoding="utf-8")
                netrc_file.chmod(0o600)
                logger.debug(f"Configured .netrc credentials at {netrc_file}")

                # Configure gh CLI hosts.yml for non-interactive gh pr operations
                gh_config_dir = home_dir / ".config" / "gh"
                gh_config_dir.mkdir(parents=True, exist_ok=True)
                hosts_file = gh_config_dir / "hosts.yml"
                hosts_yaml = f"github.com:\n    user: x-access-token\n    oauth_token: {effective_token}\n    git_protocol: https\n"
                hosts_file.write_text(hosts_yaml, encoding="utf-8")
                hosts_file.chmod(0o600)
        except Exception as e:
            logger.debug(f"Could not write credentials in {home_dir}: {e}")


def format_authenticated_git_url(git_url: str, token: Optional[str] = None) -> str:
    """
    Inject token authentication into HTTPS git URLs if token is present and URL does not already have auth.
    """
    effective_token = token or settings.github_token or os.environ.get("GITHUB_TOKEN")
    if not effective_token:
        return git_url

    cleaned = git_url.strip()
    if cleaned.startswith("https://github.com/"):
        return cleaned.replace("https://github.com/", f"https://x-access-token:{effective_token}@github.com/")
    elif cleaned.startswith("http://") or cleaned.startswith("https://"):
        if "@" not in cleaned.split("://", 1)[-1].split("/", 1)[0]:
            return re.sub(r"^(https?://)", rf"\1x-access-token:{effective_token}@", cleaned)
    return cleaned


def parse_repo_name_from_url(git_url: str) -> str:
    """
    Extract a clean repository folder name from a Git URL.
    Examples:
      'https://github.com/octocat/Spoon-Knife.git' -> 'Spoon-Knife'
      'git@github.com:org/auth-service.git' -> 'auth-service'
      'https://bitbucket.org/team/gateway' -> 'gateway'
    """
    cleaned = git_url.strip().rstrip("/")
    if cleaned.endswith(".git"):
        cleaned = cleaned[:-4]
    # Grab last path component after '/' or ':'
    parts = re.split(r"[/:]", cleaned)
    repo_name = parts[-1] if parts else "repo"
    # Fallback to sanitized alphanumeric name
    repo_name = re.sub(r"[^a-zA-Z0-9_\-\.]", "-", repo_name)
    return repo_name or "repo"


class GitManager:
    """Manages Git operations for a single repository directory."""

    def __init__(self, repo_path: Path):
        self.repo_path = repo_path
        self.repo_path.mkdir(parents=True, exist_ok=True)

    @property
    def workspace_path(self) -> Path:
        """Alias for backward compatibility."""
        return self.repo_path

    async def _run_git(self, *args: str, check: bool = True) -> tuple[int, str, str]:
        """Execute a git command inside the repo directory asynchronously."""
        cmd = ["git", *args]
        logger.debug(f"Running git command: {' '.join(cmd)} in {self.repo_path}")
        try:
            env = os.environ.copy()
            env["GIT_TERMINAL_PROMPT"] = "0"
            env["GIT_ASKPASS"] = "echo"
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=str(self.repo_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            stdout, stderr = await proc.communicate()
            out_str = stdout.decode("utf-8", errors="replace").rstrip("\r\n")
            err_str = stderr.decode("utf-8", errors="replace").rstrip("\r\n")

            if check and proc.returncode != 0:
                raise GitError(f"Git command '{' '.join(cmd)}' failed (code {proc.returncode}): {err_str or out_str}")

            return proc.returncode or 0, out_str, err_str
        except FileNotFoundError:
            raise GitError("git executable not found on system PATH")

    async def is_repo(self) -> bool:
        """Check if this specific directory is an initialized git repository root."""
        git_dir = self.repo_path / ".git"
        if not git_dir.exists():
            return False
        code, out, _ = await self._run_git("rev-parse", "--show-toplevel", check=False)
        return code == 0 and Path(out).resolve() == self.repo_path.resolve()

    async def get_remote_url(self, remote: str = "origin") -> Optional[str]:
        """Get the URL for a remote if configured."""
        code, out, _ = await self._run_git("remote", "get-url", remote, check=False)
        return out if code == 0 and out else None

    async def clone_or_checkout(
        self,
        git_url: str,
        branch: Optional[str] = None,
        create_branch: Optional[str] = None,
        github_token: Optional[str] = None,
    ) -> str:
        """
        Clone repository into this directory if empty, or fetch and checkout branch if already a repo.
        Returns the active branch name.
        """
        configure_git_credentials(github_token)
        auth_url = format_authenticated_git_url(git_url, github_token)

        is_already_repo = await self.is_repo()

        if not is_already_repo:
            # Clean up broken/empty .git folder if left from earlier failed attempt
            git_dir = self.repo_path / ".git"
            if git_dir.exists():
                logger.info(f"Removing uninitialized/corrupted .git directory at {git_dir}")
                shutil.rmtree(git_dir, ignore_errors=True)

            entries = [e for e in self.repo_path.iterdir() if e.name != ".git"]
            if entries:
                # Directory has files: initialize, add remote, and fetch
                logger.info(f"Directory {self.repo_path} has files; initializing and fetching {git_url}")
                await self._run_git("init")
                await self._run_git("remote", "add", "origin", auth_url, check=False)
                await self._run_git("fetch", "origin")
                target_branch = branch or "main"
                code, _, _ = await self._run_git("checkout", "-B", target_branch, f"origin/{target_branch}", check=False)
                if code != 0:
                    target_branch = branch or "master"
                    await self._run_git("checkout", "-B", target_branch, f"origin/{target_branch}", check=False)
                active_branch = await self.get_current_branch() or target_branch
            else:
                # Clean clone into directory
                logger.info(f"Cloning {git_url} into {self.repo_path}")
                clone_cmd = ["clone", auth_url, "."]
                if branch:
                    clone_cmd.extend(["--branch", branch])
                await self._run_git(*clone_cmd)
                active_branch = await self.get_current_branch() or (branch or "main")
        else:
            # Repo already exists: update remote URL and fetch latest
            logger.info(f"Repo {self.repo_path} already exists. Updating origin to {git_url}...")
            code, _, _ = await self._run_git("remote", "get-url", "origin", check=False)
            if code == 0:
                await self._run_git("remote", "set-url", "origin", auth_url, check=False)
            else:
                await self._run_git("remote", "add", "origin", auth_url, check=False)

            await self._run_git("fetch", "origin")
            target_branch = branch or "main"
            code, _, _ = await self._run_git("checkout", "-B", target_branch, f"origin/{target_branch}", check=False)
            if code != 0:
                target_branch = branch or "master"
                await self._run_git("checkout", "-B", target_branch, f"origin/{target_branch}", check=False)
            await self._run_git("reset", "--hard", f"origin/{target_branch}", check=False)
            active_branch = await self.get_current_branch() or target_branch

        # If create_branch is requested (e.g. hotfix/AUTH-1024), create and checkout from current branch
        if create_branch:
            logger.info(f"Creating new branch '{create_branch}' from '{active_branch}' in {self.repo_path}")
            await self.checkout(create_branch, create_if_missing=True)
            active_branch = create_branch

        return active_branch

    async def get_current_branch(self) -> Optional[str]:
        """Return name of the currently checked out git branch."""
        if not await self.is_repo():
            return None
        code, out, _ = await self._run_git("branch", "--show-current", check=False)
        return out if code == 0 and out else None

    async def checkout(
        self,
        branch: str,
        create_if_missing: bool = False,
        checkout_from: Optional[str] = None
    ) -> str:
        """Checkout branch or optionally create it from a source branch."""
        if create_if_missing and checkout_from:
            # Fetch remote origin, checkout source branch, then create and checkout new branch
            await self._run_git("fetch", "origin", check=False)
            await self._run_git("checkout", checkout_from, check=False)
            code, _, _ = await self._run_git("checkout", "-b", branch, check=False)
            if code != 0:
                await self._run_git("checkout", branch)
        elif create_if_missing:
            code, _, _ = await self._run_git("checkout", branch, check=False)
            if code != 0:
                await self._run_git("checkout", "-b", branch)
        else:
            await self._run_git("checkout", branch)
        return branch

    async def get_branches(self) -> list[str]:
        """Return list of local and remote branches for this repository."""
        if not await self.is_repo():
            return []
        _, out, _ = await self._run_git("branch", "-a", "--format=%(refname:short)", check=False)
        branch_set = set()
        for line in out.splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("origin/"):
                line = line[7:]
            if line != "HEAD":
                branch_set.add(line)
        return sorted(list(branch_set)) if branch_set else ["main"]

    async def get_status(self) -> GitStatusResponse:
        """Inspect repository git status."""
        if not await self.is_repo():
            return GitStatusResponse(is_repo=False)

        branch = await self.get_current_branch()

        # Parse porcelain status
        _, out, _ = await self._run_git("status", "--porcelain", check=False)
        modified_files = []
        staged_files = []
        untracked_files = []

        for line in out.splitlines():
            if len(line) < 3:
                continue
            status_x = line[0]
            status_y = line[1]
            file_path = line[3:].strip()

            if status_x in ("M", "A", "D", "R"):
                staged_files.append(file_path)
            if status_y in ("M", "D"):
                modified_files.append(file_path)
            elif status_x == "?" and status_y == "?":
                untracked_files.append(file_path)

        is_clean = len(modified_files) == 0 and len(staged_files) == 0 and len(untracked_files) == 0

        # Latest commit
        commit_info = None
        code, log_out, _ = await self._run_git(
            "log", "-1", "--format=%H\x1f%s\x1f%an\x1f%ad", "--date=iso", check=False
        )
        if code == 0 and log_out:
            parts = log_out.split("\x1f")
            if len(parts) >= 4:
                commit_info = GitCommitInfo(
                    hash=parts[0][:8],
                    message=parts[1],
                    author=parts[2],
                    date=parts[3],
                )

        return GitStatusResponse(
            is_repo=True,
            branch=branch,
            is_clean=is_clean,
            modified_files=modified_files,
            staged_files=staged_files,
            untracked_files=untracked_files,
            latest_commit=commit_info,
        )

    async def get_diff(self) -> GitDiffResponse:
        """Get unified git diff of all uncommitted changes."""
        if not await self.is_repo():
            return GitDiffResponse(diff="", files_changed=[])

        _, diff_out, _ = await self._run_git("diff", "HEAD", check=False)
        if not diff_out:
            _, diff_out, _ = await self._run_git("diff", check=False)

        _, files_out, _ = await self._run_git("diff", "--name-only", "HEAD", check=False)
        files_changed = [f for f in files_out.splitlines() if f]

        return GitDiffResponse(
            diff=diff_out,
            files_changed=files_changed,
        )


class WorkspaceGitManager:
    """Manages multiple Git repositories residing within a shared workspace directory."""

    def __init__(self, workspace_path: Path):
        self.workspace_path = workspace_path
        self.workspace_path.mkdir(parents=True, exist_ok=True)

    def list_repositories(self) -> list[str]:
        """
        List all git repository folder names in the workspace.
        Returns subdirectories containing .git.
        Also supports legacy mode if workspace_path itself has .git.
        """
        repos: list[str] = []

        # Check subdirectories
        for item in sorted(self.workspace_path.iterdir()):
            if item.is_dir() and item.name != ".git" and (item / ".git").exists():
                repos.append(item.name)

        # Legacy root mode fallback
        if not repos and (self.workspace_path / ".git").exists():
            repos.append(".")

        return repos

    def get_repo_manager(self, repo_name: str) -> GitManager:
        """Get a GitManager for a specific repository name in the workspace."""
        if repo_name in (".", ""):
            return GitManager(self.workspace_path)
        return GitManager(self.workspace_path / repo_name)

    async def clone_repo(
        self,
        git_url: str,
        branch: Optional[str] = None,
        repo_name: Optional[str] = None,
        create_branch: Optional[str] = None,
        github_token: Optional[str] = None,
    ) -> tuple[str, str]:
        """
        Clone a repository into /workspace/<repo_name>.
        Returns tuple of (repo_name, active_branch).
        """
        target_name = repo_name or parse_repo_name_from_url(git_url)
        repo_dir = self.workspace_path / target_name
        repo_mgr = GitManager(repo_dir)

        active_branch = await repo_mgr.clone_or_checkout(
            git_url=git_url,
            branch=branch,
            create_branch=create_branch,
            github_token=github_token,
        )

        # Update VS Code multi-root workspace file
        self.update_code_workspace_file()

        return target_name, active_branch

    def update_code_workspace_file(self) -> Path:
        """
        Generate or update /workspace/workspace.code-workspace for code-server.
        Adds each discovered repository folder to the VS Code workspace explorer.
        """
        repos = self.list_repositories()
        folders = []
        for r in repos:
            if r == ".":
                folders.append({"name": "workspace", "path": "."})
            else:
                folders.append({"name": r, "path": r})

        workspace_data = {
            "folders": folders,
            "settings": {
                "git.autoRepositoryDetection": "true"
            }
        }

        workspace_file = self.workspace_path / "workspace.code-workspace"
        try:
            workspace_file.write_text(json.dumps(workspace_data, indent=2), encoding="utf-8")
        except Exception as e:
            logger.warning(f"Could not update workspace.code-workspace: {e}")

        return workspace_file

    async def get_workspace_repos_summary(self) -> WorkspaceReposResponse:
        """Return summary of all repositories present in the workspace."""
        repos = self.list_repositories()
        summaries: list[RepoSummary] = []

        for r in repos:
            mgr = self.get_repo_manager(r)
            status = await mgr.get_status()
            remote_url = await mgr.get_remote_url()
            summaries.append(
                RepoSummary(
                    name=r,
                    path=str(mgr.repo_path),
                    git_url=remote_url,
                    branch=status.branch,
                    is_clean=status.is_clean,
                    modified_files_count=len(status.modified_files) + len(status.staged_files),
                    latest_commit=status.latest_commit,
                )
            )

        code_workspace_path = self.workspace_path / "workspace.code-workspace"
        return WorkspaceReposResponse(
            workspace_dir=str(self.workspace_path),
            repositories=summaries,
            code_workspace_file=str(code_workspace_path) if code_workspace_path.exists() else None,
        )

    async def get_overall_status(self, target_repo: Optional[str] = None) -> GitStatusResponse:
        """Get git status for target repo or primary repo in workspace."""
        repos = self.list_repositories()
        if not repos:
            return GitStatusResponse(is_repo=False)

        selected = target_repo if target_repo and target_repo in repos else repos[0]
        mgr = self.get_repo_manager(selected)
        return await mgr.get_status()

    async def get_overall_diff(self, target_repo: Optional[str] = None) -> GitDiffResponse:
        """Get git diff for target repo or primary repo in workspace."""
        repos = self.list_repositories()
        if not repos:
            return GitDiffResponse(diff="", files_changed=[])

        selected = target_repo if target_repo and target_repo in repos else repos[0]
        mgr = self.get_repo_manager(selected)
        return await mgr.get_diff()
