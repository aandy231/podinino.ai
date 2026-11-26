import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Header, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.schemas import (
    SandboxSkillAssignRequest,
    SandboxSkillAssignmentResponse,
    SandboxRuntimeSkillsResponse
)
from app.services.skill_service import (
    attach_skills_to_sandbox,
    get_sandbox_skills,
    detach_skill_from_sandbox,
    resolve_sandbox_runtime_skills
)

logger = logging.getLogger("skill-service")
router = APIRouter(prefix="/api/v1/sandboxes", tags=["Sandbox Skills"])


def get_current_user_id(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    user_id: Optional[str] = Query(None)
) -> str:
    resolved = x_user_id or user_id
    if not resolved:
        return "default-user"
    return resolved.strip()


@router.get("/{sandbox_id}/skills", response_model=List[SandboxSkillAssignmentResponse])
async def list_sandbox_skills(
    sandbox_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    List all active skills assigned to the specified sandbox.
    """
    return await get_sandbox_skills(sandbox_id=sandbox_id, user_id=user_id, db=db)


@router.post("/{sandbox_id}/skills", response_model=List[SandboxSkillAssignmentResponse], status_code=status.HTTP_201_CREATED)
async def assign_skills_to_sandbox(
    sandbox_id: str,
    payload: SandboxSkillAssignRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Attaches one or more authorized skill IDs to a sandbox.
    Verifies that caller has access to each skill and creates an immutable snapshot.
    """
    return await attach_skills_to_sandbox(
        sandbox_id=sandbox_id,
        skill_ids=payload.skill_ids,
        user_id=user_id,
        db=db
    )


@router.delete("/{sandbox_id}/skills/{skill_id}")
async def remove_skill_from_sandbox(
    sandbox_id: str,
    skill_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Removes a skill assignment from the sandbox.
    """
    return await detach_skill_from_sandbox(
        sandbox_id=sandbox_id,
        skill_id=skill_id,
        user_id=user_id,
        db=db
    )


@router.get("/{sandbox_id}/skills/runtime-content", response_model=SandboxRuntimeSkillsResponse)
async def get_sandbox_runtime_skills(
    sandbox_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Internal endpoint called by spinup-service provisioning or sandbox agent container.
    Returns the exact validated SKILL.md contents snapshot for all assigned skills.
    """
    return await resolve_sandbox_runtime_skills(sandbox_id=sandbox_id, db=db)
