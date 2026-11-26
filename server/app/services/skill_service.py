import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.models import SkillModel, SandboxSkillAssignmentModel, current_utc_time
from app.schemas import (
    SkillCreateRequest,
    SkillUpdateRequest,
    SkillResponse,
    SkillDetailResponse,
    SkillContentResponse,
    SandboxSkillAssignmentResponse,
    SandboxRuntimeSkill,
    SandboxRuntimeSkillsResponse
)
from app.services.validator import slugify, compute_sha256, validate_and_normalize_skill_file

logger = logging.getLogger("skill-service")


async def get_user_org_roles(user_id: str, db: AsyncIOMotorDatabase) -> Dict[str, str]:
    """
    Fetches all organizations the user belongs to and their role in each.
    Returns mapping of org_id -> role (e.g. 'org_owner', 'org_admin', 'org_member').
    """
    clean_user = (user_id or "user-default").strip()
    memberships = await db.org_memberships.find({"user_id": clean_user}).to_list(length=200)
    roles = {m["org_id"]: m.get("role", "org_member") for m in memberships}
    # In local development or standalone setups, default all developers to org-default with admin access
    if not roles:
        roles["org-default"] = "org_admin"
    return roles


def can_user_manage_org_skill(org_id: str, org_roles: Dict[str, str]) -> bool:
    """Checks if the user has administrative privileges for the specified organization."""
    role = org_roles.get(org_id)
    return role in ("org_owner", "org_admin")


async def list_skills(
    user_id: str,
    scope: Optional[str] = None,
    search: Optional[str] = None,
    category: Optional[str] = None,
    db: Optional[AsyncIOMotorDatabase] = None
) -> List[SkillResponse]:
    """
    Lists skills accessible to the caller based on personal ownership and org memberships.
    Applies search, scope, and category filtering.
    """
    if db is None:
        raise ValueError("Database instance must be provided.")

    clean_user = (user_id or "default-user").strip()
    org_roles = await get_user_org_roles(clean_user, db)
    user_org_ids = list(org_roles.keys())

    # Build accessibility query
    accessible_filter: Dict[str, Any] = {
        "deleted_at": None,
        "$or": [
            {"scope": "personal", "owner_user_id": clean_user},
            {"scope": "organization", "organization_id": {"$in": user_org_ids}}
        ]
    }

    # Scope filter
    if scope:
        clean_scope = scope.strip().lower()
        if clean_scope == "personal":
            accessible_filter = {"deleted_at": None, "scope": "personal", "owner_user_id": clean_user}
        elif clean_scope == "organization":
            accessible_filter = {"deleted_at": None, "scope": "organization", "organization_id": {"$in": user_org_ids}}

    # Category filter
    if category and category.lower() != "all":
        accessible_filter["category"] = {"$regex": f"^{re.escape(category)}$", "$options": "i"}

    # Search filter (by name or description)
    if search:
        s = search.strip()
        accessible_filter["$and"] = [
            {"$or": [
                {"name": {"$regex": re.escape(s), "$options": "i"}},
                {"description": {"$regex": re.escape(s), "$options": "i"}},
                {"tags": {"$in": [re.compile(re.escape(s), re.IGNORECASE)]}}
            ]}
        ]

    cursor = db.skills.find(accessible_filter).sort("created_at", -1)
    skills = await cursor.to_list(length=500)

    # Fetch organization names for enriched display
    org_names = {}
    if user_org_ids:
        org_docs = await db.organizations.find({"id": {"$in": user_org_ids}}).to_list(length=100)
        org_names = {o["id"]: o["name"] for o in org_docs}

    results = []
    for s in skills:
        is_personal = s.get("scope") == "personal"
        s_org_id = s.get("organization_id")
        
        can_edit = False
        can_delete = False
        if is_personal:
            can_edit = s.get("owner_user_id") == clean_user
            can_delete = can_edit
        elif s_org_id:
            can_edit = can_user_manage_org_skill(s_org_id, org_roles)
            can_delete = can_edit

        results.append(SkillResponse(
            id=s["id"],
            name=s["name"],
            slug=s["slug"],
            description=s["description"],
            scope=s.get("scope", "personal"),
            owner_user_id=s.get("owner_user_id"),
            organization_id=s_org_id,
            organization_name=org_names.get(s_org_id) if s_org_id else None,
            created_by=s.get("created_by", clean_user),
            version=s.get("version", 1),
            content_hash=s.get("content_hash", ""),
            category=s.get("category", "General"),
            tags=s.get("tags", []),
            compatible_agents=s.get("compatible_agents", ["claudeCode", "antigravity"]),
            can_edit=can_edit,
            can_delete=can_delete,
            created_at=s["created_at"],
            updated_at=s["updated_at"]
        ))
    return results


