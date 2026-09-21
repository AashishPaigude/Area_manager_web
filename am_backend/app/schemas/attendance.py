from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class AttendanceSummarySchema(BaseModel):
    """Attendance summary counters for Field Officers."""

    model_config = ConfigDict(from_attributes=True)

    present: int = 0
    absent: int = 0
    missed_punch: int = 0
    total_officers: int = 0


class AttendanceRecordSchema(BaseModel):
    """Single Field Officer attendance record."""

    model_config = ConfigDict(from_attributes=True)

    employee_oid: int
    employee_name: str
    emp_code: Optional[str] = None
    attendance_date: Optional[str] = None
    punch_in: Optional[str] = None
    punch_out: Optional[str] = None
    working_hours: str = "00:00"
    status: str
    punch_in_attempts: int = 0
    max_attempts: int = 2
    attempts_exhausted: bool = False
    is_missed_punch: bool = False
    in_buffer: bool = False
    buffer_remaining_seconds: int = 0


class AttendanceListData(BaseModel):
    """Data payload for Attendance List API response."""

    model_config = ConfigDict(from_attributes=True)

    summary: AttendanceSummarySchema
    records: List[AttendanceRecordSchema] = Field(default_factory=list)


class AttendanceListResponse(BaseModel):
    """Outer API response wrapper for GET /api/v1/attendance."""

    model_config = ConfigDict(from_attributes=True)

    data: AttendanceListData
