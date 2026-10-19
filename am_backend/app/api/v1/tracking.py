from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies.database import get_db
from app.dependencies.auth import get_current_user_context
from app.schemas.user_context import UserContext
from app.services.tracking_service import TrackingService
from app.schemas.tracking import (
    LiveTrackingResponse,
    TrackHistoryResponse,
    PlannedVsActualResponse,
)

router = APIRouter()


@router.get("/live", response_model=LiveTrackingResponse)
def get_live_tracking(
    branch_oid: Optional[int] = Query(None, description="Optional branch ID to filter officers"),
    search: Optional[str] = Query(None, description="Optional search term for officer name or emp_code"),
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
):
    """Retrieve real-time GPS locations, online/offline status, active site sessions, and visit counts for active Field Officers scoped by user branch context."""
    scoped_branches = current_user.resolve_scoped_branch_oids(branch_oid)
    return TrackingService.get_live_tracking_data(
        db,
        branch_oid=branch_oid,
        search=search,
        user_branch_oid=current_user.branch_oid,
        area_manager_oid=current_user.area_manager_oid,
        user_branch_oids=scoped_branches,
    )


@router.get("/history", response_model=TrackHistoryResponse)
def get_track_history(
    employee_oid: int = Query(..., description="Field Officer employee OID"),
    date: str = Query(..., description="Target date in YYYY-MM-DD format"),
    trip_number: Optional[int] = Query(None, description="Optional Punch Trip / Session number (1, 2, ...) to view specific punch interval"),
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
):
    """Retrieve full route history, raw GPS waypoints, actual unique SITE_VISIT_SESSIONS, and attendance punch logs for an officer on a selected date scoped by user branch context."""
    scoped_branches = current_user.resolve_scoped_branch_oids(None)
    return TrackingService.get_track_history_data(
        db,
        employee_oid=employee_oid,
        date_str=date,
        user_branch_oid=current_user.branch_oid,
        trip_number=trip_number,
        area_manager_oid=current_user.area_manager_oid,
        user_branch_oids=scoped_branches,
    )


@router.get("/planned-vs-actual", response_model=PlannedVsActualResponse)
def get_planned_vs_actual(
    employee_oid: Optional[int] = Query(None, description="Optional Field Officer employee OID"),
    date: Optional[str] = Query(None, description="Optional target date in YYYY-MM-DD format"),
    period: str = Query("weekly", description="Planning period context: 'weekly', 'monthly', or 'single'"),
    branch_oid: Optional[int] = Query(None, description="Optional branch ID filter"),
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
):
    """Compare planned visit targets against actual completed site visits scoped by user branch context."""
    scoped_branches = current_user.resolve_scoped_branch_oids(branch_oid)
    return TrackingService.get_planned_vs_actual_data(
        db,
        employee_oid=employee_oid,
        date_str=date,
        period=period,
        user_branch_oid=current_user.branch_oid,
        area_manager_oid=current_user.area_manager_oid,
        user_branch_oids=scoped_branches,
    )

