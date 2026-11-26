import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.database import init_db

# Import routers
from app.api.auth.routes import router as auth_router
from app.api.integrations.routes import router as integrations_router
from app.api.workspaces import router as workspaces_router
from app.api.chats import router as chats_router
from app.api.skills.routes_skills import router as skills_router
from app.api.skills.routes_sandboxes import router as sandbox_skills_router

logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("podinino.server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Podinino Unified Server...")
    await init_db()
    yield
    logger.info("Shutting down Podinino Unified Server...")


app = FastAPI(
    title=settings.APP_NAME,
    description="Unified API & control plane for the Podinino open-source AI Sandbox platform.",
    version="0.1.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all unified API endpoints
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(integrations_router, prefix="/api/v1/integrations", tags=["Integrations"])
app.include_router(workspaces_router)
app.include_router(chats_router)
app.include_router(skills_router)
app.include_router(sandbox_skills_router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "podinino-server",
        "version": "0.1.0"
    }


# Mount React frontend static assets if available (Production single-container mode)
if os.path.exists(settings.STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(settings.STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't intercept API routes
        if full_path.startswith("api/"):
            return None
        index_file = os.path.join(settings.STATIC_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"status": "ok", "message": "Podinino API is running. UI assets not built yet."}
