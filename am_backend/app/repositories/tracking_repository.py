from datetime import date, datetime, time
from typing import Any, Dict, List, Optional
from sqlalchemy import text, func, and_, or_
from sqlalchemy.orm import Session
import logging

from app.models.employee import Employee
from app.models.site import Site
from app.models.tracking import GpsLocationLog
from app.models.field_officer_visit import SiteVisitSession
from app.models.assigned_visit import FieldOfficerAssignedVisits
from app.models.visit_frequency import FieldOfficerVisitFrequency
from app.models.field_officer_track_history_config import FieldOfficerTrackHistoryConfig

logger = logging.getLogger(__name__)


class UnifiedGpsLocation:
    """Unified GPS coordinate container supporting logs from GPS_LOCATION_LOGS and punch-in from FIELD_OFFICER_ATTENDANCE_LOCATION."""
    def __init__(
        self,
        latitude: Any,
        longitude: Any,
        accuracy: Optional[Any] = None,
        speed: Optional[Any] = 0.0,
        battery_level: Optional[Any] = None,
        recorded_at: Optional[datetime] = None,
        is_mock: bool = False,
        segment_id: Optional[int] = 1,
    ):
        self.latitude = float(latitude) if latitude is not None else None
        self.longitude = float(longitude) if longitude is not None else None
        self.accuracy = float(accuracy) if accuracy is not None else 10.0
        self.speed = float(speed) if speed is not None else 0.0
        self.battery_level = float(battery_level) if battery_level is not None else None
        self.recorded_at = recorded_at
        self.is_mock = is_mock
        self.segment_id = segment_id



