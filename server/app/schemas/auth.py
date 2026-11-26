from pydantic import BaseModel, Field
from typing import Optional

class GitHubAuthRequest(BaseModel):
    code: str = Field(..., description="The temporary authorization code from GitHub")
    redirect_uri: Optional[str] = Field(None, description="The redirect URI used in authorization request")

class GitHubUser(BaseModel):
    id: int = Field(..., description="GitHub unique user ID")
    login: str = Field(..., description="GitHub login username")
    name: Optional[str] = Field(None, description="GitHub display name")
    email: Optional[str] = Field(None, description="GitHub user email")
    avatar_url: Optional[str] = Field(None, description="GitHub profile avatar URL")

class GitHubAuthResponse(BaseModel):
    access_token: str = Field(..., description="The GitHub OAuth access token")
    user: GitHubUser = Field(..., description="The authenticated user profile")
