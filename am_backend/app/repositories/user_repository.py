from typing import Any, Dict, Optional
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
                s.BRANCH AS branch_oid
            FROM USER_ACCOUNT ua
            LEFT JOIN AREA_MANAGER am
                ON am.USER_ACCOUNT = ua.oid
            LEFT JOIN STAFF s
                ON s.oid = am.STAFF
            WHERE ua.oid = :user_account_oid
        """)
        row = db.execute(query, {"user_account_oid": user_account_oid}).fetchone()
        if not row:
            return None
        return dict(row._mapping)

    @staticmethod
    def get_user_account_by_user_id(db: Session, user_id: str) -> Optional[Dict[str, Any]]:
        """Query USER_ACCOUNT by user_id string joined with AREA_MANAGER and STAFF to resolve user identity.

        Args:
            db: SQLAlchemy Session
            user_id: Target user_id string (e.g. 'EMP009', 'admin')

        Returns:
            Dict containing user_account_oid, user_id, name, app_role, and branch_oid if found, else None.
        """
        query = text("""
            SELECT
                ua.oid AS user_account_oid,
                ua.user_id,
                ua.user_name AS name,
                ua.app_role,
                s.BRANCH AS branch_oid
            FROM USER_ACCOUNT ua
            LEFT JOIN AREA_MANAGER am
                ON am.USER_ACCOUNT = ua.oid
            LEFT JOIN STAFF s
                ON s.oid = am.STAFF
            WHERE ua.user_id = :user_id
        """)
        row = db.execute(query, {"user_id": user_id}).fetchone()
        if not row:
            return None
        return dict(row._mapping)

