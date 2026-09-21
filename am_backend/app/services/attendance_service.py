from datetime import date, datetime
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
import logging

from app.repositories.attendance_repository import AttendanceRepository
from app.schemas.attendance import (
    AttendanceListData,
    AttendanceListResponse,
    AttendanceRecordSchema,
    AttendanceSummarySchema,
)

logger = logging.getLogger(__name__)


class AttendanceService:
    """Service layer for Field Officer Attendance API."""

    @staticmethod
    def get_attendance(
        db: Session, 
        date_str: Optional[str] = None, 
        status_param: Optional[str] = "ALL",
        start_date_str: Optional[str] = None,
        end_date_str: Optional[str] = None,
        user_branch_oid: Optional[int] = None
    ) -> AttendanceListResponse:
        """Fetch and format Field Officer attendance list, scoped by user_branch_oid.

        Args:
            db: Database session.
            date_str: Date string in YYYY-MM-DD format (defaults to current date).
            status_param: Status filter ('ALL', 'PRESENT', 'ABSENT').
            start_date_str: Start date for date range query.
            end_date_str: End date for date range query.
            user_branch_oid: Optional branch OID for user authorization scoping.

        Returns:
            AttendanceListResponse object.
        """
        parsed_start: Optional[date] = None
        parsed_end: Optional[date] = None
        target_date: Optional[date] = None

        if start_date_str and end_date_str:
            try:
                parsed_start = datetime.strptime(start_date_str.strip(), "%Y-%m-%d").date()
                parsed_end = datetime.strptime(end_date_str.strip(), "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid start_date or end_date format. Use YYYY-MM-DD."
                )
        elif date_str:
            try:
                target_date = datetime.strptime(date_str.strip(), "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD."
                )
        else:
            target_date = date.today()

        # Validate status parameter
        filter_status = (status_param or "ALL").strip().upper()
        if filter_status not in ("ALL", "PRESENT", "ABSENT", "MISSED_PUNCH"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid status filter. Allowed values: ALL, PRESENT, ABSENT, MISSED_PUNCH."
            )

        raw_result = AttendanceRepository.get_attendance_list(
            db=db, 
            target_date=target_date, 
            status_filter=filter_status,
            start_date=parsed_start,
            end_date=parsed_end,
            user_branch_oid=user_branch_oid
        )

        summary_data = raw_result.get("summary", {})
        summary = AttendanceSummarySchema(
            present=summary_data.get("present", 0),
            absent=summary_data.get("absent", 0),
            missed_punch=summary_data.get("missed_punch", 0),
            total_officers=summary_data.get("total_officers", 0),
        )

        records_data = raw_result.get("records", [])
        records = [
            AttendanceRecordSchema(
                employee_oid=r["employee_oid"],
                employee_name=r["employee_name"],
                emp_code=r.get("emp_code"),
                attendance_date=r["attendance_date"],
                punch_in=r.get("punch_in"),
                punch_out=r.get("punch_out"),
                working_hours=r.get("working_hours", "00:00"),
                status=r["status"],
                punch_in_attempts=r.get("punch_in_attempts", 0),
                max_attempts=r.get("max_attempts", 2),
                attempts_exhausted=r.get("attempts_exhausted", False),
                is_missed_punch=r.get("is_missed_punch", False),
                in_buffer=r.get("in_buffer", False),
                buffer_remaining_seconds=r.get("buffer_remaining_seconds", 0),
            )
            for r in records_data
        ]

        data_payload = AttendanceListData(summary=summary, records=records)
        return AttendanceListResponse(data=data_payload)

    @staticmethod
    def get_employee_attendance(
        db: Session,
        employee_oid: int,
        date_str: Optional[str] = None,
        user_branch_oid: Optional[int] = None
    ) -> AttendanceListResponse:
        """Fetch attendance records for a specific employee OID, enforcing branch authorization checks."""
        from app.models.employee import Employee
        employee = db.query(Employee).filter(Employee.oid == employee_oid).first()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee with OID {employee_oid} not found"
            )

        if user_branch_oid is not None and employee.BRANCH != user_branch_oid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Employee {employee_oid} belongs to another branch"
            )

        res = AttendanceService.get_attendance(
            db=db, date_str=date_str, user_branch_oid=user_branch_oid
        )
        # Filter records for single employee
        filtered_records = [r for r in res.data.records if r.employee_oid == employee_oid]
        res.data.records = filtered_records
        return res