async def get_skill_by_id(
    skill_id: str,
    user_id: str,
    db: AsyncIOMotorDatabase
) -> Dict[str, Any]:
    """Retrieves a skill and validates that the caller has access to it."""
    clean_user = (user_id or "default-user").strip()
    skill = await db.skills.find_one({"id": skill_id, "deleted_at": None})
    if not skill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Skill '{skill_id}' not found."
        )

    # Check permission
    if skill.get("scope") == "personal":
        if skill.get("owner_user_id") != clean_user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this private skill."
            )
    elif skill.get("scope") == "organization":
        org_id = skill.get("organization_id")
        org_roles = await get_user_org_roles(clean_user, db)
        if org_id not in org_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this organization's skills."
            )

    return skill


async def create_skill(
    name: str,
    description: str,
    scope: str,
    content: str,
    user_id: str,
    db: AsyncIOMotorDatabase,
    organization_id: Optional[str] = None,
    category: Optional[str] = "General",
    tags: Optional[List[str]] = None,
    compatible_agents: Optional[List[str]] = None
) -> SkillDetailResponse:
    """Creates a new skill with validated metadata and instructions."""
    clean_user = (user_id or "default-user").strip()
    clean_scope = scope.strip().lower()

    owner_user_id = None
    target_org_id = None

    if clean_scope == "organization":
        if not organization_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="organization_id is required for organization-scoped skills."
            )
        target_org_id = organization_id.strip()
        org_roles = await get_user_org_roles(clean_user, db)
        if not can_user_manage_org_skill(target_org_id, org_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organization owners and admins can create organization-wide skills."
            )
    else:
        clean_scope = "personal"
        owner_user_id = clean_user

    slug = slugify(name)
    existing = await db.skills.find_one({"slug": slug, "deleted_at": None})
    if existing:
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"

    content_hash = compute_sha256(content)

    new_skill = SkillModel(
        name=name.strip(),
        slug=slug,
        description=description.strip(),
        scope=clean_scope,
        owner_user_id=owner_user_id,
        organization_id=target_org_id,
        created_by=clean_user,
        skill_content=content,
        content_hash=content_hash,
        filename="SKILL.md",
        version=1,
        category=category or "General",
        tags=tags or [],
        compatible_agents=compatible_agents or ["claudeCode", "antigravity"]
    )
    doc = new_skill.model_dump()
    await db.skills.insert_one(doc)

    org_name = None
    if target_org_id:
        org_doc = await db.organizations.find_one({"id": target_org_id})
        if org_doc:
            org_name = org_doc.get("name")

    return SkillDetailResponse(
        id=new_skill.id,
        name=new_skill.name,
        slug=new_skill.slug,
        description=new_skill.description,
        scope=new_skill.scope,
        owner_user_id=new_skill.owner_user_id,
        organization_id=new_skill.organization_id,
        organization_name=org_name,
        created_by=new_skill.created_by,
        version=new_skill.version,
        content_hash=new_skill.content_hash,
        category=new_skill.category,
        tags=new_skill.tags,
        compatible_agents=new_skill.compatible_agents,
        skill_content=new_skill.skill_content,
        filename=new_skill.filename,
        can_edit=True,
        can_delete=True,
        created_at=new_skill.created_at,
        updated_at=new_skill.updated_at
    )


