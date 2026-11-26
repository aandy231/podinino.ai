import logging
import asyncio
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status, Response, Request, Query
from fastapi.responses import StreamingResponse
import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING

from app.config import settings
from app.database import get_db
from app.models import (
    UserModel, 
    WorkspaceModel, 
    WorkspaceEventModel, 
    current_utc_time
)
from app.schemas.workspaces import (
    WorkspaceCreateRequest, 
    WorkspaceCreateResponse, 
    WorkspaceDetailResponse, 
    WorkspaceDeleteResponse,
    QuotaStatusResponse,
    AIUsageEventRequest
)
from app.services.usage_service import record_usage_event
from app.utils import (
    sanitize_workspace_id, 
    generate_secure_password,
    encrypt_password
)
from app.k8s.client import K8sWorkspaceManager

logger = logging.getLogger("podinino.workspaces")
router = APIRouter(prefix="/api", tags=["Workspaces"])

k8s_manager = K8sWorkspaceManager()


async def provision_k8s_resources_background(workspace_id: str, plain_password: str, storage_size: str, repos: list):
    db = get_db()
    try:
        logger.info(f"Background task starting for workspace {workspace_id}...")
        res = await k8s_manager.create_workspace(
            workspace_id=workspace_id,
            plain_password=plain_password,
            storage_size=storage_size
        )

        ingress_url = res.get("ingress_url")
        await db.workspaces.update_one(
            {"workspace_id": workspace_id},
            {
                "$set": {
                    "status": "Running",
                    "url": ingress_url,
                    "updated_at": current_utc_time()
                }
            }
        )
        logger.info(f"Workspace {workspace_id} is marked Running with URL: {ingress_url}")

        if repos and len(repos) > 0:
            logger.info(f"Triggering repo clones for {workspace_id}: {repos}")
            target_pod_url = f"http://{workspace_id}.{settings.POD_NAMESPACE}.svc.cluster.local:8000"
            async with httpx.AsyncClient(timeout=30.0) as client:
                try:
                    await client.post(f"{target_pod_url}/api/repos", json={"repos": repos})
                except Exception as clone_err:
                    logger.warning(f"Failed to trigger repo clone on sandbox pod: {clone_err}")

    except Exception as e:
        logger.exception(f"Failed to provision workspace {workspace_id} on K8s")
        await db.workspaces.update_one(
            {"workspace_id": workspace_id},
            {"$set": {"status": "Failed", "updated_at": current_utc_time()}}
        )


async def delete_k8s_resources_background(workspace_id: str):
    try:
        logger.info(f"Background deletion starting for workspace {workspace_id}...")
        await k8s_manager.delete_workspace(workspace_id=workspace_id)
        logger.info(f"Workspace {workspace_id} K8s resources deleted successfully.")
    except Exception as e:
        logger.exception(f"Failed to delete K8s resources for workspace {workspace_id}")


@router.post("/workspaces", response_model=WorkspaceCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    req: WorkspaceCreateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    clean_ws_id = sanitize_workspace_id(req.workspace_id)

    # 1. Enforce quota: count active workspaces
    active_count = await db.workspaces.count_documents({
        "user_id": req.user_id,
        "deleted_at": None,
        "status": {"$in": ["Provisioning", "Running"]}
    })
    if active_count >= settings.MAX_WORKSPACES_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User quota exceeded. Max active workspaces: {settings.MAX_WORKSPACES_PER_USER}"
        )

    # 2. Check if workspace exists
    existing = await db.workspaces.find_one({"workspace_id": clean_ws_id, "deleted_at": None})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Workspace {clean_ws_id} already exists."
        )

    plain_password = generate_secure_password()
    encrypted_pw, salt = encrypt_password(plain_password, settings.ENCRYPTION_KEY)

    ingress_host = f"{clean_ws_id}.{settings.BASE_DOMAIN}"
    ingress_url = f"https://{ingress_host}"

    ws_record = WorkspaceModel(
        workspace_id=clean_ws_id,
        user_id=req.user_id,
        user_github_id=req.user_github_id,
        storage_size=req.storage_size,
        repos=[r.model_dump() for r in req.repos],
        status="Provisioning",
        url=ingress_url,
        encrypted_password=encrypted_pw,
        password_salt=salt,
    )
    await db.workspaces.insert_one(ws_record.model_dump())

    # Launch background provisioning
    asyncio.create_task(
        provision_k8s_resources_background(
            workspace_id=clean_ws_id,
            plain_password=plain_password,
            storage_size=req.storage_size,
            repos=[r.model_dump() for r in req.repos]
        )
    )

    return WorkspaceCreateResponse(
        workspace_id=clean_ws_id,
        status="Provisioning",
        url=ingress_url,
        password=plain_password,
        message="Workspace provisioning initiated asynchronously on Kubernetes."
    )


@router.get("/workspaces", response_model=List[WorkspaceDetailResponse])
async def list_workspaces(
    user_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    query = {"deleted_at": None}
    if user_id:
        query["user_id"] = user_id
    if status_filter:
        query["status"] = status_filter

    cursor = db.workspaces.find(query).sort("created_at", -1)
    results = []
    async for doc in cursor:
        results.append(WorkspaceDetailResponse(
            workspace_id=doc["workspace_id"],
            user_id=doc["user_id"],
            user_github_id=doc.get("user_github_id", 0),
            storage_size=doc.get("storage_size", "5Gi"),
            repos=doc.get("repos", []),
            status=doc.get("status", "Unknown"),
            url=doc.get("url"),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"]
        ))
    return results


@router.get("/workspace/{workspace_id}", response_model=WorkspaceDetailResponse)
async def get_workspace(workspace_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    clean_id = sanitize_workspace_id(workspace_id)
    doc = await db.workspaces.find_one({"workspace_id": clean_id, "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Workspace not found")

    return WorkspaceDetailResponse(
        workspace_id=doc["workspace_id"],
        user_id=doc["user_id"],
        user_github_id=doc.get("user_github_id", 0),
        storage_size=doc.get("storage_size", "5Gi"),
        repos=doc.get("repos", []),
        status=doc.get("status", "Unknown"),
        url=doc.get("url"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"]
    )


@router.delete("/workspace/{workspace_id}", response_model=WorkspaceDeleteResponse)
async def delete_workspace(workspace_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    clean_id = sanitize_workspace_id(workspace_id)
    doc = await db.workspaces.find_one({"workspace_id": clean_id, "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Workspace not found")

    await db.workspaces.update_one(
        {"workspace_id": clean_id},
        {"$set": {"status": "Deleting", "deleted_at": current_utc_time()}}
    )

    asyncio.create_task(delete_k8s_resources_background(workspace_id=clean_id))

    return WorkspaceDeleteResponse(
        workspace_id=clean_id,
        status="Deleting",
        message="Workspace marked as deleted and K8s cleanup scheduled."
    )


@router.get("/workspaces/quota", response_model=QuotaStatusResponse)
async def get_user_quota(user_id: str = Query(...), db: AsyncIOMotorDatabase = Depends(get_db)):
    active_count = await db.workspaces.count_documents({
        "user_id": user_id,
        "deleted_at": None,
        "status": {"$in": ["Provisioning", "Running"]}
    })
    return QuotaStatusResponse(
        user_id=user_id,
        active_workspaces=active_count,
        max_workspaces=settings.MAX_WORKSPACES_PER_USER,
        allowed=(active_count < settings.MAX_WORKSPACES_PER_USER)
    )


@router.post("/internal/usage/events")
async def record_usage(event: AIUsageEventRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    await record_usage_event(db, event)
    return {"status": "recorded"}
