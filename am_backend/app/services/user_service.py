from typing import Any, Dict
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
import logging
import bcrypt

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
            area_manager_oid = user_data.get("area_manager_oid")
            if area_manager_oid is None and branch_oid is None:
                logger.error(
                    f"Area Manager user_account_oid {user_account_oid} has no AREA_MANAGER/STAFF mapping."
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

        staff_oid = user_data.get("staff_oid")
        allocated_branches = []
        if staff_oid:
            allocated_branches = UserRepository.get_allocated_branches_for_staff(db, staff_oid)
        if not allocated_branches and branch_oid is not None:
            allocated_branches = [branch_oid]

        return UserContext(
            user_account_oid=user_data["user_account_oid"],
            user_id=user_data["user_id"],
            name=user_data["name"],
            app_role=role_val,
            branch_oid=branch_oid,
            branch_name=user_data.get("branch_name"),
            area_manager_oid=user_data.get("area_manager_oid"),
            staff_oid=staff_oid,
            allocated_branch_oids=allocated_branches,
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
        ctx = UserService.get_user_context(db, user_data["user_account_oid"])
        return UserContext(
            user_account_oid=ctx.user_account_oid,
            user_id=user_id,
            name=ctx.name,
            app_role=ctx.app_role,
            branch_oid=ctx.branch_oid,
            branch_name=ctx.branch_name,
            area_manager_oid=ctx.area_manager_oid,
            staff_oid=ctx.staff_oid,
            allocated_branch_oids=ctx.allocated_branch_oids,
        )

    @staticmethod
    def authenticate_user(db: Session, username: str, password: str) -> UserContext:
        """Authenticate user credentials directly against USER_CREDENTIALS user_id and password columns.

        Args:
            db: SQLAlchemy Session
            username: user_id from USER_CREDENTIALS (or staff emp_code / user_account user_id)
            password: Plaintext password string from USER_CREDENTIALS password column

        Returns:
            UserContext on successful authentication.

        Raises:
            HTTPException 401: Invalid credentials.
            HTTPException 403: Account deactivated.
        """
        clean_user = username.strip() if username else ""
        if not clean_user or not password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Username and password are required",
            )

        creds = UserRepository.get_credentials_by_user_id(db, clean_user)
        if not creds:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )

        if creds.get("is_active") == 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is deactivated",
            )

        stored_password = str(creds.get("password") or "")
        if password != stored_password and password.strip() != stored_password.strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )

        user_account_oid = creds["user_account_oid"]
        return UserService.get_user_context(db, user_account_oid)


