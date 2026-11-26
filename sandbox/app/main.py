import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import sessions_router, workspace_router
from app.config import settings
from app.services.git_manager import configure_git_credentials

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("claude-code-sandbox")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events for FastAPI application."""
    # Startup
    workspace = settings.resolved_workspace_path
    logger.info(f"Claude Coding Agent Service starting up. Workspace initialized at: {workspace}")
    try:
        configure_git_credentials()
    except Exception as e:
        logger.warning(f"Could not configure initial git credentials: {e}")
    yield
    # Shutdown
    logger.info("Claude Coding Agent Service shutting down.")


app = FastAPI(
    title="Claude Coding Agent Service",
    description=(
        "FastAPI service for interacting with Claude coding agents using the Claude Agent SDK. "
        "Supports real-time Server-Sent Events (SSE) streaming, git repository cloning, "
        "and workspace sandbox management."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware for Web UI integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for local dev and embedded frontends
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(sessions_router)
app.include_router(workspace_router)


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "claude-code-sandbox",
        "workspace_dir": str(settings.resolved_workspace_path),
        "code_server_url": settings.code_server_url,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
