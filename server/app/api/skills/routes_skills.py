import json
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Header, Query, UploadFile, File, Form, status, Response, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.schemas import (
    SkillCreateRequest,
    SkillUpdateRequest,
    SkillResponse,
    SkillDetailResponse,
    SkillContentResponse
)
from app.services.validator import validate_and_normalize_skill_file
from app.services.skill_service import (
    list_skills,
    get_skill_by_id,
    create_skill,
    update_skill,
    delete_skill
)

logger = logging.getLogger("skill-service")
router = APIRouter(prefix="/api/v1/skills", tags=["Skills Library"])


def get_current_user_id(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    user_id: Optional[str] = Query(None)
) -> str:
    resolved = x_user_id or user_id
    if not resolved or resolved in ("default-user", "default_user"):
        return "user-default"
    return resolved.strip()


@router.get("", response_model=List[SkillResponse])
async def list_available_skills(
    scope: Optional[str] = Query(None, description="Scope filter: 'personal', 'organization', or null for all"),
    search: Optional[str] = Query(None, description="Search term matching name, description, or tags"),
    category: Optional[str] = Query(None, description="Category filter"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    List all skills accessible to the authenticated developer:
    - Personal skills owned by the user.
    - Organization skills for organizations where the user is a member.
    """
    return await list_skills(
        user_id=user_id,
        scope=scope,
        search=search,
        category=category,
        db=db
    )


@router.get("/{skill_id}", response_model=SkillDetailResponse)
async def get_skill_details(
    skill_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Retrieve full details of a specific authorized skill, including its SKILL.md content.
    """
    skill = await get_skill_by_id(skill_id=skill_id, user_id=user_id, db=db)
    
    org_name = None
    if skill.get("organization_id"):
        org_doc = await db.organizations.find_one({"id": skill["organization_id"]})
        if org_doc:
            org_name = org_doc.get("name")

    # Determine can_edit & can_delete
    clean_user = user_id.strip()
    can_edit = False
    if skill.get("scope") == "personal":
        can_edit = skill.get("owner_user_id") == clean_user
    elif skill.get("organization_id"):
        mem = await db.org_memberships.find_one({
            "org_id": skill["organization_id"],
            "user_id": clean_user
        })
        can_edit = bool(mem and mem.get("role") in ("org_owner", "org_admin"))

    return SkillDetailResponse(
        id=skill["id"],
        name=skill["name"],
        slug=skill["slug"],
        description=skill["description"],
        scope=skill.get("scope", "personal"),
        owner_user_id=skill.get("owner_user_id"),
        organization_id=skill.get("organization_id"),
        organization_name=org_name,
        created_by=skill.get("created_by", clean_user),
        version=skill.get("version", 1),
        content_hash=skill.get("content_hash", ""),
        category=skill.get("category", "General"),
        tags=skill.get("tags", []),
        compatible_agents=skill.get("compatible_agents", ["claudeCode", "antigravity"]),
        skill_content=skill.get("skill_content", ""),
        filename=skill.get("filename", "SKILL.md"),
        can_edit=can_edit,
        can_delete=can_edit,
        created_at=skill["created_at"],
        updated_at=skill["updated_at"]
    )


@router.get("/{skill_id}/content")
async def get_raw_skill_content(
    skill_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Returns the raw SKILL.md markdown content as text/markdown for sandbox or editor consumption.
    """
    skill = await get_skill_by_id(skill_id=skill_id, user_id=user_id, db=db)
    return Response(
        content=skill.get("skill_content", ""),
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename=\"{skill.get('slug', 'skill')}-SKILL.md\""}
    )


@router.post("", response_model=SkillDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_new_skill(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Creates a new skill. Supports either:
    1. Direct JSON body with 'content' string.
    2. Multipart form with a file upload ('SKILL.md') and metadata fields.
    """
    content_type = request.headers.get("content-type", "")

    # 1. Handle multipart form data
    if "multipart/form-data" in content_type:
        form = await request.form()
        file = form.get("file")
        name = form.get("name")
        description = form.get("description")
        scope = form.get("scope", "personal")
        organization_id = form.get("organization_id")
        category = form.get("category", "General")
        tags_raw = form.get("tags")

        if not name or not description:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Skill 'name' and 'description' are required."
            )

        if not file or not hasattr(file, "read"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A valid Markdown SKILL.md file must be uploaded."
            )

        file_bytes = await file.read()
        filename = getattr(file, "filename", "SKILL.md") or "SKILL.md"
        _, validated_content = validate_and_normalize_skill_file(filename, file_bytes)

        parsed_tags = []
        if tags_raw:
            try:
                parsed_tags = json.loads(tags_raw) if str(tags_raw).startswith("[") else [t.strip() for t in str(tags_raw).split(",") if t.strip()]
            except Exception:
                parsed_tags = [t.strip() for t in str(tags_raw).split(",") if t.strip()]

        return await create_skill(
            name=str(name),
            description=str(description),
            scope=str(scope),
            content=validated_content,
            user_id=user_id,
            organization_id=str(organization_id) if organization_id else None,
            category=str(category) if category else "General",
            tags=parsed_tags,
            db=db
        )

    # 2. Handle JSON payload
    try:
        body = await request.json()
        payload = SkillCreateRequest(**body)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid request payload: {str(e)}"
        )

    if not payload.content or len(payload.content.strip()) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Markdown 'content' for SKILL.md is required."
        )

    _, validated_content = validate_and_normalize_skill_file("SKILL.md", payload.content.encode("utf-8"))

    return await create_skill(
        name=payload.name,
        description=payload.description,
        scope=payload.scope,
        content=validated_content,
        user_id=user_id,
        organization_id=payload.organization_id,
        category=payload.category,
        tags=payload.tags,
        compatible_agents=payload.compatible_agents,
        db=db
    )


@router.put("/{skill_id}", response_model=SkillDetailResponse)
async def update_existing_skill(
    skill_id: str,
    update_data: SkillUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Updates skill metadata or instructions.
    If content is modified, a new version number and content hash will be generated.
    """
    return await update_skill(
        skill_id=skill_id,
        update_data=update_data,
        user_id=user_id,
        db=db
    )


@router.delete("/{skill_id}")
async def delete_existing_skill(
    skill_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Soft-deletes a skill.
    Existing sandbox assignments will retain their immutable instructions.
    """
    return await delete_skill(skill_id=skill_id, user_id=user_id, db=db)
