from typing import Any, List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field


class DashboardSummary(BaseModel):
    """Dashboard KPI summary count metrics schema."""

    model_config = ConfigDict(from_attributes=True)

    present: int = 0
    absent: int = 0
    plannedVisits: int = 0
    completedVisitsToday: int = 0
    plannedVisitsWeekly: int = 0
    completedVisitsWeekly: int = 0
    plannedVisitsMonthly: int = 0
    completedVisitsMonthly: int = 0


class DashboardVisit(BaseModel):
    """Dashboard chronological site visit item schema."""

    model_config = ConfigDict(from_attributes=True)

    sequence: int
    site_id: Optional[int] = None
    site_name: str
    visit_type: str
    check_in: Optional[str] = "—"
    check_out: Optional[str] = "—"
    duration: Optional[str] = "—"
    status: str
    visit_date: Optional[str] = None
    report_oid: Union[int, str]


class DashboardOfficer(BaseModel):
    """Dashboard officer roster row schema."""

    model_config = ConfigDict(from_attributes=True)

    employee_oid: int
    officer: str
    emp_code: Optional[str] = "—"
    punch_in: Optional[str] = "—"
    punch_out: Optional[str] = "—"
    attendance_status: Optional[str] = "—"
    visits_done: int = 0
    hours_worked: Optional[str] = "—"
    gps_status: Optional[str] = "—"
    visits: List[DashboardVisit] = Field(default_factory=list)


class DashboardResponse(BaseModel):
    """Dashboard consolidated API response schema."""

    model_config = ConfigDict(from_attributes=True)

    summary: DashboardSummary
    officers: List[DashboardOfficer] = Field(default_factory=list)
    target_date: Optional[str] = None
