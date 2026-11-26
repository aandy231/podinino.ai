import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models import AIUsageRecordModel, current_utc_time
from app.schemas import (
    AIUsageEventRequest,
    TeamAnalyticsResponse,
    OrgAnalyticsResponse,
    DeveloperAnalyticsResponse
)
from app.services.org_service import verify_team_role, get_or_create_personal_context

logger = logging.getLogger("spinup-service")


async def record_usage_event(
    event: AIUsageEventRequest, 
    db: AsyncIOMotorDatabase
) -> Dict[str, Any]:
    """
    Ingests an AI usage event into MongoDB, enriching missing team/org context.
    """
    org_id = event.org_id
    team_id = event.team_id
    user_id = event.user_id

    # 1. Try to enrich from workspace metadata if org_id or team_id are missing
    if (not org_id or not team_id) and event.workspace_id:
        ws = await db.workspaces.find_one({"workspace_id": event.workspace_id})
        if ws:
            org_id = org_id or ws.get("org_id")
            team_id = team_id or ws.get("team_id")
            user_id = user_id or ws.get("owner_id")

    # 2. If still missing and user_id is known, fall back to user's personal org & team
    if (not org_id or not team_id) and user_id:
        personal = await get_or_create_personal_context(user_id=user_id, db=db)
        org_id = org_id or personal["personal_org"]["id"]
        team_id = team_id or personal["personal_team"]["id"]

    record = AIUsageRecordModel(
        workspace_id=event.workspace_id,
        session_id=event.session_id,
        user_id=user_id,
        team_id=team_id,
        org_id=org_id,
        turn_index=event.turn_index,
        provider=event.provider or "anthropic",
        model=event.model or "claude",
        total_cost_usd=float(event.total_cost_usd or 0.0),
        duration_ms=int(event.duration_ms or 0),
        num_turns=int(event.num_turns or 1),
        stop_reason=event.stop_reason or "end_turn",
        timestamp=event.timestamp or current_utc_time()
    )

    doc = record.model_dump()
    await db.ai_usage_records.insert_one(doc)
    logger.info(
        f"Recorded AI usage for workspace {event.workspace_id}: "
        f"${record.total_cost_usd:.4f} ({record.duration_ms}ms)"
    )
    return {"status": "recorded", "record_id": record.id}


async def get_team_analytics(
    team_id: str,
    requesting_user_id: str,
    db: AsyncIOMotorDatabase,
    days: int = 30
) -> Dict[str, Any]:
    """
    Retrieves aggregated AI usage for a team.
    Restricted to Team Leads of the team, or Org Owners/Admins.
    """
    # 1. Permission check
    is_authorized = await verify_team_role(
        team_id=team_id,
        user_id=requesting_user_id,
        allowed_roles=["team_lead"],
        db=db
    )
    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You must be a Team Lead or Org Admin to view team analytics."
        )

    team = await db.teams.find_one({"id": team_id})
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found.")

    since_time = datetime.now(timezone.utc) - timedelta(days=days)

    pipeline = [
        {
            "$match": {
                "team_id": team_id,
                "timestamp": {"$gte": since_time}
            }
        },
        {
            "$facet": {
                "overall": [
                    {
                        "$group": {
                            "_id": None,
                            "total_spend": {"$sum": "$total_cost_usd"},
                            "total_turns": {"$sum": 1},
                            "total_duration": {"$sum": "$duration_ms"}
                        }
                    }
                ],
                "by_developer": [
                    {
                        "$group": {
                            "_id": "$user_id",
                            "spend_usd": {"$sum": "$total_cost_usd"},
                            "turns": {"$sum": 1},
                            "sandboxes": {"$addToSet": "$workspace_id"}
                        }
                    },
                    {
                        "$project": {
                            "user_id": "$_id",
                            "_id": 0,
                            "spend_usd": 1,
                            "turns": 1,
                            "active_sandboxes": {"$size": "$sandboxes"}
                        }
                    },
                    {"$sort": {"spend_usd": -1}}
                ],
                "by_sandbox": [
                    {
                        "$group": {
                            "_id": "$workspace_id",
                            "spend_usd": {"$sum": "$total_cost_usd"},
                            "turns": {"$sum": 1},
                            "user_id": {"$first": "$user_id"},
                            "last_activity": {"$max": "$timestamp"}
                        }
                    },
                    {
                        "$project": {
                            "workspace_id": "$_id",
                            "_id": 0,
                            "spend_usd": 1,
                            "turns": 1,
                            "user_id": 1,
                            "last_activity": 1
                        }
                    },
                    {"$sort": {"spend_usd": -1}},
                    {"$limit": 15}
                ],
                "daily_trend": [
                    {
                        "$group": {
                            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                            "daily_spend": {"$sum": "$total_cost_usd"},
                            "turns": {"$sum": 1}
                        }
                    },
                    {
                        "$project": {
                            "date": "$_id",
                            "_id": 0,
                            "daily_spend": 1,
                            "turns": 1
                        }
                    },
                    {"$sort": {"date": 1}}
                ]
            }
        }
    ]

    agg_res = await db.ai_usage_records.aggregate(pipeline).to_list(length=1)
    data = agg_res[0] if agg_res else {}

    overall = (data.get("overall") or [{}])[0]
    total_spend = round(float(overall.get("total_spend", 0.0)), 4)
    monthly_budget = float(team.get("monthly_budget_usd", 250.0))
    remaining = max(0.0, round(monthly_budget - total_spend, 4))

    by_developer = data.get("by_developer") or []
    for d in by_developer:
        d["spend_usd"] = round(float(d.get("spend_usd", 0.0)), 4)

    by_sandbox = data.get("by_sandbox") or []
    for sb in by_sandbox:
        sb["spend_usd"] = round(float(sb.get("spend_usd", 0.0)), 4)

    daily_trend = data.get("daily_trend") or []
    for dt in daily_trend:
        dt["daily_spend"] = round(float(dt.get("daily_spend", 0.0)), 4)

    return {
        "team_id": team_id,
        "team_name": team.get("name", "Team"),
        "org_id": team.get("org_id", ""),
        "monthly_budget_usd": monthly_budget,
        "current_period_spend_usd": total_spend,
        "budget_remaining_usd": remaining,
        "total_turns": int(overall.get("total_turns", 0)),
        "total_duration_ms": int(overall.get("total_duration", 0)),
        "by_developer": by_developer,
        "by_sandbox": by_sandbox,
        "daily_trend": daily_trend
    }


