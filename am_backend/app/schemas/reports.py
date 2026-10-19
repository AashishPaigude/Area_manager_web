from datetime import date
from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class OfficerSummary(BaseModel):
    """Officer Profile Summary schema."""

    model_config = ConfigDict(from_attributes=True)

    employee_oid: int
    officer: str
    emp_code: Optional[str] = None
    branch: Optional[str] = None
    area: Optional[str] = None
    shift: Optional[str] = None
    punch_in: Optional[str] = None
    punch_out: Optional[str] = None
    hours_worked: Optional[float] = None
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    company_short_name: Optional[str] = None
    company_logo_filename: Optional[str] = None
    company_logo_url: Optional[str] = None
    is_eagle: Optional[bool] = False


class ReportExecutiveSummary(BaseModel):
    """Executive Summary count metrics schema."""

    model_config = ConfigDict(from_attributes=True)

    planned_visits: int = 0
    completed_visits: int = 0
    missed_visits: int = 0
    general_reports: int = 0
    day_reports: int = 0
    night_reports: int = 0
    total_sites_covered: int = 0
    planned_completed: Optional[int] = 0
    unplanned_completed: Optional[int] = 0


class SiteVisitSummary(BaseModel):
    """Site Visit Summary table item schema."""

    model_config = ConfigDict(from_attributes=True)

    serial_no: int
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    visit_type: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    status: Optional[str] = None
    visit_date: Optional[str] = None
    is_planned: Optional[bool] = False
    plan_code: Optional[str] = None


class GeneralReportResponse(BaseModel):
    """Detailed General Visit Report response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: Optional[str] = None
    formatted_report_id: Optional[str] = None
    client_name: Optional[str] = None
    site_name: Optional[str] = None
    visit_date: Optional[str] = None
    created_on: Optional[str] = None
    officer: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    person_visited: Optional[str] = None
    reason_of_visit: Optional[str] = None
    remark: Optional[str] = None
    photos: List[str] = Field(default_factory=list)
    is_planned: Optional[bool] = False
    plan_code: Optional[str] = None


class DayReportResponse(BaseModel):
    """Detailed Day Visit Report response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: Optional[str] = None
    formatted_report_id: Optional[str] = None
    client_name: Optional[str] = None
    unit: Optional[str] = None
    site_name: Optional[str] = None
    shift: Optional[str] = None
    visit_date: Optional[str] = None
    officer: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    gps: Optional[str] = None
    photos: List[str] = Field(default_factory=list)
    guards: List[Any] = Field(default_factory=list)
    checklist: List[Any] = Field(default_factory=list)
    observations: Optional[str] = None
    suggestions: Optional[str] = None
    attachments: List[Any] = Field(default_factory=list)
    status: Optional[str] = None
    lecture_details: Optional[Any] = None
    random_checking: Optional[Any] = None
    overall_remarks: Optional[str] = None
    is_planned: Optional[bool] = False
    plan_code: Optional[str] = None


class NightReportResponse(BaseModel):
    """Detailed Night Round Report response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: Optional[str] = None
    formatted_report_id: Optional[str] = None
    client_name: Optional[str] = None
    unit: Optional[str] = None
    site_name: Optional[str] = None
    shift: Optional[str] = None
    visit_date: Optional[str] = None
    officer: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    gps: Optional[str] = None
    photos: List[str] = Field(default_factory=list)
    guards: List[Any] = Field(default_factory=list)
    checklist: List[Any] = Field(default_factory=list)
    lecture_details: Optional[Any] = None
    random_checking: Optional[Any] = None
    suggestions: Optional[str] = None
    attachments: List[Any] = Field(default_factory=list)
    status: Optional[str] = None
    overall_remarks: Optional[str] = None
    officer_signature: Optional[str] = None
    is_planned: Optional[bool] = False
    plan_code: Optional[str] = None


class PlanInfoSummary(BaseModel):
    """Plan information summary attached to combined report."""

    model_config = ConfigDict(from_attributes=True)

    plan_oid: int
    plan_code: str
    planning_type: str
    week_start_date: Optional[date] = None
    week_end_date: Optional[date] = None
    planning_month: Optional[int] = None
    planning_year: Optional[int] = None
    status: Optional[str] = None
    total_sites: Optional[int] = 0
    total_planned_visits: Optional[int] = 0
    visits_done: Optional[int] = 0


class CombinedReportResponse(BaseModel):
    """Consolidated Combined Officer Operations Report response schema."""

    model_config = ConfigDict(from_attributes=True)

    officer: OfficerSummary
    summary: ReportExecutiveSummary
    site_visits: List[SiteVisitSummary] = Field(default_factory=list)
    general_reports: List[GeneralReportResponse] = Field(default_factory=list)
    day_reports: List[DayReportResponse] = Field(default_factory=list)
    night_reports: List[NightReportResponse] = Field(default_factory=list)
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    company_short_name: Optional[str] = None
    company_logo_url: Optional[str] = None
    is_eagle: Optional[bool] = False
    plan_info: Optional[PlanInfoSummary] = None


class OfficerListItem(BaseModel):
    """Officer selector item schema for the Reports page dropdown."""

    model_config = ConfigDict(from_attributes=True)

    employee_oid: int
    officer: str
    emp_code: Optional[str] = None
    last_visit_date: Optional[str] = None
    total_reports: Optional[int] = 0
    total_sites: Optional[int] = 0
    punch_in: Optional[str] = "—"
    punch_out: Optional[str] = "—"
    hours_worked: Optional[str] = "—"
    gps_status: Optional[str] = "—"
    sites: List[str] = Field(default_factory=list)
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    company_short_name: Optional[str] = None
    company_logo_url: Optional[str] = None
    is_eagle: Optional[bool] = False
