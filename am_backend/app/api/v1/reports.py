from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies.database import get_db
from app.dependencies.auth import get_current_user_context
from app.schemas.user_context import UserContext
from app.schemas.reports import CombinedReportResponse, OfficerListItem
from app.services.report_service import ReportService

router = APIRouter()


@router.get("/officers", response_model=List[OfficerListItem])
def get_officers(
    branch_oid: Optional[int] = Query(None, description="Optional Branch OID filter"),
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> List[OfficerListItem]:
    """Get available active officers for the Reports selector dropdown scoped by user branch / AM context."""
    scoped_branches = current_user.resolve_scoped_branch_oids(branch_oid)
    return ReportService.get_officers(
        db,
        user_branch_oid=current_user.branch_oid,
        area_manager_oid=current_user.area_manager_oid,
        user_branch_oids=scoped_branches,
    )


@router.get("/officers-with-reports", response_model=List[OfficerListItem])
def get_officers_with_reports(
    branch_oid: Optional[int] = Query(None, description="Optional Branch OID filter"),
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> List[OfficerListItem]:
    """Get distinct officers who have at least one report for the Reports page roster scoped by user branch / AM context."""
    scoped_branches = current_user.resolve_scoped_branch_oids(branch_oid)
    return ReportService.get_officers_with_reports(
        db,
        user_branch_oid=current_user.branch_oid,
        area_manager_oid=current_user.area_manager_oid,
        user_branch_oids=scoped_branches,
    )


@router.get("/combined/{employee_oid}", response_model=CombinedReportResponse)
def get_combined_report(
    employee_oid: int,
    from_date: Optional[date] = Query(None, description="Filter reports starting from this date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="Filter reports up to this date (YYYY-MM-DD)"),
    plan_oid: Optional[int] = Query(None, description="Filter reports by assigned visit plan OID"),
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> CombinedReportResponse:
    """Get consolidated Combined Officer Operations Report for a selected officer scoped by user branch / AM context."""
    scoped_branches = current_user.resolve_scoped_branch_oids(None)
    return ReportService.get_combined_report(
        db=db,
        employee_oid=employee_oid,
        from_date=from_date,
        to_date=to_date,
        plan_oid=plan_oid,
        user_branch_oid=current_user.branch_oid,
        area_manager_oid=current_user.area_manager_oid,
        user_branch_oids=scoped_branches,
    )

