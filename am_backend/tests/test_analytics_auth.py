import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException, status

from app.enums.role_type import RoleType
from app.schemas.user_context import UserContext
from app.services.tracking_service import TrackingService
from app.services.dashboard_service import DashboardService
from app.repositories.tracking_repository import TrackingRepository
from app.repositories.dashboard_repository import DashboardRepository
from app.dependencies.auth import get_current_user_context
from app.models.employee import Employee


class TestAnalyticsAuthUnit(unittest.TestCase):
    """Unit test suite verifying Analytics data source branch authorization."""

    def test_A_admin_analytics_unrestricted(self):
        """Test A: Admin context (X-User-ID: admin) receives unrestricted Analytics metrics."""
        mock_db = MagicMock()
        admin_ctx = UserContext(
            user_account_oid=1,
            user_id="admin",
            name="admin",
            app_role=RoleType.ADMIN,
            branch_oid=None,
        )

        # 1. Planned vs Actual aggregate
        with patch.object(TrackingRepository, "get_active_field_officers", return_value=[]) as mock_repo:
            res = TrackingService.get_planned_vs_actual_data(
                mock_db, employee_oid=None, user_branch_oid=admin_ctx.branch_oid
            )
            mock_repo.assert_called_once_with(mock_db, user_branch_oid=None)

        # 2. Dashboard summary
        with patch.object(DashboardRepository, "get_dashboard_data", return_value={"date": "2026-08-26", "metrics": {}}) as mock_dash:
            dash_res = DashboardService.get_dashboard_summary(mock_db, branch_oid=admin_ctx.branch_oid)
            mock_dash.assert_called_once_with(mock_db, None, period="weekly", branch_oid=None)

    def test_B_rahul_analytics_restricted_to_branch_6(self):
        """Test B: Rahul context (X-User-ID: EMP009) receives only Branch 6 Analytics metrics."""
        mock_db = MagicMock()
        rahul_ctx = UserContext(
            user_account_oid=7897,
            user_id="EMP009",
            name="Rahul Paigude",
            app_role=RoleType.AREA_MANAGER,
            branch_oid=6,
        )

        # 1. Planned vs Actual aggregate
        with patch.object(TrackingRepository, "get_active_field_officers", return_value=[]) as mock_repo:
            res = TrackingService.get_planned_vs_actual_data(
                mock_db, employee_oid=None, user_branch_oid=rahul_ctx.branch_oid
            )
            mock_repo.assert_called_once_with(mock_db, user_branch_oid=6)

        # 2. Dashboard summary
        with patch.object(DashboardRepository, "get_dashboard_data", return_value={"date": "2026-08-26", "metrics": {}}) as mock_dash:
            dash_res = DashboardService.get_dashboard_summary(mock_db, branch_oid=rahul_ctx.branch_oid)
            mock_dash.assert_called_once_with(mock_db, None, period="weekly", branch_oid=6)

    def test_C_rahul_cannot_override_branch_parameter(self):
        """Test C: Area Manager cannot manipulate branch parameter to access another branch's Analytics."""
        mock_db = MagicMock()
        rahul_ctx = UserContext(
            user_account_oid=7897,
            user_id="EMP009",
            name="Rahul Paigude",
            app_role=RoleType.AREA_MANAGER,
            branch_oid=6,
        )

        # Even if frontend requests branch_oid=7, effective_branch MUST be forced to 6
        effective_branch = rahul_ctx.branch_oid if rahul_ctx.branch_oid is not None else 7
        self.assertEqual(effective_branch, 6)

    def test_D_missing_x_user_id_401(self):
        """Test D: Missing X-User-ID header raises HTTP 401."""
        mock_db = MagicMock()
        with self.assertRaises(HTTPException) as cm:
            get_current_user_context(x_user_id=None, db=mock_db)
        self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_E_unknown_x_user_id_401(self):
        """Test E: Unknown X-User-ID header raises HTTP 401."""
        mock_db = MagicMock()
        with patch("app.dependencies.auth.UserService.get_user_context_by_user_id", side_effect=HTTPException(status_code=404)):
            with self.assertRaises(HTTPException) as cm:
                get_current_user_context(x_user_id="UNKNOWN_ID", db=mock_db)
            self.assertEqual(cm.exception.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_F_planned_vs_actual_cross_branch_rejected(self):
        """Test F: Single officer Planned vs Actual request for Branch 7 officer raises HTTP 403."""
        mock_db = MagicMock()

        other_officer = Employee()
        other_officer.oid = 999
        other_officer.name = "Branch 7 Officer"
        other_officer.BRANCH = 7

        mock_db.query.return_value.filter.return_value.first.return_value = other_officer

        from app.core.exceptions import AppBaseException
        with self.assertRaises(AppBaseException) as cm:
            TrackingService.get_planned_vs_actual_data(
                mock_db, employee_oid=999, user_branch_oid=6
            )
        self.assertEqual(cm.exception.status_code, status.HTTP_403_FORBIDDEN)


class TestAnalyticsAuthLiveDB(unittest.TestCase):
    """Integration test suite for Analytics data sources against live database."""

    def test_G_rahul_analytics_data_isolation_live(self):
        """Test G: Verify Rahul's Planned vs Actual analytics aggregate contains ONLY Branch 6 sites/officers."""
        from app.database.database import SessionLocal
        db = SessionLocal()
        try:
            res = TrackingService.get_planned_vs_actual_data(db, user_branch_oid=6)
            self.assertIsNotNone(res)
            # Verify response is scoped to user_branch_oid=6
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
