from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment or .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Anthropic and GitHub Credentials
    anthropic_api_key: str = ""
    github_token: str | None = None
    port: int = 8000
    host: str = "0.0.0.0"

    # Default workspace directory where git repo is cloned and edited
    workspace_dir: str = "./workspace"

    # Claude settings
    default_model: str | None = "claude-haiku-5-5"
    default_permission_mode: str = "acceptEdits"

    # Code-server instance URL
    code_server_url: str = "http://localhost:8080"

    @property
    def resolved_workspace_path(self) -> Path:
        """Return the absolute Path to the workspace directory."""
        path = Path(self.workspace_dir).resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path


settings = Settings()
