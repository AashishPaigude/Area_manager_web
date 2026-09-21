import math
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
import logging

from app.core.exceptions import AppBaseException
from app.models.employee import Employee
from app.repositories.tracking_repository import TrackingRepository
from app.schemas.tracking import (
    LiveTrackingResponse,
    LiveOfficerItem,
    LiveOfficerVisitsCount,
    TrackHistoryResponse,
    AttendanceInfo,
    TrackHistorySummary,
    WaypointItem,
    SiteVisitItem,
    PunchSessionItem,
    PlannedVsActualResponse,
    PlannedVsActualItem,
)

logger = logging.getLogger(__name__)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the Great Circle distance between two points in kilometers."""
    R = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def sanitize_speed(speed_val: Optional[float]) -> float:
    """Sanitize raw GPS speed input in m/s. Negative values or stationary jitter (< 0.28 m/s or ~1 km/h) return 0.0."""
    if speed_val is None or speed_val < 0.28:
        return 0.0
    return speed_val



class TrackingService:
    """Service layer for Live Tracking, Track History, and Planned vs Actual visit metrics."""

    @staticmethod
    def get_live_tracking_data(
        db: Session,
        branch_oid: Optional[int] = None,
        search: Optional[str] = None,
        user_branch_oid: Optional[int] = None
    ) -> LiveTrackingResponse:
        """Construct real-time officer roster payload matching LiveTracking page contract."""
        effective_branch = user_branch_oid if user_branch_oid is not None else branch_oid
        officers = TrackingRepository.get_active_field_officers(db, user_branch_oid=effective_branch)

        # Apply optional name search filtering
        if search:
            search_lower = search.strip().lower()
            officers = [
                o for o in officers
                if search_lower in o.name.lower() or search_lower in (o.emp_code or "").lower()
            ]

        if not officers:
            return LiveTrackingResponse(officers=[])

        officer_oids = [o.oid for o in officers]

        # Batch fetch latest data
        latest_gps = TrackingRepository.get_latest_gps_logs_for_officers(db, officer_oids)
        active_sessions = TrackingRepository.get_active_site_visit_sessions(db, officer_oids)
        today_att = TrackingRepository.get_attendance_summaries_by_date(db, date.today(), officer_oids)
        today_reports_map = TrackingRepository.get_submitted_reports_for_officers_today(db, officer_oids, date.today())

        # Fetch all active gate QR codes with coordinates and geofence radius from SITE_GATE_QRCODE
        from app.models.site_gate_qrcode import SiteGateQrcode
        from app.models.site import Site

        gate_qrcodes = db.query(
            SiteGateQrcode.oid.label("gate_oid"),
            SiteGateQrcode.SITE.label("site_id"),
            Site.name.label("site_name"),
            SiteGateQrcode.gate_name,
            SiteGateQrcode.latitude,
            SiteGateQrcode.longitude,
            SiteGateQrcode.radius,
        ).join(Site, Site.oid == SiteGateQrcode.SITE).filter(
            SiteGateQrcode.latitude.isnot(None),
            SiteGateQrcode.longitude.isnot(None)
        ).all()

        now = datetime.now()

        officer_items: List[LiveOfficerItem] = []

        for off in officers:
            emp_id = off.oid
            gps_log = latest_gps.get(emp_id)
            active_session = active_sessions.get(emp_id)
            att = today_att.get(emp_id, {})
            is_active_duty = bool(att.get("is_active_duty", False))
            work_hours = att.get("work_hours", "00:00")
            punch_out_str = att.get("punch_out")

            # 1. Determine online/offline display status
            # Tracking is strictly active ONLY between Punch-In and Punch-Out.
            # Once punched out or not punched in, the officer is immediately OFFLINE and live tracking is stopped!
            if not is_active_duty:
                track_status = "offline"
                status = "off_duty"
                last_update_str = f"Punched Out ({punch_out_str})" if punch_out_str else "Offline"
                site_name = "—"
                site_id = None
                visit_status = "Available"
                lat = None
                lng = None
                accuracy = None
                battery = None
                speed_kmh = 0.0
            else:
                # Officer is actively on duty (between punch-in and punch-out)
                status = "on_duty"
                track_status = "offline"
                last_update_str = "Offline"
                
                if gps_log and gps_log.recorded_at:
                    delta_sec = (now - gps_log.recorded_at).total_seconds()
                    delta_min = delta_sec / 60.0

                    if delta_sec < 0:  # timestamp slightly in future due to clock skew
                        track_status = "online"
                        last_update_str = "Just now"
                    elif delta_min <= 5.0:
                        track_status = "online"
                        last_update_str = "Just now" if delta_min < 1.0 else f"{int(delta_min)} min ago"
                    elif delta_min <= 15.0:
                        track_status = "delayed"
                        last_update_str = f"{int(delta_min)} min ago"
                    else:
                        track_status = "offline"
                        if delta_min < 60:
                            last_update_str = f"{int(delta_min)} min ago"
                        else:
                            hours = int(delta_min // 60)
                            last_update_str = f"{hours} hr ago"

                lat = gps_log.latitude if gps_log else None
                lng = gps_log.longitude if gps_log else None
                accuracy = gps_log.accuracy if gps_log else None
                battery = gps_log.battery_level if gps_log else None
                speed_ms = sanitize_speed(gps_log.speed) if gps_log else 0.0
                speed_kmh = speed_ms * 3.6

                site_name = "—"
                site_id = None
                visit_status = "Travelling"

                if active_session:
                    site_name = active_session.site_name or f"Site #{active_session.site_id}"
                    site_id = active_session.site_id
                    visit_status = "Visiting"
                elif lat is not None and lng is not None and len(gate_qrcodes) > 0:
                    matched_gate = None
                    for g in gate_qrcodes:
                        if g.latitude is not None and g.longitude is not None:
                            dist_m = haversine_km(lat, lng, float(g.latitude), float(g.longitude)) * 1000.0
                            allowed_radius_m = float(g.radius) if g.radius and g.radius > 0 else 300.0
                            if dist_m <= allowed_radius_m:
                                matched_gate = g
                                break

                    if matched_gate is not None:
                        site_name = matched_gate.site_name or matched_gate.gate_name or f"Site #{matched_gate.site_id}"
                        site_id = matched_gate.site_id
                        visit_status = "Visiting"
                    else:
                        visit_status = "Travelling"
                else:
                    visit_status = "Travelling"

            # 5. Fetch Visit Metrics for Today (Counted ONLY when officer submits any of the 3 inspection reports)
            reports_today = today_reports_map.get(emp_id, [])
            actual_completed = len(reports_today)

            active_plan = TrackingRepository.get_active_plan_for_officer(db, emp_id, date.today())
            planned_count = 0
            pending_count = 0

            if active_plan:
                freqs = TrackingRepository.get_planned_visit_frequencies(db, active_plan.oid)
                reports_by_site: Dict[int, int] = {}
                for r in reports_today:
                    sid = r.get("site_id")
                    if sid:
                        reports_by_site[sid] = reports_by_site.get(sid, 0) + 1

                for f in freqs:
                    p_site = f["site_oid"]
                    p_freq = f["planned_frequency"]
                    planned_count += p_freq
                    done = reports_by_site.get(p_site, 0)
                    pending_count += max(0, p_freq - done)
            else:
                pending_count = 0

            item = LiveOfficerItem(
                id=off.oid,
                name=off.name,
                empCode=off.emp_code or f"EMP{off.oid:03d}",
                designation="Field Officer",
                phone=off.mobile,
                site=site_name,
                siteId=site_id,
                lat=lat,
                lng=lng,
                status=status,
                trackStatus=track_status,
                battery=battery,
                gpsAccuracy=accuracy,
                speed=round(speed_kmh, 1),
                distToday=0.0,  # Computed in history detail endpoint
                workHours=work_hours,
                lastUpdate=last_update_str,
                visitStatus=visit_status,
                visits=LiveOfficerVisitsCount(
                    completed=actual_completed,
                    pending=pending_count,
                    missed=0
                )
            )
            officer_items.append(item)

        return LiveTrackingResponse(officers=officer_items)

    @staticmethod
    def get_track_history_data(
        db: Session,
        employee_oid: int,
        date_str: str,
        user_branch_oid: Optional[int] = None,
        trip_number: Optional[int] = None
    ) -> TrackHistoryResponse:
        """Construct full Route History payload partitioned by individual Punch In / Out trips."""
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            raise AppBaseException(f"Invalid date format '{date_str}'. Expected format: YYYY-MM-DD", code="INVALID_DATE", status_code=400)

        # Verify employee exists
        employee = db.query(Employee).filter(Employee.oid == employee_oid).first()
        if not employee:
            raise AppBaseException(f"Field Officer with ID {employee_oid} not found", code="OFFICER_NOT_FOUND", status_code=404)

        # Cross-branch authorization check
        if user_branch_oid is not None and employee.BRANCH != user_branch_oid:
            raise AppBaseException(f"Access denied: Field Officer {employee_oid} belongs to another branch", code="FORBIDDEN_BRANCH", status_code=403)

        # 1. Fetch All Punch In / Out Time Logs for this Officer on target_date
        punch_logs = TrackingRepository.get_punch_time_logs_for_officer(db, employee_oid, target_date)
        now_time = datetime.now()
        
        punch_session_items: List[PunchSessionItem] = []
        for i, pl in enumerate(punch_logs):
            t_num = i + 1
            in_dt_val = pl["in_time"]
            out_dt_val = pl["out_time"]
            
            in_t_str = in_dt_val.strftime("%H:%M") if isinstance(in_dt_val, datetime) else str(in_dt_val)[:5]
            out_t_str = out_dt_val.strftime("%H:%M") if isinstance(out_dt_val, datetime) else (str(out_dt_val)[:5] if out_dt_val else None)
            is_active_session = out_dt_val is None
            
            if in_dt_val:
                end_calc = out_dt_val if out_dt_val else (now_time if target_date == date.today() else in_dt_val)
                diff_sec = max(0, int((end_calc - in_dt_val).total_seconds())) if isinstance(in_dt_val, datetime) and isinstance(end_calc, datetime) else 0
                h = diff_sec // 3600
                m = (diff_sec % 3600) // 60
                dur_str = f"{h}h {m}m"
            else:
                dur_str = "0h 0m"
                
            punch_session_items.append(PunchSessionItem(
                session_id=pl["time_log_id"],
                trip_number=t_num,
                in_time=in_t_str,
                out_time=out_t_str,
                duration_str=dur_str,
                is_active=is_active_session
            ))

        # Select the active trip to view
        selected_trip_idx = 0
        selected_time_log_id = None
        if punch_logs:
            if trip_number is not None and 1 <= trip_number <= len(punch_logs):
                selected_trip_idx = trip_number - 1
            else:
                # Default to the latest / active punch trip
                selected_trip_idx = len(punch_logs) - 1
            selected_trip = punch_logs[selected_trip_idx]
            selected_time_log_id = selected_trip.get("time_log_id")
            selected_trip_num = selected_trip_idx + 1
            start_dt = selected_trip["in_time"]
            end_dt = selected_trip["out_time"] if selected_trip["out_time"] else (now_time if target_date == date.today() else datetime.combine(target_date, time.max))
        else:
            selected_trip_num = 1
            start_dt = datetime.combine(target_date, time.min)
            end_dt = datetime.combine(target_date, time.max)

        # 2. Fetch Attendance Info for Selected Trip
        punch_locs = TrackingRepository.get_punch_attendance_locations_for_session(
            db, employee_oid, time_log_id=selected_time_log_id, start_dt=start_dt, end_dt=end_dt
        )
        in_loc = punch_locs.get("IN")
        out_loc = punch_locs.get("OUT")

        if punch_logs:
            sel_item = punch_session_items[selected_trip_idx]
            att_info = AttendanceInfo(
                punch_in=sel_item.in_time,
                punch_out=sel_item.out_time,
                punch_in_lat=in_loc["latitude"] if in_loc else None,
                punch_in_lng=in_loc["longitude"] if in_loc else None,
                punch_out_lat=out_loc["latitude"] if out_loc else None,
                punch_out_lng=out_loc["longitude"] if out_loc else None,
                work_hours=sel_item.duration_str or "00:00",
                status="PRESENT"
            )
        else:
            att_dict = TrackingRepository.get_attendance_summaries_by_date(db, target_date, [employee_oid])
            att_info_data = att_dict.get(employee_oid, {})
            att_info = AttendanceInfo(
                punch_in=att_info_data.get("punch_in"),
                punch_out=att_info_data.get("punch_out"),
                punch_in_lat=in_loc["latitude"] if in_loc else None,
                punch_in_lng=in_loc["longitude"] if in_loc else None,
                punch_out_lat=out_loc["latitude"] if out_loc else None,
                punch_out_lng=out_loc["longitude"] if out_loc else None,
                work_hours=att_info_data.get("work_hours", "00:00"),
                status=att_info_data.get("status", "absent").upper()
            )

        # 3. Fetch Actual Site Visit Sessions & Associated Site Gate Geofence Info for Selected Trip
        sessions = TrackingRepository.get_track_history_site_sessions(db, employee_oid, start_dt, end_dt)

        from app.models.site_gate_qrcode import SiteGateQrcode
        
        site_ids = list({s.site_id for s in sessions if s.site_id})
        gate_map: Dict[int, SiteGateQrcode] = {}
        if site_ids:
            gates = db.query(SiteGateQrcode).filter(
                SiteGateQrcode.SITE.in_(site_ids),
                SiteGateQrcode.latitude.isnot(None),
                SiteGateQrcode.longitude.isnot(None)
            ).all()
            for g in gates:
                if g.SITE not in gate_map:
                    gate_map[g.SITE] = g

        site_visits: List[SiteVisitItem] = []
        for s in sessions:
            check_in_str = s.start_time.strftime("%H:%M:%S") if s.start_time else None
            check_out_str = s.end_time.strftime("%H:%M:%S") if s.end_time else None
            
            gate = gate_map.get(s.site_id) if s.site_id else None
            gate_name = gate.gate_name if gate else None
            gate_lat = float(gate.latitude) if gate and gate.latitude is not None else None
            gate_lng = float(gate.longitude) if gate and gate.longitude is not None else None
            radius = float(gate.radius) if gate and gate.radius is not None else 300.0

            dist_from_gate_m = None
            if gate_lat is not None and gate_lng is not None and s.entry_latitude is not None and s.entry_longitude is not None:
                dist_from_gate_m = round(haversine_km(s.entry_latitude, s.entry_longitude, gate_lat, gate_lng) * 1000.0, 1)

            sv = SiteVisitItem(
                session_id=s.oid,
                site_id=s.site_id,
                site_name=s.site_name or (f"Site #{s.site_id}" if s.site_id else "Unknown Site"),
                gate_name=gate_name,
                gate_lat=gate_lat,
                gate_lng=gate_lng,
                radius=radius,
                check_in=check_in_str,
                check_out=check_out_str,
                entry_lat=s.entry_latitude,
                entry_lng=s.entry_longitude,
                exit_lat=s.exit_latitude,
                exit_lng=s.exit_longitude,
                duration_minutes=round(s.duration_minutes, 1) if s.duration_minutes is not None else None,
                status=s.status,
                raw_points_count=s.raw_points_count,
                distance_from_gate_m=dist_from_gate_m
            )
            site_visits.append(sv)

        # 3. Fetch Raw GPS Waypoints with Distinct On-Site Premises vs Transit Sequence Tagging
        raw_logs = TrackingRepository.get_track_history_waypoints(
            db, employee_oid, start_dt, end_dt, time_log_id=selected_time_log_id
        )

        waypoints: List[WaypointItem] = []
        total_distance = 0.0

        MAX_ACCURACY_THRESHOLD_M = 40.0   # Ignore pings with > 40m uncertainty (cell tower drift)
        MIN_MOVEMENT_THRESHOLD_KM = 0.015 # 15 meters minimum movement to emit a new sequential waypoint

        last_emitted_log = None
        transit_counter = 0
        premises_counters: Dict[int, int] = {}

        for log in raw_logs:
            speed_ms = sanitize_speed(log.speed)
            speed_kmh = round(speed_ms * 3.6, 1)
            t_str = log.recorded_at.strftime("%H:%M:%S") if log.recorded_at else "00:00:00"

            is_accurate = (log.accuracy is None) or (log.accuracy <= MAX_ACCURACY_THRESHOLD_M)

            # Check if this GPS point falls within an active visit session (Inside Premises)
            active_session_match = None
            if log.recorded_at:
                for sess in sessions:
                    if sess.start_time and sess.end_time:
                        if sess.start_time <= log.recorded_at <= sess.end_time:
                            active_session_match = sess
                            break
                    elif sess.start_time and not sess.end_time:
                        if sess.start_time <= log.recorded_at:
                            active_session_match = sess
                            break

            # Check if this waypoint sits directly on a Check-In or Check-Out event landmark:
            is_at_event_point = False
            for sess in sessions:
                if sess.entry_latitude is not None and sess.entry_longitude is not None:
                    if haversine_km(log.latitude, log.longitude, sess.entry_latitude, sess.entry_longitude) < MIN_MOVEMENT_THRESHOLD_KM:
                        is_at_event_point = True
                        break
                if sess.exit_latitude is not None and sess.exit_longitude is not None:
                    if haversine_km(log.latitude, log.longitude, sess.exit_latitude, sess.exit_longitude) < MIN_MOVEMENT_THRESHOLD_KM:
                        is_at_event_point = True
                        break

            # Drop inaccurate cellular triangulation road transit points (> 40m uncertainty)
            # This eliminates erratic 500m+ zig-zag spikes caused by cell-tower fallback
            if not is_accurate and not is_at_event_point and not active_session_match:
                continue

            log_seg = getattr(log, 'segment_id', 1)

            # Deduplicate consecutive stationary GPS pings:
            # If the officer is standing at the exact same location (< 15m movement and speed < 0.5 m/s)
            # within the same segment, do not add duplicate points
            if last_emitted_log is not None:
                last_seg = getattr(last_emitted_log, 'segment_id', 1)
                dist_from_last = haversine_km(last_emitted_log.latitude, last_emitted_log.longitude, log.latitude, log.longitude)

                # Skip identical timestamp duplicates or zero-movement duplicate pings (< 5 meters)
                if (log.recorded_at and last_emitted_log.recorded_at and log.recorded_at == last_emitted_log.recorded_at) or dist_from_last < 0.005:
                    continue

                # Only accumulate distance within the same enabled segment (never bridge disabled gaps)
                if last_seg == log_seg:
                    if dist_from_last < MIN_MOVEMENT_THRESHOLD_KM and speed_ms < 0.5:
                        continue  # Skip redundant stationary ping

                    if is_accurate and dist_from_last <= 5.0:
                        total_distance += dist_from_last

            # Assign distinct numbering & style for On-Site Premises vs Road Transit
            if is_at_event_point:
                # Part of the route line, but marker pin is hidden because Check-In/Out flag already marks it!
                wp = WaypointItem(
                    time=t_str,
                    lat=log.latitude,
                    lng=log.longitude,
                    speed=speed_kmh,
                    accuracy=log.accuracy,
                    battery=log.battery_level,
                    is_mock=bool(getattr(log, 'is_mock', False)),
                    is_on_site=bool(active_session_match),
                    site_id=active_session_match.site_id if active_session_match else None,
                    site_name=active_session_match.site_name if active_session_match else None,
                    session_id=active_session_match.oid if active_session_match else None,
                    transit_seq_num=None,
                    premises_seq_num=None,
                    display_label=None,
                    hide_marker_pin=True,
                    segment_id=log_seg
                )
            elif active_session_match:
                sess_id = active_session_match.oid
                p_cnt = premises_counters.get(sess_id, 0) + 1
                premises_counters[sess_id] = p_cnt
                
                wp = WaypointItem(
                    time=t_str,
                    lat=log.latitude,
                    lng=log.longitude,
                    speed=speed_kmh,
                    accuracy=log.accuracy,
                    battery=log.battery_level,
                    is_mock=bool(getattr(log, 'is_mock', False)),
                    is_on_site=True,
                    site_id=active_session_match.site_id,
                    site_name=active_session_match.site_name,
                    session_id=sess_id,
                    transit_seq_num=None,
                    premises_seq_num=p_cnt,
                    display_label=f"P{p_cnt}",
                    hide_marker_pin=False,
                    segment_id=log_seg
                )
            else:
                transit_counter += 1
                wp = WaypointItem(
                    time=t_str,
                    lat=log.latitude,
                    lng=log.longitude,
                    speed=speed_kmh,
                    accuracy=log.accuracy,
                    battery=log.battery_level,
                    is_mock=bool(getattr(log, 'is_mock', False)),
                    is_on_site=False,
                    site_id=None,
                    site_name=None,
                    session_id=None,
                    transit_seq_num=transit_counter,
                    premises_seq_num=None,
                    display_label=str(transit_counter),
                    hide_marker_pin=False,
                    segment_id=log_seg
                )

            waypoints.append(wp)
            last_emitted_log = log

        # Attach first/last GPS coordinates as daily punch location anchors if waypoints exist
        if waypoints:
            att_info.punch_in_lat = waypoints[0].lat
            att_info.punch_in_lng = waypoints[0].lng
            if att_info.punch_out:
                att_info.punch_out_lat = waypoints[-1].lat
                att_info.punch_out_lng = waypoints[-1].lng
            else:
                att_info.punch_out_lat = None
                att_info.punch_out_lng = None

        # 4. Fetch Planned Visits Target
        active_plan = TrackingRepository.get_active_plan_for_officer(db, employee_oid, target_date)
        planned_count = 0
        if active_plan:
            freqs = TrackingRepository.get_planned_visit_frequencies(db, active_plan.oid)
            planned_count = sum(f["planned_frequency"] for f in freqs)

        actual_visits_count = len(site_visits)
        completed_sessions_count = sum(1 for s in site_visits if (s.status or "").upper() == "COMPLETED")
        completed_count = min(completed_sessions_count, planned_count) if planned_count > 0 else completed_sessions_count
        pending_count = max(0, planned_count - completed_count)

        if total_distance == 0.0:
            total_distance = TrackingRepository.compute_raw_gps_distance(
                db, employee_oid, start_dt, end_dt
            )

        summary = TrackHistorySummary(
            total_waypoints=len(waypoints),
            total_distance_km=round(total_distance, 2),
            planned_visits=planned_count,
            actual_visits=actual_visits_count,
            completed_visits=completed_count,
            pending_visits=pending_count
        )

        return TrackHistoryResponse(
            employee_oid=employee_oid,
            date=date_str,
            attendance=att_info,
            total_punch_trips=max(1, len(punch_session_items)),
            selected_trip_number=selected_trip_num,
            punch_sessions=punch_session_items,
            summary=summary,
            waypoints=waypoints,
            site_visits=site_visits,
            is_track_history_enabled=bool(employee.track_history_enabled) if employee.track_history_enabled is not None else True
        )


    @staticmethod
    def get_planned_vs_actual_data(
        db: Session,
        employee_oid: Optional[int] = None,
        date_str: Optional[str] = None,
        period: str = "weekly",
        user_branch_oid: Optional[int] = None
    ) -> PlannedVsActualResponse:
        """Construct Planned vs Actual Site Visits comparison response."""
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else date.today()

        if employee_oid is None:
            # If no employee specified, return total aggregation across active officers scoped by user_branch_oid
            officers = TrackingRepository.get_active_field_officers(db, user_branch_oid=user_branch_oid)
            total_p = 0
            total_a = 0
            site_map: Dict[int, Dict[str, Any]] = {}

            for off in officers:
                plan = TrackingRepository.get_active_plan_for_officer(db, off.oid, target_date)
                if not plan:
                    continue

                freqs = TrackingRepository.get_planned_visit_frequencies(db, plan.oid)
                start_d, end_d = TrackingRepository.get_active_field_officers(db), target_date # default bounds

                # Calculate start/end date for plan
                if plan.planning_type == "WEEKLY":
                    s_dt = datetime.combine(plan.week_start_date or target_date, time.min)
                    e_dt = datetime.combine(plan.week_end_date or target_date, time.max)
                else:
                    s_dt = datetime.combine(target_date, time.min)
                    e_dt = datetime.combine(target_date, time.max)

                sessions = TrackingRepository.get_track_history_site_sessions(db, off.oid, s_dt, e_dt)

                for f in freqs:
                    s_oid = f["site_oid"]
                    if s_oid not in site_map:
                        site_map[s_oid] = {
                            "site_oid": s_oid,
                            "site_name": f["site_name"],
                            "planned": 0,
                            "actual": 0,
                            "completed_sessions": 0
                        }
                    site_map[s_oid]["planned"] += f["planned_frequency"]

                for sess in sessions:
                    if sess.site_id and sess.site_id in site_map:
                        site_map[sess.site_id]["actual"] += 1
                        if (sess.status or "").upper() == "COMPLETED":
                            site_map[sess.site_id]["completed_sessions"] += 1

            site_items: List[PlannedVsActualItem] = []
            for s_oid, data in site_map.items():
                p = data["planned"]
                a = data["actual"]
                comp_cnt = data["completed_sessions"]
                c = min(comp_cnt, p)
                r = max(0, p - c)
                site_items.append(PlannedVsActualItem(
                    site_oid=s_oid,
                    site_name=data["site_name"],
                    planned=p,
                    actual=a,
                    completed=c,
                    remaining=r
                ))
                total_p += p
                total_a += a

            return PlannedVsActualResponse(
                employee_oid=None,
                period=period,
                total_planned=total_p,
                total_actual=total_a,
                sites=site_items
            )

        # Single Officer Specific comparison with branch authorization check
        employee = db.query(Employee).filter(Employee.oid == employee_oid).first()
        if not employee:
            raise AppBaseException(f"Field Officer with ID {employee_oid} not found", code="OFFICER_NOT_FOUND", status_code=404)

        if user_branch_oid is not None and employee.BRANCH != user_branch_oid:
            raise AppBaseException(f"Access denied: Field Officer {employee_oid} belongs to another branch", code="FORBIDDEN_BRANCH", status_code=403)

        plan = TrackingRepository.get_active_plan_for_officer(db, employee_oid, target_date)
        if not plan:
            return PlannedVsActualResponse(
                employee_oid=employee_oid,
                period=period,
                total_planned=0,
                total_actual=0,
                sites=[]
            )

        freqs = TrackingRepository.get_planned_visit_frequencies(db, plan.oid)

        if plan.planning_type == "WEEKLY" and plan.week_start_date and plan.week_end_date:
            s_dt = datetime.combine(plan.week_start_date, time.min)
            e_dt = datetime.combine(plan.week_end_date, time.max)
        else:
            s_dt = datetime.combine(target_date, time.min)
            e_dt = datetime.combine(target_date, time.max)

        sessions = TrackingRepository.get_track_history_site_sessions(db, employee_oid, s_dt, e_dt)

        actual_counts_by_site: Dict[int, int] = {}
        completed_counts_by_site: Dict[int, int] = {}
        for sess in sessions:
            if sess.site_id:
                actual_counts_by_site[sess.site_id] = actual_counts_by_site.get(sess.site_id, 0) + 1
                if (sess.status or "").upper() == "COMPLETED":
                    completed_counts_by_site[sess.site_id] = completed_counts_by_site.get(sess.site_id, 0) + 1

        site_items = []
        total_p = 0
        total_a = 0

        for f in freqs:
            s_oid = f["site_oid"]
            p = f["planned_frequency"]
            a = actual_counts_by_site.get(s_oid, 0)
            comp_cnt = completed_counts_by_site.get(s_oid, 0)
            c = min(comp_cnt, p)
            r = max(0, p - c)

            site_items.append(PlannedVsActualItem(
                site_oid=s_oid,
                site_name=f["site_name"],
                planned=p,
                actual=a,
                completed=c,
                remaining=r
            ))
            total_p += p
            total_a += a

        return PlannedVsActualResponse(
            employee_oid=employee_oid,
            period=plan.planning_type.lower() if plan.planning_type else period,
            total_planned=total_p,
            total_actual=total_a,
            sites=site_items
        )
