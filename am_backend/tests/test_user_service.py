import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException, status

from app.enums.role_type import RoleType
from app.schemas.user_context import UserContext
from app.repositories.user_repository import UserRepository
from app.services.user_service import UserService


class TestUserService(unittest.TestCase):
    """Unit test suite for UserService identity and branch scope resolution."""

    def test_A_rahul_area_manager_resolution(self):
        """Test A: Rahul Paigude (user_account_oid = 7897) resolves to qrda_areamanager and branch_oid = 6."""
        mock_db = MagicMock()
        mock_data = {
            "user_account_oid": 7897,
            "user_id": "EMP009",
            "name": "Rahul Paigude",
            "app_role": "qrda_areamanager",
            "branch_oid": 6,
        }

        with patch.object(UserRepository, "get_user_account_with_branch", return_value=mock_data):
            ctx = UserService.get_user_context(mock_db, 7897)
            self.assertEqual(ctx.user_account_oid, 7897)
            self.assertEqual(ctx.user_id, "EMP009")
            self.assertEqual(ctx.name, "Rahul Paigude")
            self.assertEqual(ctx.app_role, RoleType.AREA_MANAGER)
            self.assertEqual(ctx.branch_oid, 6)

    def test_B_admin_unrestricted_resolution(self):
        """Test B: Admin account resolves to app_role = admin and branch_oid = None."""
        mock_db = MagicMock()
        mock_data = {
            "user_account_oid": 1001,
            "user_id": "ADM001",
            "name": "System Admin",
            "app_role": "admin",
            "branch_oid": None,
        }

        with patch.object(UserRepository, "get_user_account_with_branch", return_value=mock_data):
            ctx = UserService.get_user_context(mock_db, 1001)
            self.assertEqual(ctx.user_account_oid, 1001)
            self.assertEqual(ctx.user_id, "ADM001")
            self.assertEqual(ctx.app_role, RoleType.ADMIN)
            self.assertIsNone(ctx.branch_oid)

    def test_C_missing_user_account(self):
        """Test C: Missing USER_ACCOUNT raises HTTP 404 Not Found exception."""
        mock_db = MagicMock()

        with patch.object(UserRepository, "get_user_account_with_branch", return_value=None):
            with self.assertRaises(HTTPException) as cm:
                UserService.get_user_context(mock_db, 999999)
            self.assertEqual(cm.exception.status_code, status.HTTP_404_NOT_FOUND)
            self.assertIn("not found", cm.exception.detail)

    def test_D_area_manager_without_branch_mapping(self):
        """Test D: Area Manager missing branch mapping raises HTTP 403 Forbidden and DOES NOT default to None."""
        mock_db = MagicMock()
        mock_data = {
            "user_account_oid": 8888,
            "user_id": "UNMAPPED_AM",
            "name": "Unmapped Area Manager",
            "app_role": "qrda_areamanager",
            "branch_oid": None,  # No branch mapping in AREA_MANAGER/STAFF/BRANCH
        }

        with patch.object(UserRepository, "get_user_account_with_branch", return_value=mock_data):
            with self.assertRaises(HTTPException) as cm:
                UserService.get_user_context(mock_db, 8888)
            self.assertEqual(cm.exception.status_code, status.HTTP_403_FORBIDDEN)
            self.assertIn("no assigned branch scope configured", cm.exception.detail)


class TestUserServiceLiveDB(unittest.TestCase):
    """Live database test suite verifying real database record resolution."""

    def test_live_rahul_record(self):
        """Test live lookup of Rahul Paigude (7897) against real database."""
        from app.database.database import SessionLocal
        db = SessionLocal()
        try:
            ctx = UserService.get_user_context(db, 7897)
            self.assertEqual(ctx.user_account_oid, 7897)
            self.assertEqual(ctx.user_id, "EMP009")
            self.assertEqual(ctx.name, "Rahul Paigude")
            self.assertEqual(ctx.app_role, RoleType.AREA_MANAGER)
            self.assertEqual(ctx.branch_oid, 6)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
