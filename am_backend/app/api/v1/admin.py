from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.dependencies.database import get_db
from app.dependencies.auth import get_current_user_context
from app.enums.role_type import RoleType
from app.schemas.user_context import UserContext
from datetime import datetime
from app.models.employee import Employee
from app.models.branch import Branch
from app.models.field_officer_track_history_config import FieldOfficerTrackHistoryConfig
from app.repositories.visit_repository import VisitRepository

router = APIRouter()



class OfficerTrackHistoryResponse(BaseModel):
    employee_id: int
    employee_oid: int
    name: str
    emp_code: Optional[str] = None
    branch_oid: Optional[int] = None
    branch_name: Optional[str] = None
    track_history_enabled: int

    class Config:
        from_attributes = True


class PatchTrackHistoryRequest(BaseModel):
    track_history_enabled: int = Field(..., ge=0, le=1)


class PatchTrackHistoryResponse(BaseModel):
    success: bool
    message: str
    employee_id: int
    track_history_enabled: int


def _is_admin(current_user: UserContext) -> bool:
    role_str = (
        current_user.app_role.value
        if hasattr(current_user.app_role, "value")
        else str(current_user.app_role)
    )
    return role_str.lower() == RoleType.ADMIN.value.lower()


def _can_access_officer(
    current_user: UserContext,
    emp: Employee,
    allowed_branches: Optional[List[int]],
) -> bool:
    if _is_admin(current_user):
        return True

    # 1. Direct assignment to this Area Manager
    if current_user.area_manager_oid is not None and emp.AREA_MANAGER_OID == current_user.area_manager_oid:
        return True

    # 2. Officer is in Area Manager's allowed branches (and not assigned to another area manager)
    if allowed_branches and emp.BRANCH in allowed_branches:
        if emp.AREA_MANAGER_OID is None or emp.AREA_MANAGER_OID == current_user.area_manager_oid:
            return True

    # 3. Direct branch match
    if current_user.branch_oid is not None and emp.BRANCH == current_user.branch_oid:
        if emp.AREA_MANAGER_OID is None or emp.AREA_MANAGER_OID == current_user.area_manager_oid:
            return True

    return False


@router.get("/employees/track-history", response_model=List[OfficerTrackHistoryResponse])
def get_all_employees_track_history(
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> List[OfficerTrackHistoryResponse]:
    """
    Retrieve all authorized Field Officers with their Track History setting.
    Scoped to current_user.branch_oid / area_manager_oid unless user is Admin.
    """
    query = (
        db.query(Employee, Branch.name.label("branch_name"))
        .outerjoin(Branch, Employee.BRANCH == Branch.oid)
        .filter(Employee.active == 1, Employee.DESIGNATION == 19)
    )

    if not _is_admin(current_user):
        allowed = VisitRepository._resolve_allowed_branches(
            db, current_user.branch_oid, current_user.area_manager_oid, current_user.allocated_branch_oids
        )
        conditions = []
        if current_user.area_manager_oid is not None:
            conditions.append(Employee.AREA_MANAGER_OID == current_user.area_manager_oid)
        if allowed:
            conditions.append(
                and_(
                    Employee.BRANCH.in_(allowed),
                    or_(
                        Employee.AREA_MANAGER_OID.is_(None),
                        Employee.AREA_MANAGER_OID == current_user.area_manager_oid,
                    ),
                )
            )
        elif current_user.branch_oid is not None:
            conditions.append(
                and_(
                    Employee.BRANCH == current_user.branch_oid,
                    or_(
                        Employee.AREA_MANAGER_OID.is_(None),
                        Employee.AREA_MANAGER_OID == current_user.area_manager_oid,
                    ),
                )
            )

        if conditions:
            query = query.filter(or_(*conditions))
        else:
            return []

    results = query.order_by(Employee.name.asc()).all()

    return [
        OfficerTrackHistoryResponse(
            employee_id=emp.oid,
            employee_oid=emp.oid,
            name=emp.name,
            emp_code=emp.emp_code or f"EMP{emp.oid}",
            branch_oid=emp.BRANCH,
            branch_name=branch_name or "—",
            track_history_enabled=int(emp.track_history_enabled) if emp.track_history_enabled is not None else 1,
        )
        for emp, branch_name in results
    ]


@router.get("/employees/{employee_id}/track-history", response_model=OfficerTrackHistoryResponse)
def get_employee_track_history(
    employee_id: int,
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> OfficerTrackHistoryResponse:
    """
    Retrieve specific officer's Track History setting with authorization validation.
    """
    record = (
        db.query(Employee, Branch.name.label("branch_name"))
        .outerjoin(Branch, Employee.BRANCH == Branch.oid)
        .filter(Employee.oid == employee_id)
        .first()
    )

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Field Officer with ID {employee_id} not found",
        )

    emp, branch_name = record

    if not _is_admin(current_user):
        allowed = VisitRepository._resolve_allowed_branches(
            db, current_user.branch_oid, current_user.area_manager_oid, current_user.allocated_branch_oids
        )
        if not _can_access_officer(current_user, emp, allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Officer is not assigned to this area manager or branch",
            )

    return OfficerTrackHistoryResponse(
        employee_id=emp.oid,
        employee_oid=emp.oid,
        name=emp.name,
        emp_code=emp.emp_code or f"EMP{emp.oid}",
        branch_oid=emp.BRANCH,
        branch_name=branch_name or "—",
        track_history_enabled=int(emp.track_history_enabled) if emp.track_history_enabled is not None else 1,
    )


@router.patch("/employees/{employee_id}/track-history", response_model=PatchTrackHistoryResponse)
def update_employee_track_history(
    employee_id: int,
    payload: PatchTrackHistoryRequest,
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> PatchTrackHistoryResponse:
    """
    Update Field Officer's Track History collection setting immediately.
    1 = ENABLED, 0 = DISABLED.
    """
    employee = db.query(Employee).filter(Employee.oid == employee_id).first()

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Field Officer with ID {employee_id} not found",
        )

    if not _is_admin(current_user):
        allowed = VisitRepository._resolve_allowed_branches(
            db, current_user.branch_oid, current_user.area_manager_oid, current_user.allocated_branch_oids
        )
        if not _can_access_officer(current_user, employee, allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You are not authorized to modify officers not assigned to this area manager or branch",
            )

    employee.track_history_enabled = payload.track_history_enabled

    # Record immediate toggle in FIELD_OFFICER_TRACK_HISTORY_CONFIG
    now = datetime.now()
    open_configs = db.query(FieldOfficerTrackHistoryConfig).filter(
        FieldOfficerTrackHistoryConfig.employee_oid == employee_id,
        FieldOfficerTrackHistoryConfig.effective_to.is_(None)
    ).all()
    for cfg in open_configs:
        cfg.effective_to = now

    updated_by_str = getattr(current_user, "username", None) or str(getattr(current_user, "user_id", "admin"))
    new_cfg = FieldOfficerTrackHistoryConfig(
        employee_oid=employee_id,
        is_enabled=payload.track_history_enabled,
        effective_from=now,
        effective_to=None,
        updated_by=updated_by_str
    )
    db.add(new_cfg)
    db.commit()
    db.refresh(employee)

    action_text = "enabled" if payload.track_history_enabled == 1 else "disabled"
    return PatchTrackHistoryResponse(
        success=True,
        message=f"Track History successfully {action_text}. Changes take effect immediately.",
        employee_id=employee.oid,
        track_history_enabled=int(employee.track_history_enabled),
    )

