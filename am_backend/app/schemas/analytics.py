from datetime import date
from typing import List, Optional
from pydantic import BaseModel, Field


class AnalyticsKPIs(BaseModel):
    total_planned_visits: int = 0
    total_completed_visits: int = 0
    total_missed_visits: int = 0
    total_pending_visits: int = 0
    completion_rate: float = 0.0  # e.g. 85.5%
    total_reports: int = 0
    day_reports: int = 0
    night_reports: int = 0
    general_reports: int = 0
    total_sites_covered: int = 0
    total_work_hours: str = "00:00"
    avg_visit_duration_mins: float = 0.0
    active_officers_count: int = 0
    on_duty_officers_count: int = 0
    days_in_period: int = 1


class DailyTrendItem(BaseModel):
    date: str
    day: str
    completed: int = 0
    planned: int = 0
    missed: int = 0
    day_reports: int = 0
    night_reports: int = 0
    general_reports: int = 0
    completion_rate: float = 0.0


class SiteAnalyticsItem(BaseModel):
    site_id: Optional[int] = None
    site_name: str
    visits_count: int = 0
    total_duration_mins: float = 0.0
    avg_duration_mins: float = 0.0
    day_count: int = 0
    night_count: int = 0
    general_count: int = 0


class OfficerPerformanceItem(BaseModel):
    employee_oid: int
    name: str
    emp_code: Optional[str] = None
    branch: Optional[str] = None
    visits_completed: int = 0
    visits_planned: int = 0
    completion_rate: float = 0.0
    day_reports: int = 0
    night_reports: int = 0
    general_reports: int = 0
    total_reports: int = 0
    sites_visited: int = 0
    total_hours: str = "00:00"
    avg_duration_mins: float = 0.0
    punch_in: Optional[str] = None
    punch_out: Optional[str] = None
    days_present: int = 0
    status: str = "off_duty"  # "on_duty" | "off_duty" | "present" | "absent"
    efficiency_score: int = 80  # 0-100 score
    performance_tier: str = "Top Performer"  # "Top Performer", "Good Compliance", "Average", "Needs Follow-up"
    compliance_status: str = "Target Met"  # "Target Met", "In Progress", "Action Needed"


class OfficerVisitSessionItem(BaseModel):
    session_id: int
    site_id: Optional[int] = None
    site_name: str
    visit_type: str  # "Day Visit" | "Night Visit" | "General Visit" | "Site Session"
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    duration_minutes: Optional[float] = None
    status: str = "COMPLETED"
    visit_date: str
    report_id: Optional[str] = None


class PlannedVsActualSiteAnalytics(BaseModel):
    site_oid: int
    site_name: str
    planned_frequency: int = 0
    actual_visits: int = 0
    completion_rate: float = 0.0
    status: str = "COMPLETED"  # "COMPLETED" | "IN_PROGRESS" | "PENDING"


class OfficerProfileSummary(BaseModel):
    employee_oid: int
    name: str
    emp_code: Optional[str] = None
    branch: Optional[str] = None
    shift: Optional[str] = None
    punch_in: Optional[str] = None
    punch_out: Optional[str] = None
    work_hours: Optional[str] = None
    days_present: int = 0
    duty_status: str = "off_duty"
    efficiency_score: int = 85
    performance_tier: str = "Good"  # "Excellent" | "Good" | "Average" | "Needs Improvement"
    compliance_status: str = "Target Met"


class AnalyticsSummaryResponse(BaseModel):
    mode: str = "fleet"  # "fleet" | "officer"
    period: str = "weekly"
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    selected_officer: Optional[OfficerProfileSummary] = None
    kpis: AnalyticsKPIs
    daily_trends: List[DailyTrendItem] = Field(default_factory=list)
    top_sites: List[SiteAnalyticsItem] = Field(default_factory=list)
    officers_leaderboard: List[OfficerPerformanceItem] = Field(default_factory=list)
    planned_vs_actual_sites: List[PlannedVsActualSiteAnalytics] = Field(default_factory=list)
    recent_visits: List[OfficerVisitSessionItem] = Field(default_factory=list)


class OfficerAnalyticsDropdownItem(BaseModel):
    employee_oid: int
    name: str
    emp_code: Optional[str] = None
    branch: Optional[str] = None
    total_visits: int = 0
    completion_rate: float = 0.0
    status: str = "off_duty"
