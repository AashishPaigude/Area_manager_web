from typing import Any, Dict
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
import logging

from app.enums.role_type import RoleType
from app.schemas.user_context import UserContext
from app.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


class UserService:
    """Service layer for user identity resolution, role validation, and branch scope resolution."""

    @staticmethod
    def get_user_context(db: Session, user_account_oid: int) -> UserContext:
        """Resolve a USER_ACCOUNT oid into an authenticated UserContext.

        Args:
            db: SQLAlchemy Session
            user_account_oid: Primary key oid of the target USER_ACCOUNT

        Returns:
            UserContext containing user_account_oid, user_id, name, app_role, and branch_oid.

        Raises:
            HTTPException 404: If USER_ACCOUNT is not found in database.
            HTTPException 403: If Area Manager has no valid branch mapping configured.
        """
        user_data = UserRepository.get_user_account_with_branch(db, user_account_oid)
        if not user_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User account with OID {user_account_oid} not found",
            )

        raw_role = user_data.get("app_role")
        role_str = str(raw_role).strip().lower() if raw_role else ""

        # Role 1: Area Manager (qrda_areamanager)
        if role_str == RoleType.AREA_MANAGER.value or role_str == "qrda_areamanager":
            branch_oid = user_data.get("branch_oid")
            if branch_oid is None:
                logger.error(
                    f"Area Manager user_account_oid {user_account_oid} has no AREA_MANAGER/STAFF/BRANCH mapping."
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Area Manager user account {user_account_oid} has no assigned branch scope configured",
                )
            role_val = RoleType.AREA_MANAGER
        # Role 2: Admin (admin / superadmin or user_id == 'admin')
        elif (
            role_str in [RoleType.ADMIN.value, "admin", "superadmin"]
            or str(user_data.get("user_id", "")).strip().lower() == "admin"
        ):
            branch_oid = None
            role_val = RoleType.ADMIN
        # Other preserved roles (e.g. manager, field_officer)
        elif role_str == RoleType.MANAGER.value:
            branch_oid = user_data.get("branch_oid")
            role_val = RoleType.MANAGER
        elif role_str == RoleType.FIELD_OFFICER.value:
            branch_oid = user_data.get("branch_oid")
            role_val = RoleType.FIELD_OFFICER
        else:
            branch_oid = user_data.get("branch_oid")
            role_val = raw_role

        return UserContext(
            user_account_oid=user_data["user_account_oid"],
            user_id=user_data["user_id"],
            name=user_data["name"],
            app_role=role_val,
            branch_oid=branch_oid,
        )

    @staticmethod
    def get_user_context_by_user_id(db: Session, user_id: str) -> UserContext:
        """Resolve a USER_ACCOUNT by user_id string into an authenticated UserContext.

        Reuses the core UserContext resolution logic by looking up user_account_oid for user_id.

        Args:
            db: SQLAlchemy Session
            user_id: Target user_id string (e.g. 'EMP009', 'admin')

        Returns:
            UserContext containing user_account_oid, user_id, name, app_role, and branch_oid.

        Raises:
            HTTPException 404: If USER_ACCOUNT is not found in database.
            HTTPException 403: If Area Manager has no valid branch mapping configured.
        """
        user_data = UserRepository.get_user_account_by_user_id(db, user_id)
        if not user_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User account with user_id '{user_id}' not found",
            )
        return UserService.get_user_context(db, user_data["user_account_oid"])

