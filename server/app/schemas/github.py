from pydantic import BaseModel, Field, field_validator
from typing import Optional

class GitHubRepository(BaseModel):
    id: int
    name: str
    full_name: str = Field(..., description="Full name of the repository (e.g. owner/repo)")
    html_url: str = Field(..., description="Web URL of the repository")
    clone_url: str = Field(..., description="Git HTTP URL to clone the repository")
    ssh_url: str = Field(..., description="Git SSH URL to clone the repository")
    description: Optional[str] = Field(None, description="Optional description of the repository")
    private: bool = Field(..., description="Whether the repository is private")
    owner: str = Field(..., description="GitHub login name of the owner")

    @field_validator("owner", mode="before")
    @classmethod
    def extract_owner_login(cls, v):
        if isinstance(v, dict):
            return v.get("login", "")
        return v
