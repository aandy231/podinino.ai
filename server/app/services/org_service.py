import re
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models import (
    OrganizationModel,
    TeamModel,
    OrgMembershipModel,
    TeamMembershipModel,
    current_utc_time
)
from app.schemas import (
    OrganizationCreateRequest,
    TeamCreateRequest,
    TeamMemberAddRequest
)

logger = logging.getLogger("spinup-service")


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text).strip().lower()
    slug = re.sub(r"[-\s]+", "-", slug)
    return slug or f"item-{uuid.uuid4().hex[:6]}"


async def get_or_create_personal_context(
    user_id: str,
    username: Optional[str] = None,
    email: Optional[str] = None,
    db: Optional[AsyncIOMotorDatabase] = None
) -> Dict[str, Any]:
    """
    Ensures that every user has a default personal organization and personal team.
    This guarantees 100% backward compatibility for legacy workflows.
    """
    if db is None:
        raise ValueError("Database instance must be provided.")

    clean_user = (user_id or "default-user").strip()
    personal_slug = f"personal-{clean_user.lower().replace('_', '-')}"

    # 1. Check if personal org exists
    org = await db.organizations.find_one({"is_personal": True, "slug": personal_slug})
    if org:
        # Upgrade display name if previously initialized with raw git- user ID
        if username and org.get("name", "").startswith("Personal (git-"):
            new_display = f"Personal ({username})"
            await db.organizations.update_one({"id": org["id"]}, {"$set": {"name": new_display}})
            org["name"] = new_display
    else:
        display_name = f"Personal ({username or clean_user})"
        new_org = OrganizationModel(
            name=display_name,
            slug=personal_slug,
            is_personal=True,
            billing_email=email,
            settings={"default_monthly_budget_usd": 100.0, "max_sandboxes_per_team": 5}
        )
        org_doc = new_org.model_dump()
        await db.organizations.insert_one(org_doc)
        org = org_doc

        # Assign org_owner
        membership = OrgMembershipModel(
            org_id=org["id"],
            user_id=clean_user,
            role="org_owner"
        )
        await db.org_memberships.update_one(
            {"org_id": org["id"], "user_id": clean_user},
            {"$set": membership.model_dump()},
            upsert=True
        )

    # 2. Check if default team exists in this personal org
    team = await db.teams.find_one({"org_id": org["id"], "slug": "default"})
    if not team:
        new_team = TeamModel(
            org_id=org["id"],
            name="Default Workspace Team",
            slug="default",
            description="Personal workspace team for individual sandboxes",
            monthly_budget_usd=100.0,
            max_concurrent_sandboxes=5
        )
        team_doc = new_team.model_dump()
        await db.teams.insert_one(team_doc)
        team = team_doc

        # Assign team_lead
        tm = TeamMembershipModel(
            org_id=org["id"],
            team_id=team["id"],
            user_id=clean_user,
            role="team_lead"
        )
        await db.team_memberships.update_one(
            {"team_id": team["id"], "user_id": clean_user},
            {"$set": tm.model_dump()},
            upsert=True
        )

    org_clean = dict(org)
    org_clean.pop("_id", None)
    team_clean = dict(team)
    team_clean.pop("_id", None)

    return {"personal_org": org_clean, "personal_team": team_clean}


async def get_user_context(
    user_id: str, 
    db: AsyncIOMotorDatabase,
    username: Optional[str] = None
) -> Dict[str, Any]:
    """
    Returns all organizations and teams a user belongs to, including their roles.
    """
    personal = await get_or_create_personal_context(user_id=user_id, username=username, db=db)
    clean_user = user_id.strip()

    # Get org memberships
    org_mems = await db.org_memberships.find({"user_id": clean_user}).to_list(length=100)
    org_ids = [m["org_id"] for m in org_mems]

    org_map = {m["org_id"]: m.get("role", "org_member") for m in org_mems}
    org_docs = await db.organizations.find({"id": {"$in": org_ids}}).to_list(length=100)
    
    org_list = []
    for o in org_docs:
        org_list.append({
            "id": o["id"],
            "name": o["name"],
            "slug": o["slug"],
            "is_personal": o.get("is_personal", False),
            "billing_email": o.get("billing_email"),
            "user_role": org_map.get(o["id"], "org_member"),
            "created_at": o.get("created_at")
        })

    # Get team memberships
    team_mems = await db.team_memberships.find({"user_id": clean_user}).to_list(length=200)
    team_ids = [tm["team_id"] for tm in team_mems]
    team_role_map = {tm["team_id"]: tm.get("role", "team_member") for tm in team_mems}

    team_docs = await db.teams.find({"id": {"$in": team_ids}}).to_list(length=200)

    # Count active sandboxes and members for each team
    team_list = []
    for t in team_docs:
        m_count = await db.team_memberships.count_documents({"team_id": t["id"]})
        sb_count = await db.workspaces.count_documents({"team_id": t["id"], "deleted_at": None})
        team_list.append({
            "id": t["id"],
            "org_id": t["org_id"],
            "name": t["name"],
            "slug": t["slug"],
            "description": t.get("description", ""),
            "monthly_budget_usd": float(t.get("monthly_budget_usd", 250.0)),
            "max_concurrent_sandboxes": int(t.get("max_concurrent_sandboxes", 6)),
            "user_role": team_role_map.get(t["id"], "team_member"),
            "member_count": m_count,
            "active_sandbox_count": sb_count,
            "created_at": t.get("created_at")
        })

    return {
        "user_id": clean_user,
        "personal_org": personal["personal_org"],
        "personal_team": personal["personal_team"],
        "organizations": org_list,
        "teams": team_list
    }


