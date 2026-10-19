from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies.database import get_db
from app.dependencies.auth import get_current_user_context
from app.schemas.user_context import UserContext
from app.schemas.analytics import (
    AnalyticsSummaryResponse,
    OfficerAnalyticsDropdownItem,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter()


@router.get("/officers", response_model=List[OfficerAnalyticsDropdownItem])
def get_analytics_officers(
    branch_oid: Optional[int] = Query(None, description="Optional branch ID filter"),
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> List[OfficerAnalyticsDropdownItem]:
    """Retrieve active Field Officers list with summary stats for the Analytics dropdown selector."""
    scoped_branches = current_user.resolve_scoped_branch_oids(branch_oid)
    return AnalyticsService.get_officers_dropdown(
        db,
        user_branch_oid=current_user.branch_oid,
        area_manager_oid=current_user.area_manager_oid,
        user_branch_oids=scoped_branches,
    )


@router.get("/summary", response_model=AnalyticsSummaryResponse)
def get_analytics_summary(
    employee_oid: Optional[int] = Query(
        None, description="Optional Field Officer employee OID for deep-dive analysis. If omitted, computes fleet-wide analytics."
    ),
    from_date: Optional[date] = Query(None, description="Optional start date filter (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="Optional end date filter (YYYY-MM-DD)"),
    period: str = Query("weekly", description="Period preset: 'today', 'weekly', 'monthly', or 'custom'"),
    branch_oid: Optional[int] = Query(None, description="Optional branch ID filter"),
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> AnalyticsSummaryResponse:
    """Retrieve comprehensive consolidated analytics for either Fleet Overview or specific Officer drill-down."""
    scoped_branches = current_user.resolve_scoped_branch_oids(branch_oid)
    return AnalyticsService.get_analytics_summary(
        db=db,
        employee_oid=employee_oid,
        from_date=from_date,
        to_date=to_date,
        period=period,
        user_branch_oid=current_user.branch_oid,
        area_manager_oid=current_user.area_manager_oid,
        user_branch_oids=scoped_branches,
    )
