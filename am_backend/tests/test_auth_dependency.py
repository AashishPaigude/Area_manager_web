import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException, status

from app.enums.role_type import RoleType
from app.schemas.user_context import UserContext
from app.dependencies.auth import get_current_user_context
from app.services.user_service import UserService


class TestAuthDependency(unittest.TestCase):
    """Unit test suite for get_current_user_context security dependency."""

    def test_A_emp009_resolution(self):
        """Test A: X-User-ID = 'EMP009' resolves to qrda_areamanager role and branch_oid = 6."""
        mock_db = MagicMock()
        mock_ctx = UserContext(
            user_account_oid=7897,
            user_id="EMP009",
            name="Rahul Paigude",
            app_role=RoleType.AREA_MANAGER,
            branch_oid=6,
        )

        with patch.object(UserService, "get_user_context_by_user_id", return_value=mock_ctx):
            ctx = get_current_user_context(x_user_id="EMP009", db=mock_db)
            self.assertEqual(ctx.user_account_oid, 7897)
            self.assertEqual(ctx.user_id, "EMP009")
            self.assertEqual(ctx.name, "Rahul Paigude")
            self.assertEqual(ctx.app_role, RoleType.AREA_MANAGER)
            self.assertEqual(ctx.branch_oid, 6)

    def test_B_admin_resolution(self):
        """Test B: X-User-ID = 'admin' resolves to admin role and branch_oid = None."""
        mock_db = MagicMock()
        mock_ctx = UserContext(
            user_account_oid=1,
            user_id="admin",
            name="admin",
            app_role=RoleType.ADMIN,
            branch_oid=None,
        )

        with patch.object(UserService, "get_user_context_by_user_id", return_value=mock_ctx):
            ctx = get_current_user_context(x_user_id="admin", db=mock_db)
            self.assertEqual(ctx.user_account_oid, 1)
            self.assertEqual(ctx.user_id, "admin")
            self.assertEqual(ctx.app_role, RoleType.ADMIN)
            self.assertIsNone(ctx.branch_oid)

    def test_C_missing_x_user_id_header(self):
        """Test C: Missing X-User-ID header raises HTTP 401 Unauthorized."""
        mock_db = MagicMock()
        with self.assertRaises(HTTPException) as cm:
            get_current_user_context(x_user_id=None, db=mock_db)
        self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("Missing or invalid authentication header", cm.exception.detail)

    def test_D_empty_x_user_id_header(self):
        """Test D: Empty or whitespace X-User-ID header raises HTTP 401 Unauthorized."""
        mock_db = MagicMock()
        for empty_val in ["", "   ", "\t"]:
            with self.assertRaises(HTTPException) as cm:
                get_current_user_context(x_user_id=empty_val, db=mock_db)
            self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)
            self.assertIn("Missing or invalid authentication header", cm.exception.detail)

    def test_E_unknown_x_user_id(self):
        """Test E: Unknown X-User-ID raises HTTP 401 Unauthorized."""
        mock_db = MagicMock()
        with patch.object(
            UserService,
            "get_user_context_by_user_id",
            side_effect=HTTPException(status_code=404, detail="User account not found"),
        ):
            with self.assertRaises(HTTPException) as cm:
                get_current_user_context(x_user_id="UNKNOWN_USER_123", db=mock_db)
            self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)
            self.assertIn("Invalid user identity", cm.exception.detail)

    def test_F_no_silent_conversion_to_admin(self):
        """Test F: Confirm that missing/invalid identity NEVER silently converts to Admin."""
        mock_db = MagicMock()
        invalid_inputs = [None, "", "  ", "random_id", "invalid_emp"]

        for inp in invalid_inputs:
            with self.assertRaises(HTTPException) as cm:
                get_current_user_context(x_user_id=inp, db=mock_db)
            self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)


class TestAuthDependencyLiveDB(unittest.TestCase):
    """Live database test suite for get_current_user_context against real MySQL records."""

    def test_live_emp009_resolution(self):
        """Test live lookup of X-User-ID = 'EMP009' against real database."""
        from app.database.database import SessionLocal
        db = SessionLocal()
        try:
            ctx = get_current_user_context(x_user_id="EMP009", db=db)
            self.assertEqual(ctx.user_account_oid, 7897)
            self.assertEqual(ctx.user_id, "EMP009")
            self.assertEqual(ctx.name, "Rahul Paigude")
            self.assertEqual(ctx.app_role, RoleType.AREA_MANAGER)
            self.assertEqual(ctx.branch_oid, 6)
        finally:
            db.close()

    def test_live_admin_resolution(self):
        """Test live lookup of X-User-ID = 'admin' against real database."""
        from app.database.database import SessionLocal
        db = SessionLocal()
        try:
            ctx = get_current_user_context(x_user_id="admin", db=db)
            self.assertEqual(ctx.user_account_oid, 1)
            self.assertEqual(ctx.user_id, "admin")
            self.assertIn(ctx.app_role, [RoleType.ADMIN, "USER", "admin"])
            self.assertIsNone(ctx.branch_oid)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
