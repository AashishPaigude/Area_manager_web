from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.dependencies.database import get_db
from app.dependencies.auth import get_current_user_context
from app.enums.role_type import RoleType
from app.schemas.user_context import UserContext
from app.schemas.report_email_access import (
    ReportEmailAccessResponse,
    UpdateEmailAccessRequest,
    UpdateEmailAccessResponse
)
from app.services.report_email_access_service import ReportEmailAccessService

router = APIRouter()


def require_admin(current_user: UserContext = Depends(get_current_user_context)) -> UserContext:
    """Enforce that current_user has Admin role."""
    role_str = current_user.app_role.value if hasattr(current_user.app_role, "value") else str(current_user.app_role)
    if role_str.lower() != RoleType.ADMIN.value.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Report Email Access is restricted to administrators."
        )
    return current_user


@router.get("/branches", response_model=ReportEmailAccessResponse)
def get_report_email_access_branches(
    current_user: UserContext = Depends(require_admin),
    db: Session = Depends(get_db)
) -> ReportEmailAccessResponse:
    """
    Get list of branches with active Field Officer counts (DESIGNATION = 19, active = 1)
    and KPI counts for Report Email Access. Admin-only.
    """
    return ReportEmailAccessService.get_branches(db, user_role=current_user.app_role)


@router.patch("/branches/{branch_oid}", response_model=UpdateEmailAccessResponse)
def update_branch_email_access(
    branch_oid: int,
    payload: UpdateEmailAccessRequest,
    current_user: UserContext = Depends(require_admin),
    db: Session = Depends(get_db)
) -> UpdateEmailAccessResponse:
    """
    Enable or disable report email access for a specific branch (updates BRANCH.email_access). Admin-only.
    """
    return ReportEmailAccessService.update_branch_email_access(
        db=db,
        branch_oid=branch_oid,
        email_access=payload.email_access,
        user_role=current_user.app_role
    )

