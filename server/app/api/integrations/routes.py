from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional
from app.schemas.github import GitHubRepository
from app.services.github_service import GitHubService, GitHubServiceError

router = APIRouter(prefix="/github", tags=["github"])
security = HTTPBearer(auto_error=False)

@router.get("/repos", response_model=List[GitHubRepository])
async def list_user_repos(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_github_token: Optional[str] = Header(None, alias="X-GitHub-Token"),
    github_service: GitHubService = Depends(GitHubService)
):
    """
    Retrieve all GitHub repositories for the authenticated user.
    
    Accepts:
    - Bearer Token in standard 'Authorization' header (e.g. `Authorization: Bearer <token>`)
    - Custom header 'X-GitHub-Token: <token>'
    """
    token = None
    if credentials:
        token = credentials.credentials
    elif x_github_token:
        token = x_github_token
        
    try:
        return await github_service.list_repositories(token=token)
    except GitHubServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("/repos/{owner}/{repo}/branches", response_model=List[str])
async def list_repo_branches(
    owner: str,
    repo: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_github_token: Optional[str] = Header(None, alias="X-GitHub-Token"),
    github_service: GitHubService = Depends(GitHubService)
):
    """
    Retrieve all branch names for a specific repository.
    """
    token = None
    if credentials:
        token = credentials.credentials
    elif x_github_token:
        token = x_github_token
        
    try:
        return await github_service.list_branches(owner, repo, token=token)
    except GitHubServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

