import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException, status

from app.enums.role_type import RoleType
from app.schemas.user_context import UserContext
from app.services.report_email_access_service import ReportEmailAccessService
from app.api.v1.report_email_access import require_admin
from app.dependencies.auth import get_current_user_context


class TestReportEmailAccessAuthUnit(unittest.TestCase):
    """Unit test suite for Report Email Access Admin-only authorization."""

    def test_A_admin_access_allowed(self):
        """Test A: Admin context (X-User-ID: admin) passes require_admin check."""
        admin_ctx = UserContext(
            user_account_oid=1,
            user_id="admin",
            name="admin",
            app_role=RoleType.ADMIN,
            branch_oid=None,
        )

        res = require_admin(current_user=admin_ctx)
        self.assertEqual(res.app_role, RoleType.ADMIN)

        mock_db = MagicMock()
        mock_db.execute.return_value.fetchall.return_value = []
        out = ReportEmailAccessService.get_branches(mock_db, user_role=admin_ctx.app_role)
        self.assertIsNotNone(out)

    def test_B_area_manager_access_rejected(self):
        """Test B: Area Manager context (X-User-ID: EMP009) raises HTTP 403 Forbidden."""
        rahul_ctx = UserContext(
            user_account_oid=7897,
            user_id="EMP009",
            name="Rahul Paigude",
            app_role=RoleType.AREA_MANAGER,
            branch_oid=6,
        )

        with self.assertRaises(HTTPException) as cm:
            require_admin(current_user=rahul_ctx)

        self.assertEqual(cm.exception.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("restricted to administrators", cm.exception.detail)

        mock_db = MagicMock()
        with self.assertRaises(HTTPException) as cm_srv:
            ReportEmailAccessService.get_branches(mock_db, user_role=rahul_ctx.app_role)
        self.assertEqual(cm_srv.exception.status_code, status.HTTP_403_FORBIDDEN)

    def test_C_manager_access_rejected(self):
        """Test C: Manager context raises HTTP 403 Forbidden."""
        manager_ctx = UserContext(
            user_account_oid=200,
            user_id="MGR001",
            name="Manager User",
            app_role=RoleType.MANAGER,
            branch_oid=6,
        )

        with self.assertRaises(HTTPException) as cm:
            require_admin(current_user=manager_ctx)

        self.assertEqual(cm.exception.status_code, status.HTTP_403_FORBIDDEN)

    def test_D_field_officer_access_rejected(self):
        """Test D: Field Officer context raises HTTP 403 Forbidden."""
        fo_ctx = UserContext(
            user_account_oid=300,
            user_id="FO001",
            name="Field Officer User",
            app_role=RoleType.FIELD_OFFICER,
            branch_oid=6,
        )

        with self.assertRaises(HTTPException) as cm:
            require_admin(current_user=fo_ctx)

        self.assertEqual(cm.exception.status_code, status.HTTP_403_FORBIDDEN)

    def test_E_missing_x_user_id_401(self):
        """Test E: Missing X-User-ID header raises HTTP 401."""
        mock_db = MagicMock()
        with self.assertRaises(HTTPException) as cm:
            get_current_user_context(x_user_id=None, db=mock_db)
        self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_F_unknown_x_user_id_401(self):
        """Test F: Unknown X-User-ID header raises HTTP 401."""
        mock_db = MagicMock()
        with patch("app.dependencies.auth.UserService.get_user_context_by_user_id", side_effect=HTTPException(status_code=404)):
            with self.assertRaises(HTTPException) as cm:
                get_current_user_context(x_user_id="UNKNOWN_ID", db=mock_db)
            self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_G_patch_endpoint_admin_only(self):
        """Test G: PATCH update_branch_email_access rejects Area Manager."""
        mock_db = MagicMock()
        rahul_ctx = UserContext(
            user_account_oid=7897,
            user_id="EMP009",
            name="Rahul Paigude",
            app_role=RoleType.AREA_MANAGER,
            branch_oid=6,
        )

        with self.assertRaises(HTTPException) as cm:
            ReportEmailAccessService.update_branch_email_access(
                db=mock_db, branch_oid=6, email_access=True, user_role=rahul_ctx.app_role
            )
        self.assertEqual(cm.exception.status_code, status.HTTP_403_FORBIDDEN)


class TestReportEmailAccessLiveDB(unittest.TestCase):
    """Integration test suite for Report Email Access against live database."""

    def test_admin_get_branches_live(self):
        """Verify Admin can fetch branches in Report Email Access via live DB."""
        from app.database.database import SessionLocal
        db = SessionLocal()
        try:
            res = ReportEmailAccessService.get_branches(db, user_role=RoleType.ADMIN)
            self.assertIsNotNone(res.summary)
            self.assertTrue(len(res.branches) > 0)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
