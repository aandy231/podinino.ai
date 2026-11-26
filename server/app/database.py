import logging
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from app.config import settings

logger = logging.getLogger("podinino.database")

_mongo_client: AsyncIOMotorClient = None
_db: AsyncIOMotorDatabase = None


def get_mongo_client() -> AsyncIOMotorClient:
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(settings.MONGODB_URL)
    return _mongo_client


def get_db() -> AsyncIOMotorDatabase:
    """Dependency for providing database reference per request."""
    global _db
    if _db is None:
        client = get_mongo_client()
        _db = client[settings.MONGODB_DB_NAME]
    return _db


async def init_db():
    """Initializes indexes across all collections."""
    db = get_db()
    logger.info("Initializing MongoDB indexes...")

    # 1. Users collection
    await db.users.create_index([("github_user_id", ASCENDING)], unique=True)
    await db.users.create_index([("username", ASCENDING)])

    # 2. Workspaces collection
    await db.workspaces.create_index([("workspace_id", ASCENDING)], unique=True)
    await db.workspaces.create_index([("user_id", ASCENDING), ("status", ASCENDING)])
    await db.workspaces.create_index([("deleted_at", ASCENDING)])

    # 3. Workspace Events & AI Usage
    await db.workspace_events.create_index([("workspace_id", ASCENDING), ("created_at", DESCENDING)])
    await db.ai_usage_events.create_index([("workspace_id", ASCENDING)])

    # 4. Skills collection
    await db.skills.create_index([("name", ASCENDING)], unique=True)
    await db.skills.create_index([("author_id", ASCENDING)])
    await db.sandbox_attachments.create_index([("sandbox_id", ASCENDING), ("skill_id", ASCENDING)], unique=True)

    # 5. Chats and Chat Messages
    await db.chat_sessions.create_index([("id", ASCENDING)], unique=True)
    await db.chat_sessions.create_index([("user_id", ASCENDING), ("deleted_at", ASCENDING)])
    await db.chat_sessions.create_index([("workspace_id", ASCENDING)])
    await db.chat_messages.create_index([("session_id", ASCENDING), ("turn_index", ASCENDING)])

    logger.info("MongoDB indexes verified successfully.")
