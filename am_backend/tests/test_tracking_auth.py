import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException, status

from app.core.exceptions import AppBaseException
from app.enums.role_type import RoleType
from app.schemas.user_context import UserContext
from app.services.tracking_service import TrackingService
from app.repositories.tracking_repository import TrackingRepository
from app.dependencies.auth import get_current_user_context
from app.models.employee import Employee


class TestTrackingAuthUnit(unittest.TestCase):
    """Unit test suite for Live Tracking / GPS module branch authorization."""

    def test_A_admin_live_tracking_unrestricted(self):
        """Test A: Admin context (X-User-ID: admin) passes user_branch_oid=None to TrackingRepository."""
        mock_db = MagicMock()
        admin_ctx = UserContext(
            user_account_oid=1,
            user_id="admin",
            name="admin",
            app_role=RoleType.ADMIN,
            branch_oid=None,
        )

        with patch.object(TrackingRepository, "get_active_field_officers", return_value=[]) as mock_repo:
            res = TrackingService.get_live_tracking_data(mock_db, user_branch_oid=admin_ctx.branch_oid)
            mock_repo.assert_called_once_with(mock_db, user_branch_oid=None)

    def test_B_rahul_live_tracking_restricted_to_branch_6(self):
        """Test B: Rahul context (X-User-ID: EMP009) passes user_branch_oid=6 to TrackingRepository."""
        mock_db = MagicMock()
        rahul_ctx = UserContext(
            user_account_oid=7897,
            user_id="EMP009",
            name="Rahul Paigude",
            app_role=RoleType.AREA_MANAGER,
            branch_oid=6,
        )

        with patch.object(TrackingRepository, "get_active_field_officers", return_value=[]) as mock_repo:
            res = TrackingService.get_live_tracking_data(mock_db, user_branch_oid=rahul_ctx.branch_oid)
            mock_repo.assert_called_once_with(mock_db, user_branch_oid=6)

    def test_D_rahul_cannot_request_another_branch_officer_history(self):
        """Test D: Rahul (branch 6) requesting tracking history of Branch 7 officer raises HTTP 403."""
        mock_db = MagicMock()

        other_officer = Employee()
        other_officer.oid = 999
        other_officer.name = "Branch 7 Officer"
        other_officer.BRANCH = 7

        mock_db.query.return_value.filter.return_value.first.return_value = other_officer

        with self.assertRaises(AppBaseException) as cm:
            TrackingService.get_track_history_data(
                mock_db, employee_oid=999, date_str="2026-08-26", user_branch_oid=6
            )

        self.assertEqual(cm.exception.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("belongs to another branch", str(cm.exception))

    def test_F_rahul_planned_vs_actual_cross_branch_rejected(self):
        """Test F: Rahul requesting planned-vs-actual for Branch 7 officer raises HTTP 403."""
        mock_db = MagicMock()

        other_officer = Employee()
        other_officer.oid = 999
        other_officer.name = "Branch 7 Officer"
        other_officer.BRANCH = 7

        mock_db.query.return_value.filter.return_value.first.return_value = other_officer

        with self.assertRaises(AppBaseException) as cm:
            TrackingService.get_planned_vs_actual_data(
                mock_db, employee_oid=999, date_str="2026-08-26", period="weekly", user_branch_oid=6
            )

        self.assertEqual(cm.exception.status_code, status.HTTP_403_FORBIDDEN)

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


class TestTrackingAuthLiveDB(unittest.TestCase):
    """Integration test suite for Live Tracking branch isolation against real database."""

    def test_C_rahul_live_officer_list_live(self):
        """Test C: Verify Rahul's live tracking roster contains ONLY officers belonging to Branch 6 (Pune)."""
        from app.database.database import SessionLocal
        db = SessionLocal()
        try:
            res = TrackingService.get_live_tracking_data(db, user_branch_oid=6)
            officers = res.officers
            self.assertTrue(len(officers) > 0)
            
            # Verify in DB that all returned officers belong to Branch 6
            emp_oids = [o.id for o in officers]
            for emp_oid in emp_oids:
                emp = db.query(Employee).filter(Employee.oid == emp_oid).first()
                self.assertIsNotNone(emp)
                self.assertEqual(emp.BRANCH, 6)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
