from typing import Optional, Union, List
from pydantic import BaseModel, ConfigDict, Field
from fastapi import HTTPException, status
from app.enums.role_type import RoleType


class UserContext(BaseModel):
    """Authenticated user context schema for authorization and branch scoping."""

    model_config = ConfigDict(from_attributes=True)

    user_account_oid: int
    user_id: str
    name: str
    app_role: Union[RoleType, str]
    branch_oid: Optional[int] = None
    branch_name: Optional[str] = None
    area_manager_oid: Optional[int] = None
    staff_oid: Optional[int] = None
    allocated_branch_oids: Optional[List[int]] = Field(default=None)

    def is_admin(self) -> bool:
        role_str = (
            self.app_role.value
            if hasattr(self.app_role, "value")
            else str(self.app_role)
        )
        return role_str.lower() in [RoleType.ADMIN.value.lower(), "admin", "superadmin"] or self.user_id.lower() == "admin"

    def get_authorized_branch_oids(self) -> Optional[List[int]]:
        """Return list of authorized branch OIDs.
        For Admin, returns None (unrestricted).
        For Area Manager / other scoped users, returns list of allocated branch OIDs.
        Distinguishes explicit empty list [] from None (missing allocation).
        """
        if self.is_admin():
            return None
        if self.allocated_branch_oids is not None:
            return sorted(list(set(self.allocated_branch_oids)))
        if self.branch_oid is not None:
            return [self.branch_oid]
        return []

    def validate_branch_access(self, requested_branch_oid: Optional[int]) -> Optional[int]:
        """Validate if a requested branch_oid is accessible by the current user.
        - If requested_branch_oid is None: returns None.
        - If user is Admin: returns requested_branch_oid as-is.
        - If user is Area Manager:
            If requested_branch_oid is in authorized branches: returns requested_branch_oid.
            Else: raises HTTPException 403 Forbidden.
        """
        if requested_branch_oid is None:
            return None
        if self.is_admin():
            return requested_branch_oid
        allowed = self.get_authorized_branch_oids() or []
        if requested_branch_oid in allowed:
            return requested_branch_oid
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Branch {requested_branch_oid} is not assigned to your account",
        )

    def resolve_scoped_branch_oids(self, requested_branch_oid: Optional[int] = None) -> Optional[List[int]]:
        """Returns the effective list of branch OIDs to filter by in queries.
        - If user is Admin:
            If requested_branch_oid is provided: returns [requested_branch_oid].
            Else: returns None (unrestricted).
        - If user is Area Manager / scoped user:
            If requested_branch_oid is provided:
                Validates it against authorized branches; returns [requested_branch_oid].
            Else:
                Returns self.get_authorized_branch_oids() (e.g. [8, 13, 14]).
        """
        if self.is_admin():
            return [requested_branch_oid] if requested_branch_oid is not None else None

        allowed = self.get_authorized_branch_oids() or []
        if requested_branch_oid is not None:
            if requested_branch_oid not in allowed:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied: Branch {requested_branch_oid} is not assigned to your account",
                )
            return [requested_branch_oid]
        return allowed

