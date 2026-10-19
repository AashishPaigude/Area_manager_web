from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies.database import get_db
from app.dependencies.auth import get_current_user_context
from app.schemas.user_context import UserContext
from app.schemas.dashboard import DashboardResponse
from app.services.dashboard_service import DashboardService

router = APIRouter()


@router.get("", response_model=DashboardResponse)
@router.get("/", response_model=DashboardResponse)
def get_dashboard(
    target_date: Optional[date] = Query(
        None,
        description="Filter dashboard data for a specific date (YYYY-MM-DD). Defaults to today.",
    ),
    force_refresh: bool = Query(
        False,
        description="Force backend to check database immediately bypassing 30-min cache.",
    ),
    period: Optional[str] = Query(
        "weekly",
        description="Calculation period for planned and completed visits (weekly or monthly). Defaults to weekly.",
    ),
    branch_oid: Optional[int] = Query(
        None,
        description="Optional Branch OID filter.",
    ),
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> DashboardResponse:
    """Retrieve consolidated real-time Area Manager Dashboard data.

    Returns summary count metrics, active officer roster items with punch & GPS statuses,
    and actual submitted site visits mapped chronologically per officer scoped by user branch context.
    """
    scoped_branches = current_user.resolve_scoped_branch_oids(branch_oid)
    return DashboardService.get_dashboard_summary(
        db=db,
        target_date=target_date,
        force_refresh=force_refresh,
        period=period or "weekly",
        branch_oid=branch_oid,
        area_manager_oid=current_user.area_manager_oid,
        branch_oids=scoped_branches,
    )


