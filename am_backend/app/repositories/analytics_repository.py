from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Set
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging

from app.models.employee import Employee

logger = logging.getLogger(__name__)


class AnalyticsRepository:
    """Repository for querying raw inspection reports, site sessions, plans, and officer metrics."""

    @staticmethod
    def get_field_officers(
        db: Session,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        user_branch_oids: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve all active field officers, optionally filtered by area_manager_oid or user_branch_oid."""
        if user_branch_oids:
            b_list = ",".join(str(int(b)) for b in user_branch_oids)
            if area_manager_oid is not None:
                scope_clause = f" AND (e.BRANCH IN ({b_list}) AND (e.AREA_MANAGER_OID IS NULL OR e.AREA_MANAGER_OID = :area_manager_oid))"
                params: Dict[str, Any] = {"area_manager_oid": area_manager_oid}
            else:
                scope_clause = f" AND e.BRANCH IN ({b_list})"
                params = {}
        elif area_manager_oid is not None:
            scope_clause = " AND e.AREA_MANAGER_OID = :area_manager_oid"
            params: Dict[str, Any] = {"area_manager_oid": area_manager_oid}
        elif user_branch_oid is not None:
            scope_clause = " AND e.BRANCH = :branch_oid"
            params: Dict[str, Any] = {"branch_oid": user_branch_oid}
        else:
            scope_clause = ""
            params: Dict[str, Any] = {}

        query = text(f"""
            SELECT 
                e.oid AS employee_oid,
                e.name,
                e.emp_code,
                e.BRANCH AS branch_oid,
                b.name AS branch_name,
                e.AREA_MANAGER_OID AS area_manager_oid,
                e.active
            FROM EMPLOYEE e
            LEFT JOIN BRANCH b ON b.oid = e.BRANCH
            WHERE e.active = 1 AND e.DESIGNATION = 19{scope_clause}
            ORDER BY e.name ASC
        """)
        rows = db.execute(query, params).mappings().all()
        return [dict(r) for r in rows]

    @staticmethod
    def get_officer_by_oid(
        db: Session,
        employee_oid: int,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        user_branch_oids: Optional[List[int]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Retrieve single field officer details."""
        if user_branch_oids is not None:
            b_list = ",".join(str(int(b)) for b in user_branch_oids)
            if area_manager_oid is not None:
                scope_clause = f" AND (e.BRANCH IN ({b_list}) AND (e.AREA_MANAGER_OID IS NULL OR e.AREA_MANAGER_OID = :area_manager_oid))"
                params: Dict[str, Any] = {"employee_oid": employee_oid, "area_manager_oid": area_manager_oid}
            else:
                scope_clause = f" AND e.BRANCH IN ({b_list})"
                params: Dict[str, Any] = {"employee_oid": employee_oid}
        elif area_manager_oid is not None:
            scope_clause = " AND e.AREA_MANAGER_OID = :area_manager_oid"
            params: Dict[str, Any] = {"employee_oid": employee_oid, "area_manager_oid": area_manager_oid}
        elif user_branch_oid is not None:
            scope_clause = " AND e.BRANCH = :branch_oid"
            params: Dict[str, Any] = {"employee_oid": employee_oid, "branch_oid": user_branch_oid}
        else:
            scope_clause = ""
            params: Dict[str, Any] = {"employee_oid": employee_oid}

        query = text(f"""
            SELECT 
                e.oid AS employee_oid,
                e.name,
                e.emp_code,
                e.BRANCH AS branch_oid,
                b.name AS branch_name,
                e.AREA_MANAGER_OID AS area_manager_oid,
                e.active
            FROM EMPLOYEE e
            LEFT JOIN BRANCH b ON b.oid = e.BRANCH
            WHERE e.oid = :employee_oid{scope_clause}
            LIMIT 1
        """)
        row = db.execute(query, params).mappings().first()
        return dict(row) if row else None

    @staticmethod
    def get_day_reports(
        db: Session,
        employee_oid: Optional[int] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
        officer_oids: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch day visit reports with optional date range and officer filter."""
        clauses = []
        params: Dict[str, Any] = {}

        if employee_oid is not None:
            clauses.append("r.employee_oid = :employee_oid")
            params["employee_oid"] = employee_oid
        elif officer_oids:
            clauses.append("r.employee_oid IN :officer_oids")
            params["officer_oids"] = tuple(officer_oids)

        if from_date and to_date:
            clauses.append("(r.visit_date >= :from_date AND r.visit_date <= :to_date)")
            params["from_date"] = str(from_date)
            params["to_date"] = str(to_date)
        elif from_date:
            clauses.append("r.visit_date >= :from_date")
            params["from_date"] = str(from_date)
        elif to_date:
            clauses.append("r.visit_date <= :to_date")
            params["to_date"] = str(to_date)

        where_str = (" WHERE " + " AND ".join(clauses)) if clauses else ""

        query = text(f"""
            SELECT 
                r.oid,
                r.report_id,
                r.employee_oid,
                r.site_id,
                s.name AS site_name,
                c.name AS client_name,
                r.visit_date,
                r.`check-in_time` AS start_time,
                r.`check-out_time` AS end_time,
                r.created_on,
                r.status
            FROM FIELD_OFFICER_DAY_VISIT_REPORTS r
            LEFT JOIN SITE s ON s.oid = r.site_id
            LEFT JOIN CLIENTT c ON c.oid = r.client_id
            {where_str}
            ORDER BY r.visit_date DESC, r.created_on DESC
        """)
        try:
            rows = db.execute(query, params).mappings().all()
            return [dict(r) for r in rows]
        except Exception as e:
            logger.warning(f"Error fetching day reports: {e}")
            return []

    @staticmethod
    def get_night_reports(
        db: Session,
        employee_oid: Optional[int] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
        officer_oids: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch night visit reports with optional date range and officer filter."""
        clauses = []
        params: Dict[str, Any] = {}

        if employee_oid is not None:
            clauses.append("r.employee_oid = :employee_oid")
            params["employee_oid"] = employee_oid
        elif officer_oids:
            clauses.append("r.employee_oid IN :officer_oids")
            params["officer_oids"] = tuple(officer_oids)

        if from_date and to_date:
            clauses.append("(r.visit_date >= :from_date AND r.visit_date <= :to_date)")
            params["from_date"] = str(from_date)
            params["to_date"] = str(to_date)
        elif from_date:
            clauses.append("r.visit_date >= :from_date")
            params["from_date"] = str(from_date)
        elif to_date:
            clauses.append("r.visit_date <= :to_date")
            params["to_date"] = str(to_date)

        where_str = (" WHERE " + " AND ".join(clauses)) if clauses else ""

        query = text(f"""
            SELECT 
                r.oid,
                r.report_id,
                r.employee_oid,
                r.site_id,
                s.name AS site_name,
                c.name AS client_name,
                r.visit_date,
                r.`check-in_time` AS start_time,
                r.`check-out_time` AS end_time,
                r.created_on,
                r.status
            FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS r
            LEFT JOIN SITE s ON s.oid = r.site_id
            LEFT JOIN CLIENTT c ON c.oid = r.client_id
            {where_str}
            ORDER BY r.visit_date DESC, r.created_on DESC
        """)
        try:
            rows = db.execute(query, params).mappings().all()
            return [dict(r) for r in rows]
        except Exception as e:
            logger.warning(f"Error fetching night reports: {e}")
            return []

    @staticmethod
    def get_general_reports(
        db: Session,
        employee_oid: Optional[int] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
        officer_oids: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch general visit reports with optional date range and officer filter."""
        clauses = []
        params: Dict[str, Any] = {}

        if employee_oid is not None:
            clauses.append("r.employee_oid = :employee_oid")
            params["employee_oid"] = employee_oid
        elif officer_oids:
            clauses.append("r.employee_oid IN :officer_oids")
            params["officer_oids"] = tuple(officer_oids)

        if from_date and to_date:
            clauses.append("(r.visit_date >= :from_date AND r.visit_date <= :to_date)")
            params["from_date"] = str(from_date)
            params["to_date"] = str(to_date)
        elif from_date:
            clauses.append("r.visit_date >= :from_date")
            params["from_date"] = str(from_date)
        elif to_date:
            clauses.append("r.visit_date <= :to_date")
            params["to_date"] = str(to_date)

        where_str = (" WHERE " + " AND ".join(clauses)) if clauses else ""

        query = text(f"""
            SELECT 
                r.oid,
                r.report_id,
                r.employee_oid,
                r.site_id,
                COALESCE(r.site_name, s.name) AS site_name,
                COALESCE(r.client_name, c.name) AS client_name,
                r.visit_date,
                COALESCE(r.`check-in_time`, r.start_time) AS start_time,
                COALESCE(r.`check-out_time`, r.end_time) AS end_time,
                r.created_on
            FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS r
            LEFT JOIN SITE s ON s.oid = r.site_id
            LEFT JOIN CLIENTT c ON c.oid = r.client_id
            {where_str}
            ORDER BY r.visit_date DESC, r.created_on DESC
        """)
        try:
            rows = db.execute(query, params).mappings().all()
            return [dict(r) for r in rows]
        except Exception as e:
            logger.warning(f"Error fetching general reports: {e}")
            return []

    @staticmethod
    def get_site_sessions(
        db: Session,
        employee_oid: Optional[int] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
        officer_oids: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch SITE_VISIT_SESSIONS records."""
        clauses = []
        params: Dict[str, Any] = {}

        if employee_oid is not None:
            clauses.append("s.Employee = :employee_oid")
            params["employee_oid"] = employee_oid
        elif officer_oids:
            clauses.append("s.Employee IN :officer_oids")
            params["officer_oids"] = tuple(officer_oids)

        if from_date and to_date:
            clauses.append("(DATE(s.check_in_time) >= :from_date AND DATE(s.check_in_time) <= :to_date)")
            params["from_date"] = str(from_date)
            params["to_date"] = str(to_date)
        elif from_date:
            clauses.append("DATE(s.check_in_time) >= :from_date")
            params["from_date"] = str(from_date)
        elif to_date:
            clauses.append("DATE(s.check_in_time) <= :to_date")
            params["to_date"] = str(to_date)

        where_str = (" WHERE " + " AND ".join(clauses)) if clauses else ""

        query = text(f"""
            SELECT 
                s.oid,
                s.Employee AS employee_oid,
                s.site_id,
                COALESCE(s.site_name, st.name) AS site_name,
                s.check_in_time AS start_time,
                s.check_out_time AS end_time,
                s.duration_minutes,
                s.status,
                s.raw_points_count
            FROM SITE_VISIT_SESSIONS s
            LEFT JOIN SITE st ON st.oid = s.site_id
            {where_str}
            ORDER BY s.check_in_time DESC
        """)
        try:
            rows = db.execute(query, params).mappings().all()
            return [dict(r) for r in rows]
        except Exception as e:
            logger.warning(f"Error fetching site visit sessions: {e}")
            return []

    @staticmethod
    def get_plans_and_frequencies(
        db: Session,
        employee_oid: Optional[int] = None,
        officer_oids: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch configured planned visits and frequencies."""
        clauses = []
        params: Dict[str, Any] = {}

        if employee_oid is not None:
            clauses.append("p.employee_oid = :employee_oid")
            params["employee_oid"] = employee_oid
        elif officer_oids:
            clauses.append("p.employee_oid IN :officer_oids")
            params["officer_oids"] = tuple(officer_oids)

        where_str = (" WHERE " + " AND ".join(clauses)) if clauses else ""

        query = text(f"""
            SELECT 
                p.oid AS plan_oid,
                p.employee_oid,
                p.planning_type,
                p.status AS plan_status,
                f.site_oid,
                s.name AS site_name,
                f.visit_frequency
            FROM FIELD_OFFICER_ASSIGNED_VISITS p
            JOIN FIELD_OFFICER_VISIT_FREQUENCY f ON f.plan_oid = p.oid
            LEFT JOIN SITE s ON s.oid = f.site_oid
            {where_str}
        """)
        try:
            rows = db.execute(query, params).mappings().all()
            return [dict(r) for r in rows]
        except Exception as e:
            logger.warning(f"Error fetching planned visit frequencies: {e}")
            return []

    @staticmethod
    def get_attendance_punches(
        db: Session,
        officer_oids: List[int],
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> Dict[int, Dict[str, Any]]:
        """Fetch punch_in, punch_out, worked minutes, and days present for officer_oids across date range or single day."""
        if not officer_oids:
            return {}

        now_time = datetime.now()
        params: Dict[str, Any] = {"officer_oids": tuple(officer_oids), "now_time": now_time}

        if from_date and to_date and from_date != to_date:
            date_filter = "ac.attendance_date >= :from_date AND ac.attendance_date <= :to_date"
            params["from_date"] = str(from_date)
            params["to_date"] = str(to_date)
        elif from_date:
            date_filter = "ac.attendance_date = :target_date"
            params["target_date"] = str(from_date)
        elif to_date:
            date_filter = "ac.attendance_date = :target_date"
            params["target_date"] = str(to_date)
        else:
            date_filter = "ac.attendance_date = :target_date"
            params["target_date"] = date.today().strftime("%Y-%m-%d")

        query = text(f"""
            SELECT 
                e.oid AS employee_oid,
                COUNT(DISTINCT CASE WHEN atl.in_time IS NOT NULL THEN ac.attendance_date END) AS days_present,
                MIN(atl.in_time) AS min_in_time,
                MAX(atl.out_time) AS max_out_time,
                SUM(
                    CASE 
                        WHEN atl.out_time IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, atl.in_time, atl.out_time)
                        WHEN atl.in_time IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, atl.in_time, :now_time)
                        ELSE 0 
                    END
                ) AS total_minutes
            FROM EMPLOYEE e
            LEFT JOIN ATTENDANCE_ROW ar ON ar.EMPLOYEE = e.oid
            LEFT JOIN ATTENDANCE_CELL ac ON ac.ATTENDANCE_ROW = ar.oid AND ({date_filter})
            LEFT JOIN ATTENDANCE_TIME_LOG atl ON atl.ATTENDANCE_CELL = ac.oid
            WHERE e.oid IN :officer_oids
            GROUP BY e.oid
        """)
        try:
            rows = db.execute(query, params).mappings().all()

            result: Dict[int, Dict[str, Any]] = {}
            for r in rows:
                emp_id = r.get("employee_oid")
                min_in = r.get("min_in_time")
                max_out = r.get("max_out_time")
                minutes = r.get("total_minutes") or 0
                days_pres = r.get("days_present") or 0

                status = "on_duty" if min_in is not None and max_out is None else ("off_duty" if min_in is not None else "absent")
                h = int(minutes // 60)
                m = int(minutes % 60)

                result[emp_id] = {
                    "punch_in": min_in.strftime("%H:%M") if isinstance(min_in, datetime) else (str(min_in) if min_in else None),
                    "punch_out": max_out.strftime("%H:%M") if isinstance(max_out, datetime) else (str(max_out) if max_out else None),
                    "work_hours": f"{h:02d}:{m:02d}",
                    "total_minutes": minutes,
                    "days_present": days_pres,
                    "status": status,
                }
            return result
        except Exception as e:
            logger.warning(f"Error fetching attendance logs: {e}")
            return {}
