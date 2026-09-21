from typing import List, Optional
from pydantic import BaseModel, Field


class LiveOfficerVisitsCount(BaseModel):
    completed: int = 0
    pending: int = 0
    missed: int = 0


class LiveOfficerItem(BaseModel):
    id: int
    name: str
    empCode: str
    designation: str = "Field Officer"
    phone: Optional[str] = None
    site: str = "—"
    siteId: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    status: str = "off_duty"  # "on_duty" | "off_duty"
    trackStatus: str = "offline"  # "online" | "delayed" | "offline"
    battery: Optional[float] = None
    gpsAccuracy: Optional[float] = None
    speed: Optional[float] = None
    distToday: float = 0.0
    workHours: str = "00:00"
    lastUpdate: Optional[str] = None
    visitStatus: str = "Idle"  # "Visiting" | "Travelling" | "Idle" | "Absent"
    visits: LiveOfficerVisitsCount = Field(default_factory=LiveOfficerVisitsCount)


class LiveTrackingResponse(BaseModel):
    officers: List[LiveOfficerItem]


class AttendanceInfo(BaseModel):
    punch_in: Optional[str] = None
    punch_out: Optional[str] = None
    punch_in_lat: Optional[float] = None
    punch_in_lng: Optional[float] = None
    punch_out_lat: Optional[float] = None
    punch_out_lng: Optional[float] = None
    work_hours: Optional[str] = None
    status: str = "ABSENT"


class WaypointItem(BaseModel):
    time: str
    lat: float
    lng: float
    speed: Optional[float] = None
    accuracy: Optional[float] = None
    battery: Optional[float] = None
    is_mock: bool = False
    is_on_site: bool = False
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    session_id: Optional[int] = None
    transit_seq_num: Optional[int] = None
    premises_seq_num: Optional[int] = None
    display_label: Optional[str] = None
    hide_marker_pin: bool = False
    segment_id: Optional[int] = 1


class SiteVisitItem(BaseModel):
    session_id: int
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    gate_name: Optional[str] = None
    gate_lat: Optional[float] = None
    gate_lng: Optional[float] = None
    radius: Optional[float] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    entry_lat: Optional[float] = None
    entry_lng: Optional[float] = None
    exit_lat: Optional[float] = None
    exit_lng: Optional[float] = None
    duration_minutes: Optional[float] = None
    status: str = "COMPLETED"
    raw_points_count: int = 0
    distance_from_gate_m: Optional[float] = None
class PunchSessionItem(BaseModel):
    session_id: int
    trip_number: int
    in_time: str
    out_time: Optional[str] = None
    duration_str: Optional[str] = None
    is_active: bool = False
    total_waypoints: int = 0
    total_distance_km: float = 0.0
    total_site_visits: int = 0


class TrackHistorySummary(BaseModel):
    total_waypoints: int = 0
    total_distance_km: float = 0.0
    planned_visits: int = 0
    actual_visits: int = 0
    completed_visits: int = 0
    pending_visits: int = 0


class TrackHistoryResponse(BaseModel):
    employee_oid: int
    date: str
    attendance: AttendanceInfo
    total_punch_trips: int = 1
    selected_trip_number: Optional[int] = 1
    punch_sessions: List[PunchSessionItem] = []
    summary: TrackHistorySummary
    waypoints: List[WaypointItem]
    site_visits: List[SiteVisitItem]
    is_track_history_enabled: Optional[bool] = True



class PlannedVsActualItem(BaseModel):
    site_oid: int
    site_name: str
    planned: int = 0
    actual: int = 0
    completed: int = 0
    remaining: int = 0


class PlannedVsActualResponse(BaseModel):
    employee_oid: Optional[int] = None
    period: str = "weekly"
    total_planned: int = 0
    total_actual: int = 0
    sites: List[PlannedVsActualItem]