async def get_org_analytics(
    org_id: str,
    requesting_user_id: str,
    db: AsyncIOMotorDatabase,
    days: int = 30
) -> Dict[str, Any]:
    """
    Retrieves organization-wide AI usage.
    Restricted to Org Owners, Admins, or Billing Viewers.
    """
    om = await db.org_memberships.find_one({"org_id": org_id, "user_id": requesting_user_id})
    if not om or om.get("role") not in ["org_owner", "org_admin", "org_billing_viewer"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You must be an Organization Admin or Owner to view org analytics."
        )

    org = await db.organizations.find_one({"id": org_id})
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")

    since_time = datetime.now(timezone.utc) - timedelta(days=days)

    pipeline = [
        {
            "$match": {
                "org_id": org_id,
                "timestamp": {"$gte": since_time}
            }
        },
        {
            "$facet": {
                "overall": [
                    {
                        "$group": {
                            "_id": None,
                            "total_spend": {"$sum": "$total_cost_usd"},
                            "total_turns": {"$sum": 1},
                            "sandboxes": {"$addToSet": "$workspace_id"}
                        }
                    }
                ],
                "by_team": [
                    {
                        "$group": {
                            "_id": "$team_id",
                            "spend_usd": {"$sum": "$total_cost_usd"},
                            "turns": {"$sum": 1},
                            "sandboxes": {"$addToSet": "$workspace_id"}
                        }
                    },
                    {
                        "$project": {
                            "team_id": "$_id",
                            "_id": 0,
                            "spend_usd": 1,
                            "turns": 1,
                            "active_sandboxes": {"$size": "$sandboxes"}
                        }
                    },
                    {"$sort": {"spend_usd": -1}}
                ],
                "by_developer": [
                    {
                        "$group": {
                            "_id": "$user_id",
                            "spend_usd": {"$sum": "$total_cost_usd"},
                            "turns": {"$sum": 1}
                        }
                    },
                    {
                        "$project": {
                            "user_id": "$_id",
                            "_id": 0,
                            "spend_usd": 1,
                            "turns": 1
                        }
                    },
                    {"$sort": {"spend_usd": -1}},
                    {"$limit": 20}
                ],
                "daily_trend": [
                    {
                        "$group": {
                            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                            "daily_spend": {"$sum": "$total_cost_usd"},
                            "turns": {"$sum": 1}
                        }
                    },
                    {
                        "$project": {
                            "date": "$_id",
                            "_id": 0,
                            "daily_spend": 1,
                            "turns": 1
                        }
                    },
                    {"$sort": {"date": 1}}
                ]
            }
        }
    ]

    agg_res = await db.ai_usage_records.aggregate(pipeline).to_list(length=1)
    data = agg_res[0] if agg_res else {}

    overall = (data.get("overall") or [{}])[0]
    total_spend = round(float(overall.get("total_spend", 0.0)), 4)
    total_active_sb = len(overall.get("sandboxes", []))

    by_team = data.get("by_team") or []
    for item in by_team:
        item["spend_usd"] = round(float(item.get("spend_usd", 0.0)), 4)
        t_doc = await db.teams.find_one({"id": item["team_id"]})
        item["team_name"] = t_doc.get("name", "Unknown Team") if t_doc else item["team_id"]

    by_developer = data.get("by_developer") or []
    for d in by_developer:
        d["spend_usd"] = round(float(d.get("spend_usd", 0.0)), 4)

    daily_trend = data.get("daily_trend") or []
    for dt in daily_trend:
        dt["daily_spend"] = round(float(dt.get("daily_spend", 0.0)), 4)

    return {
        "org_id": org_id,
        "org_name": org.get("name", "Organization"),
        "total_spend_usd": total_spend,
        "total_turns": int(overall.get("total_turns", 0)),
        "total_active_sandboxes": total_active_sb,
        "by_team": by_team,
        "by_developer": by_developer,
        "daily_trend": daily_trend
    }


