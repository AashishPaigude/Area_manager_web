import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException, status

from app.enums.role_type import RoleType
from app.schemas.user_context import UserContext
from app.schemas.visit import CreatePlanRequest, UpdatePlanHeaderRequest
from app.services.visit_service import VisitService
from app.repositories.visit_repository import VisitRepository
from app.dependencies.auth import get_current_user_context
from app.models.employee import Employee
from app.models.site import Site


class TestVisitsAuthUnit(unittest.TestCase):
    """Unit test suite for Visits / Planning module branch authorization."""

    def test_A_admin_read_access_unrestricted(self):
        """Test A: Admin context (X-User-ID: admin) passes user_branch_oid=None."""
        mock_db = MagicMock()
        admin_ctx = UserContext(
            user_account_oid=1,
            user_id="admin",
            name="admin",
            app_role=RoleType.ADMIN,
            branch_oid=None,
        )

        with patch.object(VisitRepository, "get_active_field_officers", return_value=[]) as mock_repo:
            res = VisitService.get_field_officers(mock_db, user_branch_oid=admin_ctx.branch_oid)
            mock_repo.assert_called_once_with(mock_db, user_branch_oid=None)

    def test_B_rahul_read_access_restricted_to_branch_6(self):
        """Test B: Rahul context (X-User-ID: EMP009) passes user_branch_oid=6."""
        mock_db = MagicMock()
        rahul_ctx = UserContext(
            user_account_oid=7897,
            user_id="EMP009",
            name="Rahul Paigude",
            app_role=RoleType.AREA_MANAGER,
            branch_oid=6,
        )

        with patch.object(VisitRepository, "get_active_field_officers", return_value=[]) as mock_repo:
            res = VisitService.get_field_officers(mock_db, user_branch_oid=rahul_ctx.branch_oid)
            mock_repo.assert_called_once_with(mock_db, user_branch_oid=6)

    def test_C_branch_site_client_lists_scoped(self):
        """Test C: Master data calls pass user_branch_oid=6 for Area Manager."""
        mock_db = MagicMock()

        with patch.object(VisitRepository, "get_branches", return_value=[]) as mock_b:
            VisitService.get_branches(mock_db, user_branch_oid=6)
            mock_b.assert_called_once_with(mock_db, user_branch_oid=6)

        with patch.object(VisitRepository, "get_clients", return_value=[]) as mock_c:
            VisitService.get_clients(mock_db, user_branch_oid=6)
            mock_c.assert_called_once_with(mock_db, user_branch_oid=6)

        with patch.object(VisitRepository, "get_sites", return_value=[]) as mock_s:
            VisitService.get_sites(mock_db, user_branch_oid=6)
            mock_s.assert_called_once_with(mock_db, branch_oid=None, client_oid=None, user_branch_oid=6)

    def test_G_cross_branch_create_attempt_rejected(self):
        """Test G: Area Manager (branch 6) attempting to create a plan for branch 7 officer raises HTTP 403."""
        mock_db = MagicMock()

        # Employee 999 belongs to Branch 7
        other_officer = Employee()
        other_officer.oid = 999
        other_officer.name = "Other Branch Officer"
        other_officer.BRANCH = 7
        other_officer.active = 1
        other_officer.DESIGNATION = 19

        mock_db.query.return_value.filter.return_value.first.return_value = other_officer

        payload = CreatePlanRequest(
            planning_type="WEEKLY",
            employee_oid=999,
            week_start_date="2026-09-01",
            week_end_date="2026-09-07"
        )

        with self.assertRaises(HTTPException) as cm:
            VisitService.create_plan(mock_db, payload=payload, user_branch_oid=6)

        self.assertEqual(cm.exception.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("belonging to another branch", cm.exception.detail)

    def test_H_update_cross_branch_attempt_rejected(self):
        """Test H: Area Manager (branch 6) attempting to update a plan for branch 7 officer raises HTTP 403."""
        mock_db = MagicMock()

        plan = MagicMock()
        plan.oid = 10
        plan.employee_oid = 999

        other_officer = Employee()
        other_officer.oid = 999
        other_officer.BRANCH = 7

        with patch.object(VisitRepository, "get_plan_by_oid", return_value=plan):
            mock_db.query.return_value.filter.return_value.first.return_value = other_officer
            payload = UpdatePlanHeaderRequest(
                planning_type="WEEKLY",
                employee_oid=999,
                week_start_date="2026-09-01",
                week_end_date="2026-09-07"
            )
            with self.assertRaises(HTTPException) as cm:
                VisitService.update_plan_header(mock_db, plan_oid=10, payload=payload, user_branch_oid=6)

            self.assertEqual(cm.exception.status_code, status.HTTP_403_FORBIDDEN)

    def test_I_delete_cross_branch_attempt_rejected(self):
        """Test I: Area Manager (branch 6) attempting to delete a plan belonging to branch 7 raises HTTP 403."""
        mock_db = MagicMock()

        plan = MagicMock()
        plan.oid = 10
        plan.employee_oid = 999

        other_officer = Employee()
        other_officer.oid = 999
        other_officer.BRANCH = 7

        with patch.object(VisitRepository, "get_plan_by_oid", return_value=plan):
            mock_db.query.return_value.filter.return_value.first.return_value = other_officer
            with self.assertRaises(HTTPException) as cm:
                VisitService.delete_plan(mock_db, plan_oid=10, user_branch_oid=6)

            self.assertEqual(cm.exception.status_code, status.HTTP_403_FORBIDDEN)

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


class TestVisitsAuthLiveDB(unittest.TestCase):
    """Integration test suite for Visits module branch isolation against real database."""

    def test_D_rahul_field_officers_live(self):
        """Test D: Verify Rahul's Field Officers list contains ONLY officers belonging to Branch 6 (Pune)."""
        from app.database.database import SessionLocal
        db = SessionLocal()
        try:
            res = VisitService.get_field_officers(db, user_branch_oid=6)
            officers = res.data
            self.assertTrue(len(officers) > 0)
            
            # Verify in DB that all returned officers belong to Branch 6
            emp_oids = [o.oid for o in officers]
            for emp_oid in emp_oids:
                emp = db.query(Employee).filter(Employee.oid == emp_oid).first()
                self.assertIsNotNone(emp)
                self.assertEqual(emp.BRANCH, 6)
        finally:
            db.close()

    def test_E_rahul_plans_list_live(self):
        """Test E: Verify Rahul's visit plans list contains ONLY plans for Branch 6 officers."""
        from app.database.database import SessionLocal
        db = SessionLocal()
        try:
            res = VisitService.list_plans(db, user_branch_oid=6)
            plans = res.data
            for plan in plans:
                emp = db.query(Employee).filter(Employee.oid == plan.employee_oid).first()
                if emp:
                    self.assertEqual(emp.BRANCH, 6)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
