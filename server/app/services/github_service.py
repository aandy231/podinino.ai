import httpx
import logging
from typing import List, Optional
from app.config import settings
from app.schemas.github import GitHubRepository

logger = logging.getLogger(__name__)

class GitHubServiceError(Exception):
    """Base exception for GitHub service errors."""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)

class GitHubAuthError(GitHubServiceError):
    """Raised when GitHub authentication fails."""
    def __init__(self, message: str = "Invalid or expired GitHub token"):
        super().__init__(message, status_code=401)

class GitHubService:
    def __init__(self):
        self.base_url = "https://api.github.com"

    async def list_repositories(self, token: Optional[str] = None) -> List[GitHubRepository]:
        """
        List repositories for the authenticated user, sorted by last updated.
        
        Args:
            token: Optional GitHub token.
        
        Returns:
            List[GitHubRepository]: List of Pydantic models for repositories.
        """
        if not token:
            logger.warning("No GitHub token provided")
            raise GitHubAuthError("GitHub authentication token is required")

        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "AI-Sandbox-Integration-Service"
        }

        # Request up to 100 repositories, sorted by most recently updated
        params = {
            "per_page": 100,
            "sort": "updated",
            "direction": "desc"
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/user/repos",
                    headers=headers,
                    params=params,
                    timeout=10.0
                )
            except httpx.RequestError as exc:
                logger.error(f"Network error connecting to GitHub: {exc}")
                raise GitHubServiceError("Failed to connect to GitHub service", status_code=503)

            if response.status_code == 200:
                try:
                    repos_json = response.json()
                    # Validate and parse into our Schema list
                    return [GitHubRepository.model_validate(repo) for repo in repos_json]
                except Exception as exc:
                    logger.error(f"Error parsing GitHub response: {exc}")
                    raise GitHubServiceError("Failed to parse repository data from GitHub", status_code=502)
            
            elif response.status_code == 401:
                logger.warning("GitHub authentication failed (401 Unauthorized)")
                raise GitHubAuthError()
            
            elif response.status_code == 403:
                # Could be rate limiting or insufficient scopes
                error_detail = response.json().get("message", "")
                logger.warning(f"GitHub access forbidden (403 Forbidden): {error_detail}")
                if "rate limit" in error_detail.lower():
                    raise GitHubServiceError("GitHub API rate limit exceeded. Please try again later.", status_code=429)
                raise GitHubServiceError(f"Access to GitHub forbidden: {error_detail}", status_code=403)
            
            else:
                logger.error(f"GitHub API returned unexpected status {response.status_code}: {response.text}")
                raise GitHubServiceError(
                    f"GitHub API error: {response.status_code}",
                    status_code=response.status_code
                )

    async def list_branches(self, owner: str, repo: str, token: Optional[str] = None) -> List[str]:
        """
        List all branch names for a repository from GitHub.
        """
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "AI-Sandbox-Integration-Service"
        }
        if token and token != "mock-oauth-token":
            headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/repos/{owner}/{repo}/branches",
                    headers=headers,
                    params={"per_page": 100},
                    timeout=10.0
                )
            except httpx.RequestError as exc:
                logger.error(f"Network error connecting to GitHub: {exc}")
                raise GitHubServiceError("Failed to connect to GitHub service", status_code=503)

            if response.status_code == 200:
                try:
                    data = response.json()
                    branch_names = [b.get("name") for b in data if isinstance(b, dict) and "name" in b]
                    return branch_names if branch_names else ["main"]
                except Exception as exc:
                    logger.error(f"Error parsing branches: {exc}")
                    return ["main"]
            elif response.status_code in [401, 403]:
                logger.warning(f"GitHub auth error {response.status_code}: {response.text}")
                return ["main"]
            elif response.status_code == 404:
                return ["main"]
            else:
                logger.error(f"GitHub branches returned status {response.status_code}")
                return ["main"]