class TrackingRepository:
    """Repository for querying Live Tracking, Track History, and Planned vs Actual visit metrics."""

    @staticmethod
    def get_active_field_officers(
        db: Session,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        user_branch_oids: Optional[List[int]] = None,
    ) -> List[Employee]:
        """Retrieve active Field Officers (active = 1, DESIGNATION = 19), optionally scoped by area_manager_oid or user_branch_oid."""
        query = db.query(Employee).filter(Employee.active == 1, Employee.DESIGNATION == 19)
        if user_branch_oids:
            if area_manager_oid is not None:
                query = query.filter(
                    Employee.BRANCH.in_(user_branch_oids),
                    or_(
                        Employee.AREA_MANAGER_OID.is_(None),
                        Employee.AREA_MANAGER_OID == area_manager_oid,
                    ),
                )
            else:
                query = query.filter(Employee.BRANCH.in_(user_branch_oids))
        elif area_manager_oid is not None:
            if user_branch_oid is not None:
                query = query.filter(
                    Employee.BRANCH == user_branch_oid,
                    or_(
                        Employee.AREA_MANAGER_OID.is_(None),
                        Employee.AREA_MANAGER_OID == area_manager_oid,
                    ),
                )
            else:
                query = query.filter(
                    or_(
                        Employee.AREA_MANAGER_OID.is_(None),
                        Employee.AREA_MANAGER_OID == area_manager_oid,
                    )
                )
        elif user_branch_oid is not None:
            query = query.filter(Employee.BRANCH == user_branch_oid)
        return query.order_by(Employee.name.asc()).all()

    @staticmethod
    def get_latest_gps_logs_for_officers(db: Session, officer_oids: List[int]) -> Dict[int, Any]:
        """Fetch the single latest GPS location per officer_oid.
        
        Seamlessly integrates continuous tracking (GPS_LOCATION_LOGS) with instant
        punch-in locations (FIELD_OFFICER_ATTENDANCE_LOCATION), picking whichever is newest.
        """
        if not officer_oids:
            return {}

        # 1. Subquery for max recorded_at per Employee from continuous GPS logs
        subq = (
            db.query(
                GpsLocationLog.Employee,
                func.max(GpsLocationLog.recorded_at).label("max_recorded")
            )
            .filter(GpsLocationLog.Employee.in_(officer_oids))
            .group_by(GpsLocationLog.Employee)
            .subquery()
        )

        logs = (
            db.query(GpsLocationLog)
            .join(
                subq,
                and_(
                    GpsLocationLog.Employee == subq.c.Employee,
                    GpsLocationLog.recorded_at == subq.c.max_recorded
                )
            )
            .all()
        )

        result: Dict[int, Any] = {}
        for log in logs:
            if log.Employee not in result:
                result[log.Employee] = UnifiedGpsLocation(
                    latitude=log.latitude,
                    longitude=log.longitude,
                    accuracy=log.accuracy,
                    speed=log.speed,
                    battery_level=log.battery_level,
                    recorded_at=log.recorded_at,
                )

        # 2. Query latest punch locations from FIELD_OFFICER_ATTENDANCE_LOCATION
        try:
            att_loc_q = text("""
                SELECT f1.employee_oid, f1.latitude, f1.longitude, f1.created_at
                FROM FIELD_OFFICER_ATTENDANCE_LOCATION f1
                INNER JOIN (
                    SELECT employee_oid, MAX(created_at) AS max_created
                    FROM FIELD_OFFICER_ATTENDANCE_LOCATION
                    WHERE employee_oid IN :officer_oids
                    GROUP BY employee_oid
                ) f2 ON f1.employee_oid = f2.employee_oid AND f1.created_at = f2.max_created
                WHERE f1.employee_oid IN :officer_oids
            """)
            att_rows = db.execute(att_loc_q, {"officer_oids": tuple(officer_oids)}).mappings().all()

            for r in att_rows:
                emp_oid = r["employee_oid"]
                att_time = r["created_at"]
                existing = result.get(emp_oid)
                # If no GPS log exists, or attendance punch location is newer than latest GPS log:
                if not existing or (att_time and existing.recorded_at and att_time > existing.recorded_at):
                    prev_battery = existing.battery_level if existing else None
                    prev_accuracy = existing.accuracy if existing else 10.0
                    result[emp_oid] = UnifiedGpsLocation(
                        latitude=r["latitude"],
                        longitude=r["longitude"],
                        accuracy=prev_accuracy,
                        speed=0.0,
                        battery_level=prev_battery,
                        recorded_at=att_time,
                    )
        except Exception as e:
            logger.warning(f"Failed to query FIELD_OFFICER_ATTENDANCE_LOCATION fallback: {e}")

        return result

    @staticmethod
    def get_active_site_visit_sessions(db: Session, officer_oids: List[int]) -> Dict[int, SiteVisitSession]:
        """Fetch currently active SiteVisitSession (end_time is NULL or status = 'IN_PROGRESS') per officer."""
        if not officer_oids:
            return {}

        sessions = (
            db.query(SiteVisitSession)
            .filter(
                SiteVisitSession.Employee.in_(officer_oids),
                or_(
                    SiteVisitSession.end_time.is_(None),
                    func.upper(SiteVisitSession.status) == "IN_PROGRESS"
                )
            )
            .order_by(SiteVisitSession.start_time.desc())
            .all()
        )

        result: Dict[int, SiteVisitSession] = {}
        for s in sessions:
            if s.Employee not in result:
                result[s.Employee] = s

        return result

    @staticmethod
    def get_attendance_summaries_by_date(
        db: Session, target_date: date, officer_oids: List[int]
    ) -> Dict[int, Dict[str, Any]]:
        """Fetch punch_in, punch_out, work_hours, and active duty status for officer_oids on target_date."""
        if not officer_oids:
            return {}

        target_date_str = target_date.strftime("%Y-%m-%d")

        now_time = datetime.now()
        query = text("""
            SELECT 
                e.oid AS employee_oid,
                MIN(COALESCE(atl.in_time, ea.FIRST_TIME_LOG)) AS min_in_time,
                MAX(COALESCE(atl.out_time, ea.LAST_TIME_LOG)) AS max_out_time,
                MAX(CASE WHEN atl.in_time IS NOT NULL AND atl.out_time IS NULL THEN 1 ELSE 0 END) AS is_active_duty,
                SUM(
                    CASE 
                        WHEN atl.out_time IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, atl.in_time, atl.out_time)
                        WHEN atl.in_time IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, atl.in_time, :now_time)
                        ELSE 0 
                    END
                ) AS total_minutes
            FROM EMPLOYEE e
            LEFT JOIN ATTENDANCE_ROW ar ON ar.EMPLOYEE = e.oid
            LEFT JOIN ATTENDANCE_CELL ac ON ac.ATTENDANCE_ROW = ar.oid AND ac.attendance_date = :target_date
            LEFT JOIN ATTENDANCE_TIME_LOG atl ON atl.ATTENDANCE_CELL = ac.oid
            LEFT JOIN EMPLOYEE_ATTENDANCE ea ON ea.EMPLOYEE = e.oid AND ea.duty_date = :target_date
            WHERE e.oid IN :officer_oids
            GROUP BY e.oid
        """)

        # Execute query using parameter mapping
        rows = db.execute(
            query,
            {"target_date": target_date_str, "officer_oids": tuple(officer_oids), "now_time": now_time}
        ).mappings().all()

        def _format_time_str(val: Any) -> Optional[str]:
            if not val:
                return None
            if isinstance(val, (datetime, time)):
                return val.strftime("%H:%M")
            s = str(val).strip()
            if " " in s:
                s = s.split(" ")[-1]
            if ":" in s:
                parts = s.split(":")
                return f"{int(parts[0]):02d}:{int(parts[1]):02d}"
            return s[:5]

        result: Dict[int, Dict[str, Any]] = {}
        for r in rows:
            emp_id = r.get("employee_oid")
            min_in = r.get("min_in_time")
            max_out = r.get("max_out_time")
            is_active = bool(r.get("is_active_duty", 0))
            minutes = r.get("total_minutes") or 0

            status = "present" if min_in is not None else "absent"
            
            h = int(minutes // 60)
            m = int(minutes % 60)
            work_hours_str = f"{h}h {m}m"

            result[emp_id] = {
                "punch_in": _format_time_str(min_in),
                "punch_out": _format_time_str(max_out),
                "work_hours": work_hours_str,
                "status": status,
                "is_active_duty": is_active and (min_in is not None)
            }

        return result

    @staticmethod
    def get_punch_attendance_locations_for_session(
        db: Session,
        employee_oid: int,
        time_log_id: Optional[int] = None,
        start_dt: Optional[datetime] = None,
        end_dt: Optional[datetime] = None
    ) -> Dict[str, Dict[str, Any]]:
        """Fetch IN and OUT punch location coordinates from FIELD_OFFICER_ATTENDANCE_LOCATION."""
        results: Dict[str, Dict[str, Any]] = {}
        try:
            if time_log_id:
                query = text("""
                    SELECT punch_type, latitude, longitude, created_at
                    FROM FIELD_OFFICER_ATTENDANCE_LOCATION
                    WHERE attendance_time_log = :time_log_id
                    ORDER BY created_at ASC
                """)
                rows = db.execute(query, {"time_log_id": time_log_id}).mappings().all()
            elif start_dt and end_dt:
                query = text("""
                    SELECT punch_type, latitude, longitude, created_at
                    FROM FIELD_OFFICER_ATTENDANCE_LOCATION
                    WHERE employee_oid = :emp_oid 
                      AND created_at >= :start_dt AND created_at <= :end_dt
                    ORDER BY created_at ASC
                """)
                rows = db.execute(query, {
                    "emp_oid": employee_oid,
                    "start_dt": start_dt,
                    "end_dt": end_dt
                }).mappings().all()
            else:
                rows = []

            for r in rows:
                p_type = (r.get("punch_type") or "").strip().upper()
                lat = float(r["latitude"]) if r.get("latitude") is not None else None
                lng = float(r["longitude"]) if r.get("longitude") is not None else None
                c_at = r.get("created_at")
                if p_type in ("IN", "OUT") and lat is not None and lng is not None:
                    results[p_type] = {
                        "latitude": lat,
                        "longitude": lng,
                        "recorded_at": c_at
                    }
        except Exception as e:
            logger.warning(f"Failed to query FIELD_OFFICER_ATTENDANCE_LOCATION for session: {e}")

        return results

    @staticmethod
    def get_track_history_waypoints(
        db: Session,
        employee_oid: int,
        start_dt: datetime,
        end_dt: datetime,
        time_log_id: Optional[int] = None
    ) -> List[Any]:
        """Fetch raw GPS waypoints for officer between start_dt and end_dt, unified with FIELD_OFFICER_ATTENDANCE_LOCATION punch coordinates, filtered by Track History enable/disable intervals."""
        # 1. Fetch Track History interval configs for officer
        configs: List[FieldOfficerTrackHistoryConfig] = (
            db.query(FieldOfficerTrackHistoryConfig)
            .filter(
                FieldOfficerTrackHistoryConfig.employee_oid == employee_oid,
                FieldOfficerTrackHistoryConfig.effective_from <= end_dt,
                or_(
                    FieldOfficerTrackHistoryConfig.effective_to.is_(None),
                    FieldOfficerTrackHistoryConfig.effective_to >= start_dt,
                ),
            )
            .order_by(FieldOfficerTrackHistoryConfig.effective_from.asc())
            .all()
        )

        emp = db.query(Employee).filter(Employee.oid == employee_oid).first()
        current_emp_enabled = int(emp.track_history_enabled) if emp and emp.track_history_enabled is not None else 1

        if not configs and current_emp_enabled == 0:
            return []

        def is_enabled_at(dt: Optional[datetime]) -> bool:
            if not dt:
                return True
            if not configs:
                return current_emp_enabled == 1
            for cfg in configs:
                if cfg.effective_from <= dt and (cfg.effective_to is None or dt < cfg.effective_to):
                    return bool(cfg.is_enabled)
            if dt < configs[0].effective_from:
                return True
            return bool(configs[-1].is_enabled)

        gps_logs: List[Any] = (
            db.query(GpsLocationLog)
            .filter(
                GpsLocationLog.Employee == employee_oid,
                GpsLocationLog.recorded_at >= start_dt,
                GpsLocationLog.recorded_at <= end_dt
            )
            .order_by(GpsLocationLog.recorded_at.asc())
            .all()
        )

        punch_locs = TrackingRepository.get_punch_attendance_locations_for_session(
            db, employee_oid, time_log_id=time_log_id, start_dt=start_dt, end_dt=end_dt
        )
        in_punch = punch_locs.get("IN")
        out_punch = punch_locs.get("OUT")

        raw_candidates: List[Any] = list(gps_logs)

        # Prepend punch-in location if available and track history was enabled at punch in
        if in_punch:
            in_dt = in_punch.get("recorded_at") or start_dt
            if is_enabled_at(in_dt):
                in_lat = in_punch["latitude"]
                in_lng = in_punch["longitude"]
                
                should_prepend = True
                if raw_candidates:
                    first_log = raw_candidates[0]
                    if first_log.recorded_at and first_log.recorded_at <= in_dt:
                        should_prepend = False
                    elif first_log.latitude is not None and first_log.longitude is not None:
                        dt_diff = abs((first_log.recorded_at - in_dt).total_seconds()) if first_log.recorded_at else 999
                        if dt_diff < 60 and abs(first_log.latitude - in_lat) < 0.00015 and abs(first_log.longitude - in_lng) < 0.00015:
                            should_prepend = False

                if should_prepend:
                    punch_in_pt = UnifiedGpsLocation(
                        latitude=in_lat,
                        longitude=in_lng,
                        accuracy=10.0,
                        speed=0.0,
                        battery_level=None,
                        recorded_at=in_dt,
                        is_mock=False
                    )
                    raw_candidates.insert(0, punch_in_pt)

        # Append punch-out location if available and track history was enabled at punch out
        if out_punch:
            out_dt = out_punch.get("recorded_at") or end_dt
            if is_enabled_at(out_dt):
                out_lat = out_punch["latitude"]
                out_lng = out_punch["longitude"]
                
                should_append = True
                if raw_candidates:
                    last_log = raw_candidates[-1]
                    if last_log.recorded_at and last_log.recorded_at >= out_dt:
                        should_append = False

                if should_append:
                    punch_out_pt = UnifiedGpsLocation(
                        latitude=out_lat,
                        longitude=out_lng,
                        accuracy=10.0,
                        speed=0.0,
                        battery_level=None,
                        recorded_at=out_dt,
                        is_mock=False
                    )
                    raw_candidates.append(punch_out_pt)

        # Filter points by enabled intervals and tag distinct continuous segments
        result_logs: List[Any] = []
        curr_segment_id = 1
        last_kept_time: Optional[datetime] = None

        for pt in raw_candidates:
            rec_dt = getattr(pt, "recorded_at", None)
            if not is_enabled_at(rec_dt):
                continue

            if last_kept_time and rec_dt:
                # Check if any disabled interval falls between last_kept_time and rec_dt
                has_disabled_gap = False
                for cfg in configs:
                    if cfg.is_enabled == 0:
                        cfg_start = cfg.effective_from
                        cfg_end = cfg.effective_to or end_dt
                        if max(last_kept_time, cfg_start) < min(rec_dt, cfg_end):
                            has_disabled_gap = True
                            break
                if has_disabled_gap:
                    curr_segment_id += 1

            setattr(pt, "segment_id", curr_segment_id)
            result_logs.append(pt)
            last_kept_time = rec_dt

        return result_logs

    @staticmethod
    def compute_raw_gps_distance(
        db: Session, employee_oid: int, start_dt: datetime, end_dt: datetime
    ) -> float:
        """Compute the total physical GPS travel distance in km directly from GPS_LOCATION_LOGS.
        
        Used to accurately calculate and display Total GPS Distance on Track History KPI cards
        even when continuous track history route line logging was set to disabled for this officer.
        """
        import math

        def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
            r = 6371.0
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = (math.sin(dlat / 2) ** 2 +
                 math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
                 math.sin(dlon / 2) ** 2)
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            return r * c

        logs = (
            db.query(GpsLocationLog)
            .filter(
                GpsLocationLog.Employee == employee_oid,
                GpsLocationLog.recorded_at >= start_dt,
                GpsLocationLog.recorded_at <= end_dt
            )
            .order_by(GpsLocationLog.recorded_at.asc())
            .all()
        )
        if not logs or len(logs) < 2:
            return 0.0

        total_km = 0.0
        last_log = None
        for log in logs:
            if log.latitude is None or log.longitude is None:
                continue
            acc = log.accuracy if log.accuracy is not None else 10.0
            if acc > 50.0:
                continue
            if last_log is not None:
                d = haversine_km(last_log.latitude, last_log.longitude, log.latitude, log.longitude)
                spd = float(log.speed) if log.speed is not None else 0.0
                if spd < 0:
                    spd = 0.0
                if d < 0.015 and spd < 0.5:
                    continue
                if d <= 5.0:
                    total_km += d
            last_log = log

        return round(total_km, 2)


    @staticmethod
    def get_punch_time_logs_for_officer(
        db: Session, employee_oid: int, target_date: date
    ) -> List[Dict[str, Any]]:
        """Fetch all individual punch in / punch out time logs for an officer on a specific date."""
        query = text("""
            SELECT 
                atl.oid AS time_log_id,
                atl.in_time,
                atl.out_time
            FROM ATTENDANCE_TIME_LOG atl
            INNER JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
            INNER JOIN ATTENDANCE_ROW ar ON ac.ATTENDANCE_ROW = ar.oid
            WHERE ar.EMPLOYEE = :employee_oid 
              AND ac.attendance_date = :target_date
            ORDER BY atl.in_time ASC
        """)
        rows = db.execute(
            query, 
            {"employee_oid": employee_oid, "target_date": target_date.strftime("%Y-%m-%d")}
        ).mappings().all()
        
        result = []
        for r in rows:
            result.append({
                "time_log_id": r["time_log_id"],
                "in_time": r["in_time"],
                "out_time": r["out_time"]
            })
        return result

    @staticmethod
    def get_track_history_site_sessions(
        db: Session, employee_oid: int, start_dt: datetime, end_dt: datetime
    ) -> List[SiteVisitSession]:
        """Fetch actual SITE_VISIT_SESSIONS for officer starting between start_dt and end_dt."""
        return (
            db.query(SiteVisitSession)
            .filter(
                SiteVisitSession.Employee == employee_oid,
                SiteVisitSession.start_time >= start_dt,
                SiteVisitSession.start_time <= end_dt
            )
            .order_by(SiteVisitSession.start_time.asc())
            .all()
        )

    @staticmethod
    def get_submitted_reports_for_officers_today(
        db: Session, officer_oids: List[int], target_date: date
    ) -> Dict[int, List[Dict[str, Any]]]:
        """Fetch all submitted Day, Night, and General visit reports for officers on target_date."""
        if not officer_oids:
            return {}

        query = text("""
            SELECT employee_oid, site_id, 'DAY' AS report_type, oid, visit_date, created_on
            FROM FIELD_OFFICER_DAY_VISIT_REPORTS
            WHERE employee_oid IN :oids AND (visit_date = :target_date OR DATE(created_on) = :target_date)
            UNION ALL
            SELECT employee_oid, site_id, 'NIGHT' AS report_type, oid, visit_date, created_on
            FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS
            WHERE employee_oid IN :oids AND (visit_date = :target_date OR DATE(created_on) = :target_date)
            UNION ALL
            SELECT employee_oid, site_id, 'GENERAL' AS report_type, oid, visit_date, created_on
            FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS
            WHERE employee_oid IN :oids AND (visit_date = :target_date OR DATE(created_on) = :target_date)
        """)

        try:
            rows = db.execute(query, {"oids": tuple(officer_oids), "target_date": str(target_date)}).mappings().all()
            res: Dict[int, List[Dict[str, Any]]] = {}
            for r in rows:
                emp = r["employee_oid"]
                if emp not in res:
                    res[emp] = []
                res[emp].append(dict(r))
            return res
        except Exception:
            return {}

    @staticmethod
    def get_active_plan_for_officer(
        db: Session, employee_oid: int, target_date: date
    ) -> Optional[FieldOfficerAssignedVisits]:
        """Find published/active FieldOfficerAssignedVisits plan matching target_date for officer."""
        published_plans = (
            db.query(FieldOfficerAssignedVisits)
            .filter(
                FieldOfficerAssignedVisits.employee_oid == employee_oid,
                FieldOfficerAssignedVisits.status == "PUBLISHED"
            )
            .order_by(FieldOfficerAssignedVisits.created_at.desc())
            .all()
        )

        for plan in published_plans:
            if plan.planning_type == "WEEKLY":
                if plan.week_start_date and plan.week_end_date:
                    if plan.week_start_date <= target_date <= plan.week_end_date:
                        return plan
            elif plan.planning_type == "MONTHLY":
                if plan.planning_month and plan.planning_year:
                    if target_date.year == plan.planning_year and target_date.month == plan.planning_month:
                        return plan
            elif plan.planning_type == "SINGLE":
                if plan.visit_date == target_date:
                    return plan

        # Check assigned plans for target_date
        all_plans = (
            db.query(FieldOfficerAssignedVisits)
            .filter(
                FieldOfficerAssignedVisits.employee_oid == employee_oid
            )
            .order_by(FieldOfficerAssignedVisits.created_at.desc())
            .all()
        )
        for plan in all_plans:
            if plan.planning_type == "WEEKLY":
                if plan.week_start_date and plan.week_end_date:
                    if plan.week_start_date <= target_date <= plan.week_end_date:
                        return plan
            elif plan.planning_type == "MONTHLY":
                if plan.planning_month and plan.planning_year:
                    if target_date.year == plan.planning_year and target_date.month == plan.planning_month:
                        return plan
            elif plan.planning_type == "SINGLE":
                if plan.visit_date == target_date:
                    return plan

        return None

    @staticmethod
    def get_planned_visit_frequencies(
        db: Session, plan_oid: int
    ) -> List[Dict[str, Any]]:
        """Fetch site-level visit frequencies configured for a visit plan."""
        items = (
            db.query(FieldOfficerVisitFrequency, Site)
            .join(Site, FieldOfficerVisitFrequency.site_oid == Site.oid)
            .filter(FieldOfficerVisitFrequency.plan_oid == plan_oid)
            .all()
        )

        result = []
        for freq, site in items:
            result.append({
                "site_oid": site.oid,
                "site_name": site.name,
                "planned_frequency": freq.visit_frequency
            })
        return result
