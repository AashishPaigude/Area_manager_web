import sys
import os
from datetime import datetime, timedelta, date

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from app.schemas.user_context import UserContext
from app.enums.role_type import RoleType
from app.services.attendance_service import AttendanceService
from app.repositories.attendance_repository import AttendanceRepository


class TestAttendanceMissedPunchUnit(unittest.TestCase):
    """Unit tests for 16-Hour Missed Punch, 2-Attempt tracking, and 10-Min Buffer."""

    def test_missed_punch_past_16_hours_caps_at_16h(self):
        """Test that unpunched shift > 16 hours is flagged as MISSED_PUNCH and capped at 16:00."""
        mock_db = MagicMock()
        # Mock row: punched in 18 hours ago, no punch out
        now = datetime.now()
        punch_in_time = now - timedelta(hours=18)

        mock_rows = [
            {
                "employee_oid": 101,
                "employee_name": "Test Officer",
                "emp_code": "EMP101",
                "attendance_date": punch_in_time.date(),
                "min_in_time": punch_in_time,
                "max_out_time": None,
                "latest_in_time": punch_in_time,
                "punch_count": 1,
            }
        ]
        mock_db.execute.return_value.mappings.return_value.all.return_value = mock_rows

        res = AttendanceRepository.get_attendance_list(mock_db, target_date=punch_in_time.date())
        records = res["records"]
        summary = res["summary"]

        self.assertEqual(len(records), 1)
        rec = records[0]
        self.assertEqual(rec["status"], "MISSED_PUNCH")
        self.assertTrue(rec["is_missed_punch"])
        self.assertEqual(rec["working_hours"], "16:00")
        self.assertEqual(rec["punch_out"], "Missed")
        self.assertEqual(summary["missed_punch"], 1)
        self.assertEqual(summary["present"], 0)

    def test_active_shift_under_16_hours_is_present(self):
        """Test that unpunched shift < 16 hours today is flagged as PRESENT with elapsed hours."""
        mock_db = MagicMock()
        now = datetime.now()
        punch_in_time = now - timedelta(hours=3, minutes=15)

        mock_rows = [
            {
                "employee_oid": 102,
                "employee_name": "Active Officer",
                "emp_code": "EMP102",
                "attendance_date": date.today(),
                "min_in_time": punch_in_time,
                "max_out_time": None,
                "latest_in_time": punch_in_time,
                "punch_count": 1,
            }
        ]
        mock_db.execute.return_value.mappings.return_value.all.return_value = mock_rows

        res = AttendanceRepository.get_attendance_list(mock_db, target_date=date.today())
        records = res["records"]
        summary = res["summary"]

        self.assertEqual(len(records), 1)
        rec = records[0]
        self.assertEqual(rec["status"], "PRESENT")
        self.assertFalse(rec["is_missed_punch"])
        self.assertEqual(rec["working_hours"], "03:15")
        self.assertIsNone(rec["punch_out"])
        self.assertEqual(summary["present"], 1)
        self.assertEqual(summary["missed_punch"], 0)

    def test_two_attempts_exhausted(self):
        """Test that 2 punch attempts marks attempts_exhausted as True."""
        mock_db = MagicMock()
        mock_rows = [
            {
                "employee_oid": 103,
                "employee_name": "Shift Officer",
                "emp_code": "EMP103",
                "attendance_date": date.today(),
                "min_in_time": datetime.combine(date.today(), datetime.min.time().replace(hour=8)),
                "max_out_time": datetime.combine(date.today(), datetime.min.time().replace(hour=16)),
                "latest_in_time": datetime.combine(date.today(), datetime.min.time().replace(hour=12)),
                "punch_count": 2,
            }
        ]
        mock_db.execute.return_value.mappings.return_value.all.return_value = mock_rows

        res = AttendanceRepository.get_attendance_list(mock_db, target_date=date.today())
        rec = res["records"][0]
        self.assertEqual(rec["punch_in_attempts"], 2)
        self.assertTrue(rec["attempts_exhausted"])
        self.assertEqual(rec["max_attempts"], 2)

    def test_ten_minute_cooldown_buffer_active(self):
        """Test that punch out 4 minutes ago with 1 attempt sets in_buffer=True."""
        mock_db = MagicMock()
        now = datetime.now()
        out_time = now - timedelta(minutes=4)
        in_time = out_time - timedelta(hours=4)

        mock_rows = [
            {
                "employee_oid": 104,
                "employee_name": "Buffer Officer",
                "emp_code": "EMP104",
                "attendance_date": date.today(),
                "min_in_time": in_time,
                "max_out_time": out_time,
                "latest_in_time": in_time,
                "punch_count": 1,
            }
        ]
        mock_db.execute.return_value.mappings.return_value.all.return_value = mock_rows

        res = AttendanceRepository.get_attendance_list(mock_db, target_date=date.today())
        rec = res["records"][0]
        self.assertTrue(rec["in_buffer"])
        self.assertGreater(rec["buffer_remaining_seconds"], 0)
        self.assertLessEqual(rec["buffer_remaining_seconds"], 360)

    def test_service_status_filter_missed_punch(self):
        """Test that AttendanceService accepts and filters by MISSED_PUNCH."""
        mock_db = MagicMock()
        with patch.object(
            AttendanceRepository,
            "get_attendance_list",
            return_value={
                "summary": {"present": 0, "absent": 0, "missed_punch": 1, "total_officers": 1},
                "records": [
                    {
                        "employee_oid": 105,
                        "employee_name": "Missed Officer",
                        "emp_code": "EMP105",
                        "attendance_date": "2026-09-03",
                        "punch_in": "13:35",
                        "punch_out": "Missed Punch",
                        "working_hours": "16:00",
                        "status": "MISSED_PUNCH",
                        "punch_in_attempts": 1,
                        "max_attempts": 2,
                        "attempts_exhausted": False,
                        "is_missed_punch": True,
                        "in_buffer": False,
                        "buffer_remaining_seconds": 0,
                    }
                ],
            },
        ) as mock_repo:
            res = AttendanceService.get_attendance(mock_db, status_param="MISSED_PUNCH")
            mock_repo.assert_called_once()
            _, kwargs = mock_repo.call_args
            self.assertEqual(kwargs.get("status_filter"), "MISSED_PUNCH")
            self.assertEqual(res.data.summary.missed_punch, 1)
            self.assertEqual(len(res.data.records), 1)
            self.assertTrue(res.data.records[0].is_missed_punch)


if __name__ == "__main__":
    unittest.main()
