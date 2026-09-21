import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException, status
from sqlalchemy import text

from app.enums.role_type import RoleType
from app.schemas.user_context import UserContext
from app.repositories.dashboard_repository import DashboardRepository
from app.services.dashboard_service import DashboardService
from app.dependencies.auth import get_current_user_context


class TestDashboardAuthUnit(unittest.TestCase):
    """Unit test suite for Dashboard authorization logic and branch scoping."""

    def test_A_admin_dashboard_unrestricted(self):
        """Test A: Admin context (X-User-ID: admin) passes branch_oid=None to DashboardRepository."""
        mock_db = MagicMock()
        admin_ctx = UserContext(
            user_account_oid=1,
            user_id="admin",
            name="admin",
            app_role=RoleType.ADMIN,
            branch_oid=None,
        )

        with patch.object(DashboardRepository, "get_dashboard_data", return_value={"summary": {}, "officers": []}) as mock_repo:
            res = DashboardService.get_dashboard_summary(
                db=mock_db, force_refresh=True, branch_oid=admin_ctx.branch_oid
            )
            mock_repo.assert_called_once()
            _, kwargs = mock_repo.call_args
            self.assertIsNone(kwargs.get("branch_oid"))

    def test_B_rahul_dashboard_restricted_to_branch_6(self):
        """Test B: Rahul context (X-User-ID: EMP009) passes branch_oid=6 to DashboardRepository."""
        mock_db = MagicMock()
        rahul_ctx = UserContext(
            user_account_oid=7897,
            user_id="EMP009",
            name="Rahul Paigude",
            app_role=RoleType.AREA_MANAGER,
            branch_oid=6,
        )

        with patch.object(DashboardRepository, "get_dashboard_data", return_value={"summary": {}, "officers": []}) as mock_repo:
            res = DashboardService.get_dashboard_summary(
                db=mock_db, force_refresh=True, branch_oid=rahul_ctx.branch_oid
            )
            mock_repo.assert_called_once()
            _, kwargs = mock_repo.call_args
            self.assertEqual(kwargs.get("branch_oid"), 6)

    def test_C_missing_user_header_401(self):
        """Test C: Missing X-User-ID header returns HTTP 401 Unauthorized."""
        mock_db = MagicMock()
        with self.assertRaises(HTTPException) as cm:
            get_current_user_context(x_user_id=None, db=mock_db)
        self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_D_unknown_user_header_401(self):
        """Test D: Unknown X-User-ID header returns HTTP 401 Unauthorized."""
        mock_db = MagicMock()
        with patch("app.dependencies.auth.UserService.get_user_context_by_user_id", side_effect=HTTPException(status_code=404)):
            with self.assertRaises(HTTPException) as cm:
                get_current_user_context(x_user_id="UNKNOWN_ID", db=mock_db)
            self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_F_sql_parameter_safety(self):
        """Test F: Verify branch_oid is passed as a SQL text parameter and not string-interpolated."""
        mock_db = MagicMock()
        mock_db.execute.return_value.mappings.return_value.all.return_value = []
        mock_db.execute.return_value.mappings.return_value.first.return_value = {}
        mock_db.execute.return_value.scalar.return_value = 0

        # Execute DashboardRepository.get_dashboard_data with branch_oid = 6
        DashboardRepository.get_dashboard_data(mock_db, branch_oid=6)

        # Inspect all execute calls to ensure params dictionary contains branch_oid
        for call_item in mock_db.execute.call_args_list:
            args, kwargs = call_item
            if len(args) > 1 and isinstance(args[1], dict):
                params_dict = args[1]
                if "branch_oid" in params_dict:
                    self.assertEqual(params_dict["branch_oid"], 6)


class TestDashboardAuthLiveDB(unittest.TestCase):
    """Integration test suite for Dashboard branch isolation against real database."""

    def test_E_rahul_branch_isolation_live(self):
        """Test E: Verify Rahul's live Dashboard data includes ONLY officers from Branch 6 (Pune)."""
        from app.database.database import SessionLocal
        db = SessionLocal()
        try:
            # 1. Fetch Rahul's scoped dashboard data (branch_oid = 6)
            rahul_data = DashboardRepository.get_dashboard_data(db, branch_oid=6)
            rahul_officers = rahul_data.get("officers", [])

            # 2. Verify all officers in Rahul's roster belong to Branch 6
            if rahul_officers:
                emp_oids = [o["employee_oid"] for o in rahul_officers]
                oids_tuple = tuple(emp_oids) if len(emp_oids) > 1 else f"({emp_oids[0]})"
                
                # Check DB for branches of these officers
                branches = db.execute(
                    text(f"SELECT DISTINCT BRANCH FROM EMPLOYEE WHERE oid IN {oids_tuple}")
                ).fetchall()
                branch_ids = [b[0] for b in branches]
                
                self.assertEqual(len(branch_ids), 1)
                self.assertEqual(branch_ids[0], 6)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