async def create_organization(
    data: OrganizationCreateRequest, 
    creator_id: str, 
    db: AsyncIOMotorDatabase
) -> Dict[str, Any]:
    slug = data.slug or slugify(data.name)
    existing = await db.organizations.find_one({"slug": slug})
    if existing:
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"

    new_org = OrganizationModel(
        name=data.name,
        slug=slug,
        is_personal=False,
        billing_email=data.billing_email,
        settings=data.settings or {}
    )
    org_dict = new_org.model_dump()
    await db.organizations.insert_one(org_dict)

    # Assign creator as org_owner
    membership = OrgMembershipModel(
        org_id=new_org.id,
        user_id=creator_id,
        role="org_owner"
    )
    await db.org_memberships.insert_one(membership.model_dump())

    # Create default team in new org
    default_team = TeamModel(
        org_id=new_org.id,
        name="General",
        slug="general",
        description="General engineering team",
        monthly_budget_usd=300.0,
        max_concurrent_sandboxes=8
    )
    team_dict = default_team.model_dump()
    await db.teams.insert_one(team_dict)

    tm = TeamMembershipModel(
        org_id=new_org.id,
        team_id=default_team.id,
        user_id=creator_id,
        role="team_lead"
    )
    await db.team_memberships.insert_one(tm.model_dump())

    return {
        "id": new_org.id,
        "name": new_org.name,
        "slug": new_org.slug,
        "is_personal": False,
        "billing_email": new_org.billing_email,
        "user_role": "org_owner",
        "created_at": new_org.created_at
    }


async def create_team(
    data: TeamCreateRequest, 
    creator_id: str, 
    db: AsyncIOMotorDatabase
) -> Dict[str, Any]:
    # Check permissions on parent org
    org_mem = await db.org_memberships.find_one({"org_id": data.org_id, "user_id": creator_id})
    if not org_mem or org_mem.get("role") not in ["org_owner", "org_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization owners and admins can create new teams."
        )

    slug = data.slug or slugify(data.name)
    existing = await db.teams.find_one({"org_id": data.org_id, "slug": slug})
    if existing:
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"

    new_team = TeamModel(
        org_id=data.org_id,
        name=data.name,
        slug=slug,
        description=data.description or "",
        monthly_budget_usd=data.monthly_budget_usd or 250.0,
        max_concurrent_sandboxes=data.max_concurrent_sandboxes or 6
    )
    team_dict = new_team.model_dump()
    await db.teams.insert_one(team_dict)

    # Assign creator as team_lead
    tm = TeamMembershipModel(
        org_id=data.org_id,
        team_id=new_team.id,
        user_id=creator_id,
        role="team_lead"
    )
    await db.team_memberships.insert_one(tm.model_dump())

    return {
        "id": new_team.id,
        "org_id": new_team.org_id,
        "name": new_team.name,
        "slug": new_team.slug,
        "description": new_team.description,
        "monthly_budget_usd": new_team.monthly_budget_usd,
        "max_concurrent_sandboxes": new_team.max_concurrent_sandboxes,
        "user_role": "team_lead",
        "member_count": 1,
        "active_sandbox_count": 0,
        "created_at": new_team.created_at
    }


async def add_team_member(
    team_id: str,
    target_user_id: str,
    role: str,
    actor_id: str,
    db: AsyncIOMotorDatabase
) -> Dict[str, Any]:
    team = await db.teams.find_one({"id": team_id})
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found.")

    # Check actor permissions: must be team_lead or org_admin/org_owner
    actor_tm = await db.team_memberships.find_one({"team_id": team_id, "user_id": actor_id})
    actor_om = await db.org_memberships.find_one({"org_id": team["org_id"], "user_id": actor_id})
    
    is_team_lead = actor_tm and actor_tm.get("role") == "team_lead"
    is_org_admin = actor_om and actor_om.get("role") in ["org_owner", "org_admin"]

    if not (is_team_lead or is_org_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team leads or organization admins can manage team memberships."
        )

    # Ensure target user is at least an org_member
    await db.org_memberships.update_one(
        {"org_id": team["org_id"], "user_id": target_user_id},
        {"$setOnInsert": {
            "id": f"om-{uuid.uuid4().hex[:12]}",
            "org_id": team["org_id"],
            "user_id": target_user_id,
            "role": "org_member",
            "joined_at": current_utc_time()
        }},
        upsert=True
    )

    # Insert or update team membership
    tm = TeamMembershipModel(
        org_id=team["org_id"],
        team_id=team_id,
        user_id=target_user_id,
        role=role
    )
    tm_doc = tm.model_dump()
    await db.team_memberships.update_one(
        {"team_id": team_id, "user_id": target_user_id},
        {"$set": tm_doc},
        upsert=True
    )

    return tm_doc


async def verify_team_role(
    team_id: str, 
    user_id: str, 
    allowed_roles: List[str], 
    db: AsyncIOMotorDatabase
) -> bool:
    """
    Checks if a user has sufficient permissions for a team.
    Also grants access if the user is an org_owner or org_admin of the team's parent organization.
    """
    tm = await db.team_memberships.find_one({"team_id": team_id, "user_id": user_id})
    if tm and tm.get("role") in allowed_roles:
        return True

    team = await db.teams.find_one({"id": team_id})
    if team:
        om = await db.org_memberships.find_one({"org_id": team["org_id"], "user_id": user_id})
        if om and om.get("role") in ["org_owner", "org_admin"]:
            return True

    return False
