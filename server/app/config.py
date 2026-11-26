from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # General
    APP_NAME: str = "Podinino Unified Server"
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    ENV: str = "production"
    LOG_LEVEL: str = "INFO"
    ALLOWED_ORIGINS: List[str] = ["*"]

    # MongoDB (Single database for all services)
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "podinino_db"

    # GitHub OAuth
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI: Optional[str] = None

    # Workspace Provisioner / K8s
    POD_NAMESPACE: str = "default"
    BASE_DOMAIN: str = "podinino.local"
    USE_IN_CLUSTER_CONFIG: bool = True
    MAX_WORKSPACES_PER_USER: int = 5
    SANDBOX_IMAGE: str = "ghcr.io/podinino/claude-code-sandbox:latest"
    STORAGE_CLASS: Optional[str] = None
    ENCRYPTION_KEY: str = "supersecretkey32byteslength1234!"  # override in prod

    # Static UI directory (if served from same container)
    STATIC_DIR: str = "/app/static"


settings = Settings()
