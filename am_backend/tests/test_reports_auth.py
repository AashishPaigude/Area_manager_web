import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException, status

from app.core.exceptions import AppBaseException
from app.enums.role_type import RoleType
from app.schemas.user_context import UserContext
from app.services.report_service import ReportService
from app.repositories.report_repository import ReportRepository
from app.dependencies.auth import get_current_user_context
from app.models.employee import Employee


class TestReportsAuthUnit(unittest.TestCase):
    """Unit test suite for Reports module branch authorization."""

    def test_A_admin_reports_unrestricted(self):
        """Test A: Admin context (X-User-ID: admin) passes user_branch_oid=None."""
        mock_db = MagicMock()
        admin_ctx = UserContext(
            user_account_oid=1,
            user_id="admin",
            name="admin",
            app_role=RoleType.ADMIN,
            branch_oid=None,
        )

        with patch.object(ReportRepository, "get_officers", return_value=[]) as mock_repo:
            res = ReportService.get_officers(mock_db, user_branch_oid=admin_ctx.branch_oid)
            mock_repo.assert_called_once_with(mock_db, user_branch_oid=None)

    def test_B_rahul_reports_restricted_to_branch_6(self):
        """Test B: Rahul context (X-User-ID: EMP009) passes user_branch_oid=6."""
        mock_db = MagicMock()
        rahul_ctx = UserContext(
            user_account_oid=7897,
            user_id="EMP009",
            name="Rahul Paigude",
            app_role=RoleType.AREA_MANAGER,
            branch_oid=6,
        )

        with patch.object(ReportRepository, "get_officers", return_value=[]) as mock_repo:
            res = ReportService.get_officers(mock_db, user_branch_oid=rahul_ctx.branch_oid)
            mock_repo.assert_called_once_with(mock_db, user_branch_oid=6)

    def test_D_cross_branch_employee_report_rejected(self):
        """Test D: Rahul (branch 6) requesting combined report for Branch 7 officer raises HTTP 403."""
        mock_db = MagicMock()

        # Mock employee lookup returning Branch 7 officer
        mock_db.execute.return_value.mappings.return_value.first.return_value = {
            "employee_oid": 999,
            "officer": "Branch 7 Officer",
            "emp_code": "EMP999",
            "branch": 7,
        }

        with self.assertRaises(AppBaseException) as cm:
            ReportService.get_combined_report(
                mock_db, employee_oid=999, user_branch_oid=6
            )

        self.assertEqual(cm.exception.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("belongs to another branch", str(cm.exception))

    def test_G_date_range_report_scoped(self):
        """Test G: Date range report for Branch 6 officer succeeds with branch scope active."""
        mock_db = MagicMock()

        # Mock employee lookup returning Branch 6 officer
        mock_db.execute.return_value.mappings.return_value.first.return_value = {
            "employee_oid": 101,
            "officer": "Rahul Paigude",
            "emp_code": "EMP009",
            "branch": 6,
        }
        mock_db.execute.return_value.mappings.return_value.all.return_value = []

        with patch.object(ReportRepository, "get_site", return_value=None):
            res = ReportService.get_combined_report(
                mock_db, employee_oid=101, user_branch_oid=6
            )
            self.assertIsNotNone(res)
            self.assertEqual(res.officer.employee_oid, 101)

    def test_J_missing_x_user_id_401(self):
        """Test J: Missing X-User-ID header raises HTTP 401."""
        mock_db = MagicMock()
        with self.assertRaises(HTTPException) as cm:
            get_current_user_context(x_user_id=None, db=mock_db)
        self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_K_unknown_x_user_id_401(self):
        """Test K: Unknown X-User-ID header raises HTTP 401."""
        mock_db = MagicMock()
        with patch("app.dependencies.auth.UserService.get_user_context_by_user_id", side_effect=HTTPException(status_code=404)):
            with self.assertRaises(HTTPException) as cm:
                get_current_user_context(x_user_id="UNKNOWN_ID", db=mock_db)
            self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)


class TestReportsAuthLiveDB(unittest.TestCase):
    """Integration test suite for Reports branch isolation against real database."""

    def test_L_rahul_officers_list_live(self):
        """Test L: Verify Rahul's report officers roster contains ONLY officers belonging to Branch 6 (Pune)."""
        from app.database.database import SessionLocal
        db = SessionLocal()
        try:
            officers = ReportService.get_officers(db, user_branch_oid=6)
            self.assertTrue(len(officers) > 0)
            
            # Verify in DB that all returned officers belong to Branch 6
            for off in officers:
                emp = db.query(Employee).filter(Employee.oid == off.employee_oid).first()
                self.assertIsNotNone(emp)
                self.assertEqual(emp.BRANCH, 6)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