async def update_skill(
    skill_id: str,
    update_data: SkillUpdateRequest,
    user_id: str,
    db: AsyncIOMotorDatabase
) -> SkillDetailResponse:
    """Updates an existing skill's metadata and/or content."""
    clean_user = (user_id or "default-user").strip()
    skill = await get_skill_by_id(skill_id, clean_user, db)

    # Permission check for update
    org_roles = await get_user_org_roles(clean_user, db)
    if skill["scope"] == "personal":
        if skill.get("owner_user_id") != clean_user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot edit someone else's personal skill."
            )
    elif skill["scope"] == "organization":
        if not can_user_manage_org_skill(skill["organization_id"], org_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organization owners and admins can update organization skills."
            )

    update_fields: Dict[str, Any] = {"updated_at": current_utc_time()}
    if update_data.name is not None:
        update_fields["name"] = update_data.name.strip()
    if update_data.description is not None:
        update_fields["description"] = update_data.description.strip()
    if update_data.category is not None:
        update_fields["category"] = update_data.category.strip()
    if update_data.tags is not None:
        update_fields["tags"] = update_data.tags
    if update_data.compatible_agents is not None:
        update_fields["compatible_agents"] = update_data.compatible_agents

    if update_data.content is not None:
        _, validated_content = validate_and_normalize_skill_file("SKILL.md", update_data.content.encode("utf-8"))
        update_fields["skill_content"] = validated_content
        update_fields["content_hash"] = compute_sha256(validated_content)
        update_fields["version"] = skill.get("version", 1) + 1

    updated_doc = await db.skills.find_one_and_update(
        {"id": skill_id},
        {"$set": update_fields},
        return_document=ReturnDocument.AFTER
    )

    org_name = None
    if updated_doc.get("organization_id"):
        org_doc = await db.organizations.find_one({"id": updated_doc["organization_id"]})
        if org_doc:
            org_name = org_doc.get("name")

    return SkillDetailResponse(
        id=updated_doc["id"],
        name=updated_doc["name"],
        slug=updated_doc["slug"],
        description=updated_doc["description"],
        scope=updated_doc["scope"],
        owner_user_id=updated_doc.get("owner_user_id"),
        organization_id=updated_doc.get("organization_id"),
        organization_name=org_name,
        created_by=updated_doc.get("created_by", clean_user),
        version=updated_doc.get("version", 1),
        content_hash=updated_doc.get("content_hash", ""),
        category=updated_doc.get("category", "General"),
        tags=updated_doc.get("tags", []),
        compatible_agents=updated_doc.get("compatible_agents", ["claudeCode", "antigravity"]),
        skill_content=updated_doc.get("skill_content", ""),
        filename="SKILL.md",
        can_edit=True,
        can_delete=True,
        created_at=updated_doc["created_at"],
        updated_at=updated_doc["updated_at"]
    )


async def delete_skill(
    skill_id: str,
    user_id: str,
    db: AsyncIOMotorDatabase
) -> Dict[str, Any]:
    """Soft deletes a skill, ensuring existing sandbox assignments are preserved."""
    clean_user = (user_id or "default-user").strip()
    skill = await get_skill_by_id(skill_id, clean_user, db)

    org_roles = await get_user_org_roles(clean_user, db)
    if skill["scope"] == "personal":
        if skill.get("owner_user_id") != clean_user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot delete someone else's personal skill."
            )
    elif skill["scope"] == "organization":
        if not can_user_manage_org_skill(skill["organization_id"], org_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organization owners and admins can delete organization skills."
            )

    await db.skills.update_one(
        {"id": skill_id},
        {"$set": {
            "deleted_at": current_utc_time(),
            "updated_at": current_utc_time()
        }}
    )

    logger.info(f"Skill {skill_id} ({skill['name']}) soft-deleted by user {clean_user}.")
    return {"status": "success", "message": f"Skill '{skill['name']}' deleted successfully."}


