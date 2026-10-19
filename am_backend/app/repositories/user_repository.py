from typing import Any, Dict, List, Optional
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)


class UserRepository:
    """Repository for querying USER_ACCOUNT, AREA_MANAGER, STAFF, and BRANCH mappings."""

    @staticmethod
    def get_user_account_with_branch(db: Session, user_account_oid: int) -> Optional[Dict[str, Any]]:
        """Query USER_ACCOUNT joined with AREA_MANAGER and STAFF to resolve user identity and branch scoping.

        Args:
            db: SQLAlchemy Session
            user_account_oid: Primary key oid of the USER_ACCOUNT table

        Returns:
            Dict containing user_account_oid, user_id, name, app_role, and branch_oid if found, else None.
        """
        query = text("""
            SELECT
                ua.oid AS user_account_oid,
                ua.user_id,
                ua.user_name AS name,
                ua.app_role,
                am.oid AS area_manager_oid,
                s.oid AS staff_oid,
                s.BRANCH AS branch_oid,
                b.name AS branch_name
            FROM USER_ACCOUNT ua
            LEFT JOIN AREA_MANAGER am
                ON am.USER_ACCOUNT = ua.oid
            LEFT JOIN STAFF s
                ON s.oid = am.STAFF
            LEFT JOIN BRANCH b
                ON b.oid = s.BRANCH
            WHERE ua.oid = :user_account_oid
        """)
        row = db.execute(query, {"user_account_oid": user_account_oid}).fetchone()
        if not row:
            return None
        return dict(row._mapping)

    @staticmethod
    def get_user_account_by_user_id(db: Session, user_id: str) -> Optional[Dict[str, Any]]:
        """Query USER_ACCOUNT by user_id string joined with AREA_MANAGER, STAFF, and USER_CREDENTIALS to resolve user identity.

        Args:
            db: SQLAlchemy Session
            user_id: Target user_id string (e.g. 'EMP009', 'admin', 'ED-001', 'AM_SAXENA')

        Returns:
            Dict containing user_account_oid, user_id, name, app_role, and branch_oid if found, else None.
        """
        query = text("""
            SELECT
                ua.oid AS user_account_oid,
                ua.user_id,
                ua.user_name AS name,
                ua.app_role,
                am.oid AS area_manager_oid,
                s.oid AS staff_oid,
                s.BRANCH AS branch_oid,
                b.name AS branch_name
            FROM USER_ACCOUNT ua
            LEFT JOIN AREA_MANAGER am
                ON am.USER_ACCOUNT = ua.oid
            LEFT JOIN STAFF s
                ON s.oid = am.STAFF
            LEFT JOIN BRANCH b
                ON b.oid = s.BRANCH
            LEFT JOIN USER_CREDENTIALS uc
                ON uc.user_account_oid = ua.oid
            WHERE ua.user_id = :user_id
               OR s.emp_code = :user_id
               OR uc.user_id = :user_id
            LIMIT 1
        """)
        row = db.execute(query, {"user_id": user_id}).fetchone()
        if not row:
            return None
        return dict(row._mapping)

    @staticmethod
    def get_allocated_branches_for_staff(db: Session, staff_oid: int) -> List[int]:
        """Fetch allocated branch OIDs for an Area Manager from AREA_MANAGER_BRANCH_ALLOCATION."""
        query = text("""
            SELECT BRANCH_OID
            FROM AREA_MANAGER_BRANCH_ALLOCATION
            WHERE STAFF_OID = :staff_oid
            ORDER BY BRANCH_OID ASC
        """)
        rows = db.execute(query, {"staff_oid": staff_oid}).scalars().all()
        return [int(r) for r in rows if r is not None]

    @staticmethod
    def get_credentials_by_user_account_oid(db: Session, user_account_oid: int) -> Optional[Dict[str, Any]]:
        """Retrieve credential record from USER_CREDENTIALS for the given user_account_oid."""
        query = text("""
            SELECT oid, user_account_oid, user_id, password, is_active
            FROM USER_CREDENTIALS
            WHERE user_account_oid = :user_account_oid
            LIMIT 1
        """)
        row = db.execute(query, {"user_account_oid": user_account_oid}).fetchone()
        if not row:
            return None
        return dict(row._mapping)

    @staticmethod
    def get_credentials_by_user_id(db: Session, username: str) -> Optional[Dict[str, Any]]:
        """Retrieve credential from USER_CREDENTIALS matching user_id column directly (with fallback for user_account or staff).

        Args:
            db: SQLAlchemy Session
            username: Target user_id string

        Returns:
            Dict containing oid, user_account_oid, user_id, password, is_active if found, else None.
        """
        query = text("""
            SELECT
                uc.oid,
                uc.user_account_oid,
                uc.user_id,
                uc.password,
                uc.is_active
            FROM USER_CREDENTIALS uc
            LEFT JOIN USER_ACCOUNT ua
                ON ua.oid = uc.user_account_oid
            LEFT JOIN AREA_MANAGER am
                ON am.USER_ACCOUNT = ua.oid
            LEFT JOIN STAFF s
                ON s.oid = am.STAFF
            WHERE uc.user_id = :username
               OR ua.user_id = :username
               OR s.emp_code = :username
            LIMIT 1
        """)
        row = db.execute(query, {"username": username}).fetchone()
        if not row:
            return None
        return dict(row._mapping)


