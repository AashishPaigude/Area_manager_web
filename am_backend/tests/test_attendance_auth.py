import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException, status

from app.enums.role_type import RoleType
from app.schemas.user_context import UserContext
from app.services.attendance_service import AttendanceService
from app.repositories.attendance_repository import AttendanceRepository
from app.dependencies.auth import get_current_user_context
from app.models.employee import Employee


class TestAttendanceAuthUnit(unittest.TestCase):
    """Unit test suite for Attendance module branch authorization."""

    def test_A_admin_attendance_unrestricted(self):
        """Test A: Admin context (X-User-ID: admin) passes user_branch_oid=None."""
        mock_db = MagicMock()
        admin_ctx = UserContext(
            user_account_oid=1,
            user_id="admin",
            name="admin",
            app_role=RoleType.ADMIN,
            branch_oid=None,
        )

        with patch.object(AttendanceRepository, "get_attendance_list", return_value={"summary": {}, "records": []}) as mock_repo:
            res = AttendanceService.get_attendance(mock_db, user_branch_oid=admin_ctx.branch_oid)
            mock_repo.assert_called_once()
            _, kwargs = mock_repo.call_args
            self.assertIsNone(kwargs.get("user_branch_oid"))

    def test_B_rahul_attendance_restricted_to_branch_6(self):
        """Test B: Rahul context (X-User-ID: EMP009) passes user_branch_oid=6."""
        mock_db = MagicMock()
        rahul_ctx = UserContext(
            user_account_oid=7897,
            user_id="EMP009",
            name="Rahul Paigude",
            app_role=RoleType.AREA_MANAGER,
            branch_oid=6,
        )

        with patch.object(AttendanceRepository, "get_attendance_list", return_value={"summary": {}, "records": []}) as mock_repo:
            res = AttendanceService.get_attendance(mock_db, user_branch_oid=rahul_ctx.branch_oid)
            mock_repo.assert_called_once()
            _, kwargs = mock_repo.call_args
            self.assertEqual(kwargs.get("user_branch_oid"), 6)

    def test_D_cross_branch_employee_attendance_rejected(self):
        """Test D: Rahul (branch 6) requesting attendance for Branch 7 employee raises HTTP 403."""
        mock_db = MagicMock()

        other_employee = Employee()
        other_employee.oid = 999
        other_employee.name = "Branch 7 Employee"
        other_employee.BRANCH = 7

        mock_db.query.return_value.filter.return_value.first.return_value = other_employee

        with self.assertRaises(HTTPException) as cm:
            AttendanceService.get_employee_attendance(
                mock_db, employee_oid=999, user_branch_oid=6
            )

        self.assertEqual(cm.exception.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("belongs to another branch", cm.exception.detail)

    def test_F_date_range_attendance_scoped(self):
        """Test F: Date range query passes user_branch_oid=6."""
        mock_db = MagicMock()

        with patch.object(AttendanceRepository, "get_attendance_list", return_value={"summary": {}, "records": []}) as mock_repo:
            AttendanceService.get_attendance(
                mock_db, start_date_str="2026-08-01", end_date_str="2026-08-26", user_branch_oid=6
            )
            mock_repo.assert_called_once()
            _, kwargs = mock_repo.call_args
            self.assertEqual(kwargs.get("user_branch_oid"), 6)

    def test_G_missing_x_user_id_401(self):
        """Test G: Missing X-User-ID header raises HTTP 401."""
        mock_db = MagicMock()
        with self.assertRaises(HTTPException) as cm:
            get_current_user_context(x_user_id=None, db=mock_db)
        self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_H_unknown_x_user_id_401(self):
        """Test H: Unknown X-User-ID header raises HTTP 401."""
        mock_db = MagicMock()
        with patch("app.dependencies.auth.UserService.get_user_context_by_user_id", side_effect=HTTPException(status_code=404)):
            with self.assertRaises(HTTPException) as cm:
                get_current_user_context(x_user_id="UNKNOWN_ID", db=mock_db)
            self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)


class TestAttendanceAuthLiveDB(unittest.TestCase):
    """Integration test suite for Attendance branch isolation against real database."""

    def test_E_rahul_attendance_summary_live(self):
        """Test E: Verify Rahul's live attendance response contains ONLY officers belonging to Branch 6 (Pune)."""
        from app.database.database import SessionLocal
        db = SessionLocal()
        try:
            res = AttendanceService.get_attendance(db, user_branch_oid=6)
            records = res.data.records
            self.assertTrue(len(records) > 0)
            
            # Verify in DB that all returned attendance records belong to Branch 6
            emp_oids = [r.employee_oid for r in records]
            for emp_oid in emp_oids:
                emp = db.query(Employee).filter(Employee.oid == emp_oid).first()
                self.assertIsNotNone(emp)
                self.assertEqual(emp.BRANCH, 6)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