async def get_developer_analytics(
    user_id: str,
    db: AsyncIOMotorDatabase,
    days: int = 30
) -> Dict[str, Any]:
    """
    Returns AI cost analytics for a developer across their own sandboxes and teams.
    """
    clean_user = user_id.strip()
    since_time = datetime.now(timezone.utc) - timedelta(days=days)

    pipeline = [
        {
            "$match": {
                "user_id": clean_user,
                "timestamp": {"$gte": since_time}
            }
        },
        {
            "$facet": {
                "overall": [
                    {
                        "$group": {
                            "_id": None,
                            "total_spend": {"$sum": "$total_cost_usd"},
                            "total_turns": {"$sum": 1}
                        }
                    }
                ],
                "by_team": [
                    {
                        "$group": {
                            "_id": "$team_id",
                            "spend_usd": {"$sum": "$total_cost_usd"},
                            "turns": {"$sum": 1}
                        }
                    },
                    {
                        "$project": {
                            "team_id": "$_id",
                            "_id": 0,
                            "spend_usd": 1,
                            "turns": 1
                        }
                    },
                    {"$sort": {"spend_usd": -1}}
                ],
                "by_sandbox": [
                    {
                        "$group": {
                            "_id": "$workspace_id",
                            "spend_usd": {"$sum": "$total_cost_usd"},
                            "turns": {"$sum": 1},
                            "last_activity": {"$max": "$timestamp"}
                        }
                    },
                    {
                        "$project": {
                            "workspace_id": "$_id",
                            "_id": 0,
                            "spend_usd": 1,
                            "turns": 1,
                            "last_activity": 1
                        }
                    },
                    {"$sort": {"spend_usd": -1}},
                    {"$limit": 10}
                ],
                "daily_trend": [
                    {
                        "$group": {
                            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                            "daily_spend": {"$sum": "$total_cost_usd"},
                            "turns": {"$sum": 1}
                        }
                    },
                    {
                        "$project": {
                            "date": "$_id",
                            "_id": 0,
                            "daily_spend": 1,
                            "turns": 1
                        }
                    },
                    {"$sort": {"date": 1}}
                ]
            }
        }
    ]

    agg_res = await db.ai_usage_records.aggregate(pipeline).to_list(length=1)
    data = agg_res[0] if agg_res else {}

    overall = (data.get("overall") or [{}])[0]
    total_spend = round(float(overall.get("total_spend", 0.0)), 4)

    by_team = data.get("by_team") or []
    for item in by_team:
        item["spend_usd"] = round(float(item.get("spend_usd", 0.0)), 4)
        t_doc = await db.teams.find_one({"id": item["team_id"]})
        item["team_name"] = t_doc.get("name", "Team") if t_doc else item["team_id"]

    by_sandbox = data.get("by_sandbox") or []
    for sb in by_sandbox:
        sb["spend_usd"] = round(float(sb.get("spend_usd", 0.0)), 4)

    daily_trend = data.get("daily_trend") or []
    for dt in daily_trend:
        dt["daily_spend"] = round(float(dt.get("daily_spend", 0.0)), 4)

    return {
        "user_id": clean_user,
        "total_spend_usd": total_spend,
        "total_turns": int(overall.get("total_turns", 0)),
        "by_team": by_team,
        "by_sandbox": by_sandbox,
        "daily_trend": daily_trend
    }