async def attach_skills_to_sandbox(
    sandbox_id: str,
    skill_ids: List[str],
    user_id: str,
    db: AsyncIOMotorDatabase
) -> List[SandboxSkillAssignmentResponse]:
    """
    Attaches a list of skill IDs to a sandbox.
    Validates accessibility for each skill and stores an immutable content snapshot.
    """
    clean_user = (user_id or "default-user").strip()
    if not skill_ids:
        return []

    # De-duplicate skill IDs
    unique_skill_ids = list(dict.fromkeys(skill_ids))

    assignments = []
    for sid in unique_skill_ids:
        skill = await get_skill_by_id(sid, clean_user, db)

        # Snapshot the skill content and version
        model = SandboxSkillAssignmentModel(
            sandbox_id=sandbox_id,
            skill_id=skill["id"],
            skill_name=skill["name"],
            skill_version=skill.get("version", 1),
            skill_content_snapshot=skill["skill_content"],
            content_hash=skill["content_hash"],
            assigned_by=clean_user,
            status="ACTIVE"
        )
        doc = model.model_dump()

        # Upsert assignment
        await db.sandbox_skill_assignments.update_one(
            {"sandbox_id": sandbox_id, "skill_id": sid},
            {"$set": doc},
            upsert=True
        )

        assignments.append(SandboxSkillAssignmentResponse(
            id=model.id,
            sandbox_id=sandbox_id,
            skill_id=sid,
            skill_name=model.skill_name,
            skill_version=model.skill_version,
            content_hash=model.content_hash,
            assigned_by=model.assigned_by,
            assigned_at=model.assigned_at,
            status=model.status
        ))

    logger.info(f"Attached {len(assignments)} skills to sandbox {sandbox_id} by user {clean_user}.")
    return assignments


async def get_sandbox_skills(
    sandbox_id: str,
    user_id: str,
    db: AsyncIOMotorDatabase
) -> List[SandboxSkillAssignmentResponse]:
    """Returns active skill assignments for a sandbox."""
    cursor = db.sandbox_skill_assignments.find({"sandbox_id": sandbox_id, "status": "ACTIVE"})
    docs = await cursor.to_list(length=100)
    return [
        SandboxSkillAssignmentResponse(
            id=d["id"],
            sandbox_id=d["sandbox_id"],
            skill_id=d["skill_id"],
            skill_name=d["skill_name"],
            skill_version=d["skill_version"],
            content_hash=d["content_hash"],
            assigned_by=d["assigned_by"],
            assigned_at=d["assigned_at"],
            status=d["status"]
        ) for d in docs
    ]


async def detach_skill_from_sandbox(
    sandbox_id: str,
    skill_id: str,
    user_id: str,
    db: AsyncIOMotorDatabase
) -> Dict[str, Any]:
    """Removes a skill assignment from a sandbox."""
    result = await db.sandbox_skill_assignments.update_one(
        {"sandbox_id": sandbox_id, "skill_id": skill_id, "status": "ACTIVE"},
        {"$set": {"status": "REMOVED", "updated_at": current_utc_time()}}
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Skill '{skill_id}' is not assigned to sandbox '{sandbox_id}'."
        )
    return {"status": "success", "message": f"Skill '{skill_id}' detached from sandbox '{sandbox_id}'."}


async def resolve_sandbox_runtime_skills(
    sandbox_id: str,
    db: AsyncIOMotorDatabase
) -> SandboxRuntimeSkillsResponse:
    """
    Returns the resolved, immutable skill contents needed by the sandbox agent runtime.
    Called by provisioning workflows or the sandbox container on startup.
    """
    assignments = await db.sandbox_skill_assignments.find({
        "sandbox_id": sandbox_id,
        "status": "ACTIVE"
    }).to_list(length=100)

    runtime_skills = []
    for a in assignments:
        runtime_skills.append(SandboxRuntimeSkill(
            skill_id=a["skill_id"],
            name=a["skill_name"],
            slug=slugify(a["skill_name"]),
            filename="SKILL.md",
            content=a["skill_content_snapshot"],
            version=a["skill_version"],
            content_hash=a["content_hash"]
        ))

    return SandboxRuntimeSkillsResponse(
        sandbox_id=sandbox_id,
        skills=runtime_skills
    )
