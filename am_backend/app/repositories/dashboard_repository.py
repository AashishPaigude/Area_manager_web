from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging

from app.repositories.attendance_repository import AttendanceRepository

logger = logging.getLogger(__name__)


class DashboardRepository:
    """Repository for querying real-time Area Manager Dashboard data from MariaDB/MySQL.

    ROSTER RULE: Only officers who have actually submitted at least one valid General,
    Day, or Night report for the target date will appear in the Dashboard roster.
    """

    @staticmethod
    @staticmethod
    def get_dashboard_data(
        db: Session,
        target_date: Optional[date] = None,
        period: str = "weekly",
        branch_oid: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Fetch consolidated Dashboard data for target_date (defaults to current date).

        Returns:
            Dict with KPI summary metrics, officer roster items, and per-officer visits.
        """
        if target_date is None:
            target_date = date.today()

        target_date_str = DashboardRepository._format_date(target_date)

        # Fetch daily attendance metrics for target_date using single source of truth
        att_data = AttendanceRepository.get_attendance_list(db, target_date=target_date, user_branch_oid=branch_oid)
        att_summary = att_data.get("summary", {})
        att_present = att_summary.get("present", 0)
        att_absent = att_summary.get("absent", 0)

        # Fetch both weekly and monthly visit metrics in one go
        planned_w, completed_w = DashboardRepository._calculate_period_kpis(db, target_date, "weekly", branch_oid=branch_oid)
        planned_m, completed_m = DashboardRepository._calculate_period_kpis(db, target_date, "monthly", branch_oid=branch_oid)
        planned_visits_kpi = planned_w if period == "weekly" else planned_m
        completed_visits_kpi = completed_w if period == "weekly" else completed_m

        # ----------------------------------------------------------------------
        # 1. DIRECT SOURCE TABLE QUERIES: Fetch Day, Night, and General reports for target_date
        # ----------------------------------------------------------------------
        params = {"target_date": str(target_date)}

        if branch_oid is not None:
            params["branch_oid"] = branch_oid
            day_query = text("""
                SELECT r.* 
                FROM FIELD_OFFICER_DAY_VISIT_REPORTS r
                JOIN EMPLOYEE e ON r.employee_oid = e.oid
                WHERE r.visit_date = :target_date AND e.BRANCH = :branch_oid
            """)
            night_query = text("""
                SELECT r.* 
                FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS r
                JOIN EMPLOYEE e ON r.employee_oid = e.oid
                WHERE r.visit_date = :target_date AND e.BRANCH = :branch_oid
            """)
            gen_query = text("""
                SELECT r.* 
                FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS r
                JOIN EMPLOYEE e ON r.employee_oid = e.oid
                WHERE r.visit_date = :target_date AND e.BRANCH = :branch_oid
            """)
        else:
            day_query = text("SELECT * FROM FIELD_OFFICER_DAY_VISIT_REPORTS WHERE visit_date = :target_date")
            night_query = text("SELECT * FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS WHERE visit_date = :target_date")
            gen_query = text("SELECT * FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS WHERE visit_date = :target_date")

        day_rows = [dict(r) for r in db.execute(day_query, params).mappings().all()]
        night_rows = [dict(r) for r in db.execute(night_query, params).mappings().all()]
        gen_rows = [dict(r) for r in db.execute(gen_query, params).mappings().all()]

        # ----------------------------------------------------------------------
        # 2. ASSEMBLE VISITS IN MEMORY GROUPED BY OFFICER
        # ----------------------------------------------------------------------
        visits_by_officer: Dict[int, List[Dict[str, Any]]] = {}

        for r in day_rows:
            emp_oid = r.get("employee_oid")
            if not emp_oid:
                continue

            site_id = r.get("site_id")
            site_name = r.get("site_name")
            if site_id and not site_name:
                s_row = db.execute(text("SELECT name FROM SITE WHERE oid = :oid LIMIT 1"), {"oid": site_id}).mappings().first()
                if s_row: site_name = s_row.get("name")

            check_in_raw = r.get("check-in_time") or r.get("start_time")
            check_out_raw = r.get("check-out_time") or r.get("end_time")

            v_obj = {
                "id": f"day_{r.get('oid')}",
                "report_oid": str(r.get("oid")),
                "officer_id": emp_oid,
                "site_id": site_id,
                "site": site_name or (f"Site #{site_id}" if site_id else "Unknown Site"),
                "site_name": site_name or (f"Site #{site_id}" if site_id else "Unknown Site"),
                "visit_type": "Day Visit",
                "purpose": "Day Visit",
                "check_in_raw": check_in_raw,
                "check_in": DashboardRepository._format_time(check_in_raw),
                "checkIn": DashboardRepository._format_time(check_in_raw),
                "check_out_raw": check_out_raw,
                "check_out": DashboardRepository._format_time(check_out_raw),
                "checkOut": DashboardRepository._format_time(check_out_raw),
                "duration": DashboardRepository._calculate_duration(check_in_raw, check_out_raw),
                "status": r.get("status") or "Completed",
                "visit_date": str(r.get("visit_date")),
                "created_at": r.get("created_on"),
            }
            visits_by_officer.setdefault(emp_oid, []).append(v_obj)

        for r in night_rows:
            emp_oid = r.get("employee_oid")
            if not emp_oid:
                continue

            site_id = r.get("site_id")
            site_name = r.get("site_name")
            if site_id and not site_name:
                s_row = db.execute(text("SELECT name FROM SITE WHERE oid = :oid LIMIT 1"), {"oid": site_id}).mappings().first()
                if s_row: site_name = s_row.get("name")

            check_in_raw = r.get("check-in_time") or r.get("start_time")
            check_out_raw = r.get("check-out_time") or r.get("end_time")

            v_obj = {
                "id": f"night_{r.get('oid')}",
                "report_oid": str(r.get("oid")),
                "officer_id": emp_oid,
                "site_id": site_id,
                "site": site_name or (f"Site #{site_id}" if site_id else "Unknown Site"),
                "site_name": site_name or (f"Site #{site_id}" if site_id else "Unknown Site"),
                "visit_type": "Night Visit",
                "purpose": "Night Visit",
                "check_in_raw": check_in_raw,
                "check_in": DashboardRepository._format_time(check_in_raw),
                "checkIn": DashboardRepository._format_time(check_in_raw),
                "check_out_raw": check_out_raw,
                "check_out": DashboardRepository._format_time(check_out_raw),
                "checkOut": DashboardRepository._format_time(check_out_raw),
                "duration": DashboardRepository._calculate_duration(check_in_raw, check_out_raw),
                "status": r.get("status") or "Completed",
                "visit_date": str(r.get("visit_date")),
                "created_at": r.get("created_on"),
            }
            visits_by_officer.setdefault(emp_oid, []).append(v_obj)

        for r in gen_rows:
            emp_oid = r.get("employee_oid")
            if not emp_oid:
                continue

            site_id = r.get("site_id")
            site_name = r.get("site_name")
            if site_id and not site_name:
                s_row = db.execute(text("SELECT name FROM SITE WHERE oid = :oid LIMIT 1"), {"oid": site_id}).mappings().first()
                if s_row: site_name = s_row.get("name")

            check_in_raw = r.get("check-in_time") or r.get("start_time")
            check_out_raw = r.get("check-out_time") or r.get("end_time")

            v_obj = {
                "id": f"gen_{r.get('oid')}",
                "report_oid": str(r.get("oid")),
                "officer_id": emp_oid,
                "site_id": site_id,
                "site": site_name or (f"Site #{site_id}" if site_id else "Unknown Site"),
                "site_name": site_name or (f"Site #{site_id}" if site_id else "Unknown Site"),
                "visit_type": "General Visit",
                "purpose": "General Visit",
                "check_in_raw": check_in_raw,
                "check_in": DashboardRepository._format_time(check_in_raw),
                "checkIn": DashboardRepository._format_time(check_in_raw),
                "check_out_raw": check_out_raw,
                "check_out": DashboardRepository._format_time(check_out_raw),
                "checkOut": DashboardRepository._format_time(check_out_raw),
                "duration": DashboardRepository._calculate_duration(check_in_raw, check_out_raw),
                "status": r.get("status") or "Completed",
                "visit_date": str(r.get("visit_date")),
                "created_at": r.get("created_on"),
            }
            visits_by_officer.setdefault(emp_oid, []).append(v_obj)

        # Sort each officer's visits by check-in time ASC and assign chronological sequence numbers
        for emp_oid, v_list in visits_by_officer.items():
            def _sort_key(x):
                dt1 = DashboardRepository._to_datetime(x.get("check_in_raw")) or datetime.max
                dt2 = DashboardRepository._to_datetime(x.get("created_at")) or datetime.max
                return (dt1, dt2, str(x.get("id", "")))

            v_list.sort(key=_sort_key)
            for idx, visit in enumerate(v_list, start=1):
                visit["sequence"] = idx

        # Get list of employee_oids who actually have valid submitted visits today
        valid_submitted_emp_oids = list(visits_by_officer.keys())

        if not valid_submitted_emp_oids:
            empty_kpi = {
                "present": att_present,
                "absent": att_absent,
                "plannedVisits": planned_visits_kpi,
                "completedVisitsToday": completed_visits_kpi,
                "plannedVisitsWeekly": planned_w,
                "completedVisitsWeekly": completed_w,
                "plannedVisitsMonthly": planned_m,
                "completedVisitsMonthly": completed_m,
            }
            return {
                "kpi": empty_kpi,
                "summary": empty_kpi,
                "officers": [],
                "visits": {},
                "target_date": target_date_str,
            }

        # ----------------------------------------------------------------------
        # 4. BATCH QUERY: Fetch Officers, Attendance & GPS ONLY for submitted officers
        # ----------------------------------------------------------------------
        officer_query = text("""
            SELECT 
                e.oid AS employee_oid,
                e.name AS officer,
                e.emp_code,
                ea.duty_date,
                ea.status AS attendance_status,
                ea.FIRST_TIME_LOG,
                ea.LAST_TIME_LOG,
                ecl.last_updated_on AS last_location_update
            FROM EMPLOYEE e
            LEFT JOIN EMPLOYEE_ATTENDANCE ea 
                ON ea.EMPLOYEE = e.oid AND ea.duty_date = :target_date
            LEFT JOIN EMPLOYEE_CURRENT_LOCATION ecl 
                ON ecl.OID = e.oid
            WHERE e.oid IN :emp_oids
            ORDER BY e.name ASC
        """)
        officer_rows = db.execute(
            officer_query,
            {"target_date": target_date, "emp_oids": tuple(valid_submitted_emp_oids)},
        ).mappings().all()

        # ----------------------------------------------------------------------
        # 5. ASSEMBLE OFFICER ROSTER & KPI COUNTS
        # ----------------------------------------------------------------------
        officers_list: List[Dict[str, Any]] = []
        present_count = 0
        absent_count = 0
        total_completed_visits = 0

        for o in officer_rows:
            emp_oid = o["employee_oid"]
            att_status_raw = o["attendance_status"]

            if not att_status_raw:
                att_status = "—"
            else:
                att_status = att_status_raw.lower().strip()
                if att_status in ("present", "late", "on_duty"):
                    present_count += 1
                elif att_status == "absent":
                    absent_count += 1

            officer_visits = visits_by_officer.get(emp_oid, [])
            completed_count = len(officer_visits)
            total_completed_visits += completed_count

            # Calculate work hours directly from Punch In (FIRST_TIME_LOG) & Punch Out (LAST_TIME_LOG)
            work_hours_str = DashboardRepository._calculate_duration(o["FIRST_TIME_LOG"], o["LAST_TIME_LOG"])

            # If punch attendance work_hours is unavailable, calculate from sum of submitted visit durations
            if work_hours_str == "—" and officer_visits:
                total_visit_seconds = 0
                for v in officer_visits:
                    in_val = v.get("check_in_raw") or v.get("check_in")
                    out_val = v.get("check_out_raw") or v.get("check_out")
                    if in_val and out_val and in_val != "—" and out_val != "—":
                        t_start = DashboardRepository._to_datetime(in_val)
                        t_end = DashboardRepository._to_datetime(out_val)
                        if t_start and t_end and t_end >= t_start:
                            total_visit_seconds += int((t_end - t_start).total_seconds())
                
                if total_visit_seconds > 0:
                    hrs = total_visit_seconds // 3600
                    mins = (total_visit_seconds % 3600) // 60
                    if hrs == 0:
                        work_hours_str = f"{mins} min" if mins > 0 else "< 1 min"
                    elif mins == 0:
                        work_hours_str = f"{hrs} hr"
                    else:
                        work_hours_str = f"{hrs} hr {mins} min"

            # Calculate GPS status
            track_status = DashboardRepository._calculate_gps_status(o["last_location_update"])

            # Formatted punch times
            punch_in = DashboardRepository._format_time(o["FIRST_TIME_LOG"])
            punch_out = DashboardRepository._format_time(o["LAST_TIME_LOG"])

            officers_list.append({
                "id": emp_oid,
                "employee_oid": emp_oid,
                "name": o["officer"],
                "officer": o["officer"],
                "empCode": o["emp_code"] or f"EMP{emp_oid:03d}",
                "emp_code": o["emp_code"] or f"EMP{emp_oid:03d}",
                "punchIn": punch_in,
                "punch_in": punch_in,
                "punchOut": punch_out,
                "punch_out": punch_out,
                "date": target_date_str,
                "status": att_status,
                "attendance_status": att_status,
                "trackStatus": track_status,
                "gps_status": track_status,
                "workHours": work_hours_str,
                "hours_worked": work_hours_str,
                "visits_done": completed_count,
                "visits": {
                    "completed": completed_count,
                    "pending": 0,
                    "missed": 0,
                },
                "visit_list": officer_visits,
            })

        kpi_summary = {
            "present": att_present,
            "absent": att_absent,
            "plannedVisits": planned_visits_kpi,
            "completedVisitsToday": completed_visits_kpi,
            "plannedVisitsWeekly": planned_w,
            "completedVisitsWeekly": completed_w,
            "plannedVisitsMonthly": planned_m,
            "completedVisitsMonthly": completed_m,
        }

        return {
            "kpi": kpi_summary,
            "summary": kpi_summary,
            "officers": officers_list,
            "visits": visits_by_officer,
            "target_date": target_date_str,
        }

    # ----------------------------------------------------------------------
    # Helper Functions
    # ----------------------------------------------------------------------
    @staticmethod
    def _calculate_period_kpis(
        db: Session, target_date: date, period: str = "weekly", branch_oid: Optional[int] = None
    ) -> Tuple[int, int]:
        """Calculate Planned Visits and Completed Visits for requested period (weekly: Mon-Sun, monthly: 1st-last day)."""
        import calendar
        
        period_clean = (period or "weekly").strip().lower()
        if period_clean == "monthly":
            start_d = date(target_date.year, target_date.month, 1)
            last_day = calendar.monthrange(target_date.year, target_date.month)[1]
            end_d = date(target_date.year, target_date.month, last_day)
        else:
            weekday = target_date.weekday()
            start_d = target_date - timedelta(days=weekday)
            end_d = start_d + timedelta(days=6)

        # 1. Completed Visits in period from direct source tables + metadata
        if branch_oid is not None:
            kpi_params = {"s": str(start_d), "e": str(end_d), "branch_oid": branch_oid}
            day_cnt = db.execute(text("""
                SELECT COUNT(*) 
                FROM FIELD_OFFICER_DAY_VISIT_REPORTS r
                JOIN EMPLOYEE e ON r.employee_oid = e.oid
                WHERE r.visit_date >= :s AND r.visit_date <= :e AND e.BRANCH = :branch_oid
            """), kpi_params).scalar() or 0
            night_cnt = db.execute(text("""
                SELECT COUNT(*) 
                FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS r
                JOIN EMPLOYEE e ON r.employee_oid = e.oid
                WHERE r.visit_date >= :s AND r.visit_date <= :e AND e.BRANCH = :branch_oid
            """), kpi_params).scalar() or 0
            gen_cnt = db.execute(text("""
                SELECT COUNT(*) 
                FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS r
                JOIN EMPLOYEE e ON r.employee_oid = e.oid
                WHERE r.visit_date >= :s AND r.visit_date <= :e AND e.BRANCH = :branch_oid
            """), kpi_params).scalar() or 0
            meta_cnt = db.execute(text("""
                SELECT COUNT(DISTINCT CONCAT(v.report_type, '_', v.report_oid)) 
                FROM VISIT_REPORT_METADATA v
                JOIN EMPLOYEE e ON v.employee_oid = e.oid
                WHERE v.visit_date >= :s AND v.visit_date <= :e AND e.BRANCH = :branch_oid
            """), kpi_params).scalar() or 0
        else:
            kpi_params = {"s": str(start_d), "e": str(end_d)}
            day_cnt = db.execute(text("SELECT COUNT(*) FROM FIELD_OFFICER_DAY_VISIT_REPORTS WHERE visit_date >= :s AND visit_date <= :e"), kpi_params).scalar() or 0
            night_cnt = db.execute(text("SELECT COUNT(*) FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS WHERE visit_date >= :s AND visit_date <= :e"), kpi_params).scalar() or 0
            gen_cnt = db.execute(text("SELECT COUNT(*) FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS WHERE visit_date >= :s AND visit_date <= :e"), kpi_params).scalar() or 0
            meta_cnt = db.execute(text("SELECT COUNT(DISTINCT CONCAT(report_type, '_', report_oid)) FROM VISIT_REPORT_METADATA WHERE visit_date >= :s AND visit_date <= :e"), kpi_params).scalar() or 0

        completed_visits_cnt = max(day_cnt + night_cnt + gen_cnt, meta_cnt)

        # 2. Planned Visits in period
        if branch_oid is not None:
            plans_query = text("""
                SELECT v.oid, v.planning_type, v.week_start_date, v.week_end_date, 
                       v.planning_month, v.planning_year, v.visit_date
                FROM FIELD_OFFICER_ASSIGNED_VISITS v
                JOIN EMPLOYEE e ON v.employee_oid = e.oid
                WHERE e.BRANCH = :branch_oid
            """)
            plans = db.execute(plans_query, {"branch_oid": branch_oid}).mappings().all()
        else:
            plans_query = text("""
                SELECT v.oid, v.planning_type, v.week_start_date, v.week_end_date, 
                       v.planning_month, v.planning_year, v.visit_date
                FROM FIELD_OFFICER_ASSIGNED_VISITS v
            """)
            plans = db.execute(plans_query).mappings().all()

        planned_visits_cnt = 0
        for p in plans:
            ptype = p["planning_type"]
            p_start = None
            p_end = None
            if ptype == "WEEKLY":
                p_start = p["week_start_date"]
                p_end = p["week_end_date"]
            elif ptype == "MONTHLY":
                if p["planning_month"] and p["planning_year"]:
                    p_start = date(p["planning_year"], p["planning_month"], 1)
                    last_day = calendar.monthrange(p["planning_year"], p["planning_month"])[1]
                    p_end = date(p["planning_year"], p["planning_month"], last_day)
            elif ptype == "SINGLE":
                p_start = p["visit_date"]
                p_end = p["visit_date"]

            if p_start and p_end and p_start <= end_d and p_end >= start_d:
                freq_sum = db.execute(text("""
                    SELECT COALESCE(SUM(visit_frequency), 0)
                    FROM FIELD_OFFICER_VISIT_FREQUENCY
                    WHERE plan_oid = :plan_oid
                """), {"plan_oid": p["oid"]}).scalar() or 0
                planned_visits_cnt += int(freq_sum)

        return planned_visits_cnt, int(completed_visits_cnt)
    @staticmethod
    def _calculate_gps_status(last_update: Optional[Union[datetime, str]]) -> str:
        if not last_update:
            return "—"
        if isinstance(last_update, str):
            try:
                last_update = datetime.fromisoformat(last_update)
            except ValueError:
                return "—"
        
        now = datetime.now()
        diff_minutes = (now - last_update).total_seconds() / 60.0
        if diff_minutes <= 10:
            return "online"
        elif diff_minutes <= 30:
            return "delayed"  # Displays as "Connectivity Issue"
        else:
            return "offline"

    @staticmethod
    def _format_time(val: Any) -> str:
        if val is None:
            return "—"
        if isinstance(val, (datetime, time)):
            return val.strftime("%H:%M")
        val_str = str(val).strip()
        if ":" in val_str:
            parts = val_str.split(":")
            if len(parts) >= 2:
                return f"{int(parts[0]):02d}:{int(parts[1]):02d}"
        return val_str or "—"

    @staticmethod
    def _format_date(val: Any) -> str:
        if val is None:
            return "—"
        if isinstance(val, (datetime, date)):
            return val.strftime("%d/%m/%Y")
        val_str = str(val).strip()
        if "-" in val_str and len(val_str) >= 10:
            try:
                dt = datetime.strptime(val_str[:10], "%Y-%m-%d")
                return dt.strftime("%d/%m/%Y")
            except ValueError:
                pass
        return val_str

    @staticmethod
    def _calculate_duration(start_val: Any, end_val: Any) -> str:
        if not start_val or start_val == "—":
            return "—"

        t_start = DashboardRepository._to_datetime(start_val)
        if not t_start:
            return "—"

        t_end = DashboardRepository._to_datetime(end_val) if (end_val and end_val != "—" and end_val != "Pending") else None

        if not t_end:
            now_dt = datetime.now()
            if t_start <= now_dt:
                t_end = now_dt
            else:
                return "—"

        if t_end < t_start:
            t_end = t_end + timedelta(days=1)

        diff_sec = int((t_end - t_start).total_seconds())
        if diff_sec <= 0:
            return "—"

        hrs = diff_sec // 3600
        mins = (diff_sec % 3600) // 60
        if hrs == 0:
            return f"{mins} min" if mins > 0 else "< 1 min"
        elif mins == 0:
            return f"{hrs} hr"
        else:
            return f"{hrs} hr {mins} min"

    @staticmethod
    def _calculate_work_hours(
        working_hours_num: Optional[Any], first_log: Any, last_log: Any
    ) -> str:
        if working_hours_num is not None:
            try:
                val = float(working_hours_num)
                if val > 0:
                    hrs = int(val)
                    mins = int(round((val - hrs) * 60))
                    if hrs == 0:
                        return f"{mins} min"
                    elif mins == 0:
                        return f"{hrs} hr"
                    else:
                        return f"{hrs} hr {mins} min"
            except (ValueError, TypeError):
                pass

        if first_log and last_log:
            dur = DashboardRepository._calculate_duration(first_log, last_log)
            if dur != "—":
                return dur

        return "—"

    @staticmethod
    def _to_datetime(val: Any) -> Optional[datetime]:
        if isinstance(val, datetime):
            return val
        if isinstance(val, time):
            dummy_date = date.today()
            return datetime.combine(dummy_date, val)
        if isinstance(val, str):
            for fmt in ("%Y-%m-%d %H:%M:%S", "%H:%M:%S", "%H:%M", "%Y-%m-%dT%H:%M:%S"):
                try:
                    dt = datetime.strptime(val.strip(), fmt)
                    if fmt in ("%H:%M:%S", "%H:%M"):
                        dt = datetime.combine(date.today(), dt.time())
                    return dt
                except ValueError:
                    continue
        return None


# Standalone alias
get_dashboard_data = DashboardRepository.get_dashboard_data
