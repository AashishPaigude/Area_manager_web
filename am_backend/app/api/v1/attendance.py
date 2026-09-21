from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies.database import get_db
from app.dependencies.auth import get_current_user_context
from app.schemas.user_context import UserContext
from app.schemas.attendance import AttendanceListResponse
from app.services.attendance_service import AttendanceService

router = APIRouter()


@router.get("", response_model=AttendanceListResponse)
@router.get("/", response_model=AttendanceListResponse)
def get_attendance(
    date: Optional[str] = Query(
        None,
        description="Attendance date in YYYY-MM-DD format. Defaults to current local date.",
    ),
    status: Optional[str] = Query(
        "ALL",
        description="Filter status: ALL, PRESENT, ABSENT, or MISSED_PUNCH. Defaults to ALL.",
    ),
    start_date: Optional[str] = Query(
        None,
        description="Start date for date range in YYYY-MM-DD format.",
    ),
    end_date: Optional[str] = Query(
        None,
        description="End date for date range in YYYY-MM-DD format.",
    ),
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> AttendanceListResponse:
    """Retrieve real-time Field Officer attendance list and summary counts scoped by user branch context.

    Supports optional filtering by attendance date, date ranges, and officer status (ALL, PRESENT, ABSENT).
    """
    return AttendanceService.get_attendance(
        db=db, 
        date_str=date, 
        status_param=status,
        start_date_str=start_date,
        end_date_str=end_date,
        user_branch_oid=current_user.branch_oid
    )

