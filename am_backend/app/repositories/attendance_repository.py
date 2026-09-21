from datetime import date, datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)


class AttendanceRepository:
    """Repository for querying Field Officer Attendance and Time Logs from raw DB source tables.
    
    Source Tables:
        EMPLOYEE (e)
        ATTENDANCE_ROW (ar.EMPLOYEE = e.oid)
        ATTENDANCE_CELL (ac.ATTENDANCE_ROW = ar.oid, ac.attendance_date)
        ATTENDANCE_TIME_LOG (atl.ATTENDANCE_CELL = ac.oid)
        
    Multiple Time Logs Handling:
        Aggregates MIN(atl.in_time) as earliest IN and MAX(atl.out_time) as latest OUT 
        grouped per employee to produce exactly one row per officer per date.
    """

    @staticmethod
    def get_attendance_list(
        db: Session, 
        target_date: Optional[date] = None, 
        status_filter: str = "ALL",
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        user_branch_oid: Optional[int] = None
    ) -> Dict[str, Any]:
        """Fetch Field Officer attendance list and summary counts for target_date or a date range [start_date, end_date], optionally scoped by user_branch_oid."""
        status_filter_upper = (status_filter or "ALL").strip().upper()

        if start_date and end_date:
            s_date = start_date
            e_date = end_date
        elif target_date:
            s_date = target_date
            e_date = target_date
        else:
            s_date = date.today()
            e_date = date.today()

        s_date_str = s_date.strftime("%Y-%m-%d")
        e_date_str = e_date.strftime("%Y-%m-%d")
        is_range = (s_date != e_date)

        branch_clause = " AND e.BRANCH = :user_branch_oid" if user_branch_oid is not None else ""

        if is_range:
            query = text(f"""
                SELECT 
                    e.oid AS employee_oid,
                    e.name AS employee_name,
                    e.emp_code AS emp_code,
                    ac.attendance_date AS attendance_date,
                    MIN(atl.in_time) AS min_in_time,
                    MAX(atl.out_time) AS max_out_time,
                    MAX(atl.in_time) AS latest_in_time,
                    COUNT(atl.oid) AS punch_count
                FROM EMPLOYEE e
                INNER JOIN DESIGNATION d ON e.DESIGNATION = d.oid
                LEFT JOIN ATTENDANCE_ROW ar ON ar.EMPLOYEE = e.oid
                LEFT JOIN ATTENDANCE_CELL ac ON ac.ATTENDANCE_ROW = ar.oid 
                    AND ac.attendance_date >= :start_date AND ac.attendance_date <= :end_date
                LEFT JOIN ATTENDANCE_TIME_LOG atl ON atl.ATTENDANCE_CELL = ac.oid
                LEFT JOIN EMPLOYEE_ATTENDANCE ea ON ea.EMPLOYEE = e.oid 
                    AND ea.duty_date >= :start_date AND ea.duty_date <= :end_date
                WHERE e.active = 1 
                  AND (d.oid = 19 
                       OR UPPER(d.name_full) = 'FIELD OFFICER' 
                       OR UPPER(d.name) LIKE '%FIELD%OFFICER%')
                  {branch_clause}
                GROUP BY e.oid, e.name, e.emp_code, ac.attendance_date
                ORDER BY ac.attendance_date DESC, e.name ASC
            """)
            params = {"start_date": s_date_str, "end_date": e_date_str}
        else:
            query = text(f"""
                SELECT 
                    e.oid AS employee_oid,
                    e.name AS employee_name,
                    e.emp_code AS emp_code,
                    MIN(atl.in_time) AS min_in_time,
                    MAX(atl.out_time) AS max_out_time,
                    MAX(atl.in_time) AS latest_in_time,
                    COUNT(atl.oid) AS punch_count
                FROM EMPLOYEE e
                INNER JOIN DESIGNATION d ON e.DESIGNATION = d.oid
                LEFT JOIN ATTENDANCE_ROW ar ON ar.EMPLOYEE = e.oid
                LEFT JOIN ATTENDANCE_CELL ac ON ac.ATTENDANCE_ROW = ar.oid AND ac.attendance_date = :target_date
                LEFT JOIN ATTENDANCE_TIME_LOG atl ON atl.ATTENDANCE_CELL = ac.oid
                LEFT JOIN EMPLOYEE_ATTENDANCE ea ON ea.EMPLOYEE = e.oid AND ea.duty_date = :target_date
                WHERE e.active = 1 
                  AND (d.oid = 19 
                       OR UPPER(d.name_full) = 'FIELD OFFICER' 
                       OR UPPER(d.name) LIKE '%FIELD%OFFICER%')
                  {branch_clause}
                GROUP BY e.oid, e.name, e.emp_code
                ORDER BY e.name ASC
            """)
            params = {"target_date": s_date_str}

        if user_branch_oid is not None:
            params["user_branch_oid"] = user_branch_oid

        rows = db.execute(query, params).mappings().all()

        all_records: List[Dict[str, Any]] = []
        present_count = 0
        absent_count = 0
        missed_punch_count = 0
        today_date = date.today()
        today_str = today_date.strftime("%Y-%m-%d")
        now = datetime.now()

        def parse_time_dt(val: Any, base_d: Optional[date] = None) -> Optional[datetime]:
            if val is None:
                return None
            if isinstance(val, datetime):
                return val
            if isinstance(val, date):
                return datetime.combine(val, datetime.min.time())
            s = str(val).strip()
            if not s or s == "None":
                return None
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M"):
                try:
                    return datetime.strptime(s, fmt)
                except ValueError:
                    pass
            for fmt in ("%H:%M:%S", "%H:%M"):
                try:
                    t = datetime.strptime(s, fmt).time()
                    if base_d:
                        return datetime.combine(base_d, t)
                    return datetime.combine(today_date, t)
                except ValueError:
                    pass
            if " " in s:
                time_part = s.split(" ")[1]
                for fmt in ("%H:%M:%S", "%H:%M"):
                    try:
                        t = datetime.strptime(time_part[:len(fmt)], fmt).time()
                        if base_d:
                            return datetime.combine(base_d, t)
                        return datetime.combine(today_date, t)
                    except ValueError:
                        pass
            return None

        for r in rows:
            in_raw = r["min_in_time"]
            out_raw = r["max_out_time"]
            latest_in_raw = r.get("latest_in_time")
            punch_count = int(r.get("punch_count") or 0)

            r_att_date = r.get("attendance_date")
            rec_date: Optional[date] = None
            if r_att_date:
                if isinstance(r_att_date, datetime):
                    rec_date = r_att_date.date()
                elif isinstance(r_att_date, date):
                    rec_date = r_att_date
                rec_date_str = rec_date.strftime("%Y-%m-%d") if rec_date else str(r_att_date)
            else:
                rec_date = s_date if not is_range else None
                rec_date_str = None if is_range else s_date_str

            in_dt = parse_time_dt(in_raw, rec_date)
            out_dt = parse_time_dt(out_raw, rec_date)
            latest_in_dt = parse_time_dt(latest_in_raw, rec_date) or in_dt

            # Fallback if in_dt is None but punch_count > 0 or in_raw had data
            is_missed_punch = False
            in_buffer = False
            buffer_remaining_seconds = 0

            if in_dt is not None:
                p_in = in_dt.strftime("%H:%M")
                
                # Check if currently punched out or still in an open shift
                is_punched_out = (out_dt is not None) and (latest_in_dt is None or out_dt >= latest_in_dt)

                if is_punched_out and out_dt is not None:
                    # Completed shift / currently punched out
                    p_out = out_dt.strftime("%H:%M")
                    diff_seconds = max(0, int((out_dt - in_dt).total_seconds()))
                    hours = diff_seconds // 3600
                    minutes = (diff_seconds % 3600) // 60
                    wh = f"{hours:02d}:{minutes:02d}"
                    st = "PRESENT"
                    present_count += 1

                    # 10-Minute Cooldown Buffer check (if officer has punch attempt remaining)
                    if punch_count < 2:
                        sec_since_out = (now - out_dt).total_seconds()
                        if 0 <= sec_since_out < 600 and (rec_date_str == today_str or (target_date and target_date == today_date)):
                            in_buffer = True
                            buffer_remaining_seconds = int(600 - sec_since_out)
                else:
                    # Open shift: officer has punched in but not punched out yet
                    # Check 16 hours rule from punch-in
                    ref_in_dt = latest_in_dt or in_dt
                    elapsed_seconds = max(0, int((now - ref_in_dt).total_seconds()))
                    
                    # If attendance date is in the past (not today), or elapsed time >= 16 hours:
                    # officer forgot to punch out and is registered as MISSED PUNCH
                    is_past_date = rec_date is not None and rec_date < today_date
                    if elapsed_seconds >= (16 * 3600) or is_past_date:
                        st = "MISSED_PUNCH"
                        is_missed_punch = True
                        missed_punch_count += 1
                        p_out = "Missed"
                        # Cap working hours at 16:00
                        wh = "16:00"
                    else:
                        st = "PRESENT"
                        present_count += 1
                        p_out = None
                        hours = elapsed_seconds // 3600
                        minutes = (elapsed_seconds % 3600) // 60
                        wh = f"{hours:02d}:{minutes:02d}"
            else:
                st = "ABSENT"
                absent_count += 1
                p_in = None
                p_out = None
                wh = "00:00"
                punch_count = 0

            # 2 Attempts tracking per 16 hours / duty cycle
            punch_in_attempts = min(punch_count, 2)
            attempts_exhausted = (punch_in_attempts >= 2)

            all_records.append({
                "employee_oid": r["employee_oid"],
                "employee_name": r["employee_name"],
                "emp_code": r["emp_code"],
                "attendance_date": rec_date_str,
                "punch_in": p_in,
                "punch_out": p_out,
                "working_hours": wh,
                "status": st,
                "punch_in_attempts": punch_in_attempts,
                "max_attempts": 2,
                "attempts_exhausted": attempts_exhausted,
                "is_missed_punch": is_missed_punch,
                "in_buffer": in_buffer,
                "buffer_remaining_seconds": buffer_remaining_seconds,
            })

        total_officers = len(all_records)
        summary = {
            "present": present_count,
            "absent": absent_count,
            "missed_punch": missed_punch_count,
            "total_officers": total_officers
        }

        # Filter records according to requested status
        if status_filter_upper == "PRESENT":
            filtered_records = [rec for rec in all_records if rec["status"] == "PRESENT"]
        elif status_filter_upper == "ABSENT":
            filtered_records = [rec for rec in all_records if rec["status"] == "ABSENT"]
        elif status_filter_upper == "MISSED_PUNCH":
            filtered_records = [rec for rec in all_records if rec["status"] == "MISSED_PUNCH"]
        else:
            filtered_records = all_records

        return {
            "summary": summary,
            "records": filtered_records
        }
