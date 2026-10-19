from datetime import date, datetime, time
from typing import Any, Dict, List, Optional, Union
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.models.employee import Employee
from app.models.visit_report_metadata import VisitReportMetadata


class ReportRepository:
    """Repository for managing report data access across VISIT_REPORT_METADATA,

    EMPLOYEE, SITE, and FIELD_OFFICER_* source tables.
    """

    def __init__(self, db: Optional[Session] = None):
        self.db = db

    @staticmethod
    def get_officers(
        db: Session,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        user_branch_oids: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        """1. Get available officers for the Area Manager Reports page officer selector.

        Query the uppercase EMPLOYEE table as the authoritative employee source, optionally scoped by area_manager_oid or user_branch_oid.
        """
        if user_branch_oids is not None and len(user_branch_oids) == 0:
            return []

        conditions = ["active = 1", "DESIGNATION = 19"]
        params: Dict[str, Any] = {}

        if user_branch_oids:
            b_list = ",".join(str(int(b)) for b in user_branch_oids)
            if area_manager_oid is not None:
                conditions.append(f"(BRANCH IN ({b_list}) AND (AREA_MANAGER_OID IS NULL OR AREA_MANAGER_OID = :area_manager_oid))")
                params["area_manager_oid"] = area_manager_oid
            else:
                conditions.append(f"BRANCH IN ({b_list})")
        elif area_manager_oid is not None:
            conditions.append("AREA_MANAGER_OID = :area_manager_oid")
            params["area_manager_oid"] = area_manager_oid
        elif user_branch_oid is not None:
            conditions.append("BRANCH = :user_branch_oid")
            params["user_branch_oid"] = user_branch_oid

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""

        query = text(f"""
            SELECT oid AS employee_oid, name AS officer, emp_code, COMPANY AS company_id
            FROM EMPLOYEE
            {where_clause}
            ORDER BY name ASC
        """)
        result = db.execute(query, params)
        return [dict(row) for row in result.mappings()]

    @staticmethod
    def _to_datetime(val: Any) -> Optional[datetime]:
        if isinstance(val, datetime):
            return val
        if isinstance(val, time):
            return datetime.combine(date.today(), val)
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

    @staticmethod
    def _get_duration_seconds(start_val: Any, end_val: Any) -> int:
        if not start_val or not end_val:
            return 0
        t_start = ReportRepository._to_datetime(start_val)
        t_end = ReportRepository._to_datetime(end_val)
        if t_start and t_end and t_end >= t_start:
            return int((t_end - t_start).total_seconds())
        return 0

    @staticmethod
    def _calculate_duration(start_val: Any, end_val: Any) -> str:
        if not start_val or start_val == "—":
            return "—"

        t_start = ReportRepository._to_datetime(start_val)
        if not t_start:
            return "—"

        t_end = ReportRepository._to_datetime(end_val) if (end_val and end_val != "—" and end_val != "Pending") else None

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
    def get_officers_with_reports(
        db: Session,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        user_branch_oids: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        """Get distinct officer daily activity rows grouped by (employee_oid, visit_date).

        Performs fast 24-hour daily clubbing for all submitted visit reports, optionally scoped by area_manager_oid or user_branch_oid.
        """
        if user_branch_oids:
            b_list = ",".join(str(int(b)) for b in user_branch_oids)
            if area_manager_oid is not None:
                scope_clause = f" WHERE (e.BRANCH IN ({b_list}) AND (e.AREA_MANAGER_OID IS NULL OR e.AREA_MANAGER_OID = :area_manager_oid))"
                params = {"area_manager_oid": area_manager_oid}
            else:
                scope_clause = f" WHERE e.BRANCH IN ({b_list})"
                params = {}
        elif area_manager_oid is not None:
            scope_clause = " WHERE e.AREA_MANAGER_OID = :area_manager_oid"
            params = {"area_manager_oid": area_manager_oid}
        elif user_branch_oid is not None:
            scope_clause = " WHERE e.BRANCH = :user_branch_oid"
            params = {"user_branch_oid": user_branch_oid}
        else:
            scope_clause = ""
            params = {}

        query = text(f"""
            SELECT 
                e.oid AS employee_oid,
                e.name AS officer,
                e.emp_code,
                e.COMPANY AS company_id,
                v.visit_date,
                COUNT(DISTINCT CONCAT(v.report_type, '_', v.report_oid)) AS total_reports,
                COUNT(DISTINCT v.site_id) AS total_sites,
                MIN(
                    COALESCE(
                        atl.in_time,
                        ea.FIRST_TIME_LOG
                    )
                ) AS punch_in_att,
                MAX(
                    COALESCE(
                        atl.out_time,
                        ea.LAST_TIME_LOG
                    )
                ) AS punch_out_att,
                e_loc.last_updated_on AS last_location_update
            FROM VISIT_REPORT_METADATA v
            INNER JOIN EMPLOYEE e ON v.employee_oid = e.oid
            LEFT JOIN ATTENDANCE_ROW ar ON ar.EMPLOYEE = e.oid
            LEFT JOIN ATTENDANCE_CELL ac ON ac.ATTENDANCE_ROW = ar.oid AND ac.attendance_date = v.visit_date
            LEFT JOIN ATTENDANCE_TIME_LOG atl ON atl.ATTENDANCE_CELL = ac.oid
            LEFT JOIN EMPLOYEE_ATTENDANCE ea ON ea.EMPLOYEE = e.oid AND ea.duty_date = v.visit_date
            LEFT JOIN EMPLOYEE_CURRENT_LOCATION e_loc ON e_loc.OID = e.oid
            {scope_clause}
            GROUP BY e.oid, e.name, e.emp_code, e.COMPANY, v.visit_date, e_loc.last_updated_on
            ORDER BY v.visit_date DESC, e.name ASC
        """)
        result = db.execute(query, params)
        rows = [dict(row) for row in result.mappings()]

        # Batch pre-fetch report timestamps for fallback
        all_meta = db.execute(
            text("SELECT employee_oid, visit_date, report_type, report_oid FROM VISIT_REPORT_METADATA")
        ).mappings().all()

        gen_oids = [m["report_oid"] for m in all_meta if str(m["report_type"]).upper().strip() == "GENERAL"]
        day_oids = [m["report_oid"] for m in all_meta if str(m["report_type"]).upper().strip() == "DAY"]
        night_oids = [m["report_oid"] for m in all_meta if str(m["report_type"]).upper().strip() == "NIGHT"]

        gen_map: Dict[Any, List[Any]] = {}
        sites_by_officer: Dict[Any, List[str]] = {}

        if gen_oids:
            g_rows = db.execute(
                text("SELECT * FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS WHERE oid IN :oids"),
                {"oids": tuple(gen_oids)}
            ).mappings().all()
            for g in g_rows:
                key = (g["employee_oid"], g["visit_date"])
                c_in = g.get("check-in_time") or g.get("check_in_time") or g.get("start_time")
                c_out = g.get("check-out_time") or g.get("check_out_time") or g.get("end_time")
                gen_map.setdefault(key, []).append((c_in, c_out))
                s_name = (g.get("site_name") or g.get("unit") or "").strip()
                if s_name and s_name not in sites_by_officer.setdefault(key, []):
                    sites_by_officer[key].append(s_name)

        day_map: Dict[Any, List[Any]] = {}
        if day_oids:
            d_rows = db.execute(
                text("SELECT * FROM FIELD_OFFICER_DAY_VISIT_REPORTS WHERE oid IN :oids"),
                {"oids": tuple(day_oids)}
            ).mappings().all()
            for d in d_rows:
                key = (d["employee_oid"], d["visit_date"])
                c_in = d.get("check-in_time") or d.get("check_in_time") or d.get("start_time")
                c_out = d.get("check-out_time") or d.get("check_out_time") or d.get("end_time")
                day_map.setdefault(key, []).append((c_in, c_out))
                s_name = (d.get("site_name") or d.get("unit") or "").strip()
                if s_name and s_name not in sites_by_officer.setdefault(key, []):
                    sites_by_officer[key].append(s_name)

        night_map: Dict[Any, List[Any]] = {}
        if night_oids:
            n_rows = db.execute(
                text("SELECT * FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS WHERE oid IN :oids"),
                {"oids": tuple(night_oids)}
            ).mappings().all()
            for n in n_rows:
                key = (n["employee_oid"], n["visit_date"])
                c_in = n.get("check-in_time") or n.get("check_in_time") or n.get("start_time")
                c_out = n.get("check-out_time") or n.get("check_out_time") or n.get("end_time")
                night_map.setdefault(key, []).append((c_in, c_out))
                s_name = (n.get("site_name") or n.get("unit") or "").strip()
                if s_name and s_name not in sites_by_officer.setdefault(key, []):
                    sites_by_officer[key].append(s_name)

        # Batch pre-fetch site names from SITE table per (employee_oid, visit_date)
        site_query_rows = db.execute(
            text("""
                SELECT DISTINCT v.employee_oid, v.visit_date, s.name AS site_name
                FROM VISIT_REPORT_METADATA v
                INNER JOIN SITE s ON v.site_id = s.oid
                WHERE s.name IS NOT NULL AND s.name != ''
            """)
        ).mappings().all()
        for sr in site_query_rows:
            key = (sr["employee_oid"], sr["visit_date"])
            s_name = (sr["site_name"] or "").strip()
            if s_name and s_name not in sites_by_officer.setdefault(key, []):
                sites_by_officer[key].append(s_name)

        now_dt = datetime.now()

        for r in rows:
            emp_oid = r["employee_oid"]
            v_date = r["visit_date"]

            p_in = r.get("punch_in_att")
            p_out = r.get("punch_out_att")

            # Fallback to report start_time/end_time if attendance log is empty
            key = (emp_oid, v_date)
            start_times: List[datetime] = []
            end_times: List[datetime] = []

            for times_list in (gen_map.get(key, []), day_map.get(key, []), night_map.get(key, [])):
                for c_in, c_out in times_list:
                    if c_in:
                        dt_in = ReportRepository._to_datetime(c_in)
                        if dt_in: start_times.append(dt_in)
                    if c_out:
                        dt_out = ReportRepository._to_datetime(c_out)
                        if dt_out: end_times.append(dt_out)

            if not p_in and start_times:
                p_in = min(start_times)
            if not p_out and end_times:
                p_out = max(end_times)

            # Format punch in / out strings HH:MM
            if isinstance(p_in, datetime):
                fmt_in = p_in.strftime("%H:%M")
            elif isinstance(p_in, time):
                fmt_in = p_in.strftime("%H:%M")
            elif isinstance(p_in, str):
                fmt_in = p_in.split(" ")[-1][:5] if " " in p_in else p_in[:5]
            else:
                fmt_in = "—"

            if isinstance(p_out, datetime):
                fmt_out = p_out.strftime("%H:%M")
            elif isinstance(p_out, time):
                fmt_out = p_out.strftime("%H:%M")
            elif isinstance(p_out, str):
                fmt_out = p_out.split(" ")[-1][:5] if " " in p_out else p_out[:5]
            else:
                fmt_out = "—"

            # Dynamic GPS status calculation
            loc_update = r.get("last_location_update")
            gps_status = "—"
            if loc_update:
                if isinstance(loc_update, str):
                    try:
                        loc_update = datetime.fromisoformat(loc_update)
                    except Exception:
                        loc_update = None
                if isinstance(loc_update, datetime):
                    diff_mins = (now_dt - loc_update).total_seconds() / 60.0
                    if diff_mins <= 15:
                        gps_status = "online"
                    elif diff_mins <= 60:
                        gps_status = "delayed"
                    else:
                        gps_status = "offline"

            # Dynamic Hours Worked calculation from Punch In / Punch Out
            hours_worked = "—"
            if fmt_in != "—":
                hours_worked = ReportRepository._calculate_duration(p_in or fmt_in, p_out or fmt_out)

            r["last_visit_date"] = str(v_date)
            r["punch_in"] = fmt_in
            r["punch_out"] = fmt_out
            r["hours_worked"] = hours_worked
            r["gps_status"] = gps_status
            r["sites"] = sites_by_officer.get((emp_oid, v_date), [])

        return rows

    @staticmethod
    def get_officer_attendance_for_report(
        db: Session,
        employee_oid: int,
        target_date: Optional[Union[date, str]] = None,
        from_date: Optional[Union[date, str]] = None,
        to_date: Optional[Union[date, str]] = None,
    ) -> Dict[str, Any]:
        """Fetch punch in time, punch out time, and hours worked for an officer.

        Queries authoritative ATTENDANCE_TIME_LOG and EMPLOYEE_ATTENDANCE tables,
        with fallback to report start/end timestamps if attendance logs are absent.
        """
        # 1. Resolve effective target date if not provided
        if not target_date:
            if from_date:
                target_date = from_date
            else:
                meta_row = db.execute(
                    text("""
                        SELECT visit_date FROM VISIT_REPORT_METADATA 
                        WHERE employee_oid = :emp_oid 
                        ORDER BY visit_date DESC LIMIT 1
                    """),
                    {"emp_oid": employee_oid}
                ).mappings().first()
                if meta_row and meta_row.get("visit_date"):
                    target_date = meta_row["visit_date"]
                else:
                    target_date = date.today()

        target_date_str = str(target_date)

        # 2. Query attendance tables
        att_query = text("""
            SELECT 
                MIN(COALESCE(atl.in_time, ea.FIRST_TIME_LOG)) AS punch_in_att,
                MAX(COALESCE(atl.out_time, ea.LAST_TIME_LOG)) AS punch_out_att
            FROM EMPLOYEE e
            LEFT JOIN ATTENDANCE_ROW ar ON ar.EMPLOYEE = e.oid
            LEFT JOIN ATTENDANCE_CELL ac ON ac.ATTENDANCE_ROW = ar.oid AND ac.attendance_date = :v_date
            LEFT JOIN ATTENDANCE_TIME_LOG atl ON atl.ATTENDANCE_CELL = ac.oid
            LEFT JOIN EMPLOYEE_ATTENDANCE ea ON ea.EMPLOYEE = e.oid AND ea.duty_date = :v_date
            WHERE e.oid = :emp_oid
        """)
        att_row = db.execute(att_query, {"emp_oid": employee_oid, "v_date": target_date_str}).mappings().first()

        p_in_raw = att_row.get("punch_in_att") if att_row else None
        p_out_raw = att_row.get("punch_out_att") if att_row else None

        # 3. Fallback to report start_time/end_time on that date if attendance logs are empty
        if not p_in_raw or not p_out_raw:
            time_query = text("""
                SELECT check_in_time, check_out_time FROM (
                    SELECT `check-in_time` as check_in_time, `check-out_time` as check_out_time FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS WHERE employee_oid = :emp_oid AND visit_date = :target_date
                    UNION ALL
                    SELECT `check-in_time` as check_in_time, `check-out_time` as check_out_time FROM FIELD_OFFICER_DAY_VISIT_REPORTS WHERE employee_oid = :emp_oid AND visit_date = :target_date
                    UNION ALL
                    SELECT `check-in_time` as check_in_time, `check-out_time` as check_out_time FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS WHERE employee_oid = :emp_oid AND visit_date = :target_date
                ) t
            """)
            t_rows = db.execute(time_query, {"emp_oid": employee_oid, "target_date": target_date_str}).mappings().all()
            starts: List[datetime] = []
            ends: List[datetime] = []
            for tr in t_rows:
                s = tr.get("check_in_time") or tr.get("start_time")
                e = tr.get("check_out_time") or tr.get("end_time")
                dt_s = ReportRepository._to_datetime(s)
                dt_e = ReportRepository._to_datetime(e)
                if dt_s: starts.append(dt_s)
                if dt_e: ends.append(dt_e)
            if not p_in_raw and starts:
                p_in_raw = min(starts)
            if not p_out_raw and ends:
                p_out_raw = max(ends)

        dt_in = ReportRepository._to_datetime(p_in_raw)
        dt_out = ReportRepository._to_datetime(p_out_raw)

        # Format 12-hour AM/PM (e.g. "04:39 PM")
        fmt_in = dt_in.strftime("%I:%M %p") if dt_in else "—"
        fmt_out = dt_out.strftime("%I:%M %p") if dt_out else "—"

        hours_worked: Optional[float] = None
        if dt_in:
            end_for_calc = dt_out or datetime.now()
            diff_sec = (end_for_calc - dt_in).total_seconds()
            if diff_sec > 0:
                hours_worked = round(diff_sec / 3600.0, 1)

        return {
            "target_date": target_date_str,
            "punch_in": fmt_in,
            "punch_out": fmt_out,
            "hours_worked": hours_worked,
        }

    @staticmethod
    def get_metadata_by_employee(
        db: Session, employee_oid: int
    ) -> List[VisitReportMetadata]:
        """2. Get VISIT_REPORT_METADATA records for an employee.

        Sorted by visit_date DESC, created_at DESC (latest report first).
        """
        return (
            db.query(VisitReportMetadata)
            .filter(VisitReportMetadata.employee_oid == employee_oid)
            .order_by(
                VisitReportMetadata.visit_date.desc(),
                VisitReportMetadata.created_at.desc(),
            )
            .all()
        )

    @staticmethod
    def get_metadata_by_employee_and_date_range(
        db: Session, employee_oid: int, from_date: date, to_date: date
    ) -> List[VisitReportMetadata]:
        """3. Get VISIT_REPORT_METADATA records for an employee within date range.

        Sorted by visit_date DESC, created_at DESC (latest report first).
        """
        return (
            db.query(VisitReportMetadata)
            .filter(
                VisitReportMetadata.employee_oid == employee_oid,
                VisitReportMetadata.visit_date >= from_date,
                VisitReportMetadata.visit_date <= to_date,
            )
            .order_by(
                VisitReportMetadata.visit_date.desc(),
                VisitReportMetadata.created_at.desc(),
            )
            .all()
        )

    @staticmethod
    def get_metadata_by_employee_and_type(
        db: Session, employee_oid: int, report_type: Optional[str] = None
    ) -> List[VisitReportMetadata]:
        """4. Get metadata for an employee and optional report type (GENERAL, DAY, NIGHT).

        Sorted by visit_date ASC, created_at ASC.
        """
        query = db.query(VisitReportMetadata).filter(
            VisitReportMetadata.employee_oid == employee_oid
        )
        if report_type:
            query = query.filter(
                VisitReportMetadata.report_type == report_type.upper()
            )
        return query.order_by(
            VisitReportMetadata.visit_date.asc(),
            VisitReportMetadata.created_at.asc(),
        ).all()

    @staticmethod
    def get_general_report(
        db: Session, employee_oid: int, report_oid: Union[int, str]
    ) -> Optional[Dict[str, Any]]:
        """5. Get the source General report from FIELD_OFFICER_GENERAL_VISIT_REPORTS."""
        query = text("""
            SELECT *
            FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS
            WHERE employee_oid = :employee_oid
              AND oid = :report_oid
            LIMIT 1
        """)
        result = db.execute(
            query,
            {
                "employee_oid": employee_oid,
                "report_oid": report_oid,
            },
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    def get_day_report(
        db: Session, employee_oid: int, report_oid: Union[int, str]
    ) -> Optional[Dict[str, Any]]:
        """6. Get the source Day report from FIELD_OFFICER_DAY_VISIT_REPORTS."""
        query = text("""
            SELECT *
            FROM FIELD_OFFICER_DAY_VISIT_REPORTS
            WHERE employee_oid = :employee_oid
              AND oid = :report_oid
            LIMIT 1
        """)
        result = db.execute(
            query,
            {
                "employee_oid": employee_oid,
                "report_oid": report_oid,
            },
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    def get_night_report(
        db: Session, employee_oid: int, report_oid: Union[int, str]
    ) -> Optional[Dict[str, Any]]:
        """7. Get the source Night report from FIELD_OFFICER_NIGHT_VISIT_REPORTS."""
        query = text("""
            SELECT *
            FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS
            WHERE employee_oid = :employee_oid
              AND oid = :report_oid
            LIMIT 1
        """)
        result = db.execute(
            query,
            {
                "employee_oid": employee_oid,
                "report_oid": report_oid,
            },
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    def get_site(db: Session, site_id: int) -> Optional[Dict[str, Any]]:
        """8. Get site information from the uppercase SITE table and join CLIENTT for client_name."""
        query = text("""
            SELECT s.*, c.name AS client_name
            FROM SITE s
            LEFT JOIN CLIENTT c ON c.oid = s.CLIENTT
            WHERE s.oid = :site_id
            LIMIT 1
        """)
        result = db.execute(query, {"site_id": site_id})
        row = result.mappings().first()
        return dict(row) if row else None


# Standalone function aliases matching requested operation names
get_officers = ReportRepository.get_officers
get_metadata_by_employee = ReportRepository.get_metadata_by_employee
get_metadata_by_employee_and_date_range = ReportRepository.get_metadata_by_employee_and_date_range
get_metadata_by_employee_and_type = ReportRepository.get_metadata_by_employee_and_type
get_general_report = ReportRepository.get_general_report
get_day_report = ReportRepository.get_day_report
get_night_report = ReportRepository.get_night_report
get_site = ReportRepository.get_site
