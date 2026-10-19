from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Set
from sqlalchemy.orm import Session
import logging

from app.core.exceptions import AppBaseException
from app.repositories.analytics_repository import AnalyticsRepository
from app.schemas.analytics import (
    AnalyticsKPIs,
    AnalyticsSummaryResponse,
    DailyTrendItem,
    OfficerAnalyticsDropdownItem,
    OfficerPerformanceItem,
    OfficerProfileSummary,
    OfficerVisitSessionItem,
    PlannedVsActualSiteAnalytics,
    SiteAnalyticsItem,
)

logger = logging.getLogger(__name__)


class AnalyticsService:
    """Service providing consolidated Field Officer and Visit analytics."""

    @staticmethod
    def get_officers_dropdown(
        db: Session,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        user_branch_oids: Optional[List[int]] = None,
    ) -> List[OfficerAnalyticsDropdownItem]:
        """Fetch list of active field officers with quick visit summary for dropdown selector."""
        kwargs = {}
        if area_manager_oid is not None:
            kwargs["area_manager_oid"] = area_manager_oid
        if user_branch_oids is not None:
            kwargs["user_branch_oids"] = user_branch_oids
        officers = AnalyticsRepository.get_field_officers(
            db, user_branch_oid=user_branch_oid, **kwargs
        )
        officer_oids = [o["employee_oid"] for o in officers]

        day_reports = AnalyticsRepository.get_day_reports(db, officer_oids=officer_oids)
        night_reports = AnalyticsRepository.get_night_reports(db, officer_oids=officer_oids)
        gen_reports = AnalyticsRepository.get_general_reports(db, officer_oids=officer_oids)
        attendance = AnalyticsRepository.get_attendance_punches(db, officer_oids=officer_oids)

        visit_counts: Dict[int, int] = defaultdict(int)
        for r in day_reports:
            visit_counts[r["employee_oid"]] += 1
        for r in night_reports:
            visit_counts[r["employee_oid"]] += 1
        for r in gen_reports:
            visit_counts[r["employee_oid"]] += 1

        result = []
        for o in officers:
            oid = o["employee_oid"]
            att = attendance.get(oid, {})
            total_v = visit_counts[oid]
            status = att.get("status", "off_duty")
            result.append(
                OfficerAnalyticsDropdownItem(
                    employee_oid=oid,
                    name=o["name"],
                    emp_code=o.get("emp_code"),
                    branch=o.get("branch_name"),
                    total_visits=total_v,
                    completion_rate=round(min(100.0, (total_v / max(1, 4)) * 100), 1),
                    status=status,
                )
            )
        return result

    @staticmethod
    def get_analytics_summary(
        db: Session,
        employee_oid: Optional[int] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
        period: str = "weekly",
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        user_branch_oids: Optional[List[int]] = None,
    ) -> AnalyticsSummaryResponse:
        """Compute full dynamic analytics payload for either Fleet overview or specific Officer drill-down."""
        kwargs = {}
        if area_manager_oid is not None:
            kwargs["area_manager_oid"] = area_manager_oid
        if user_branch_oids is not None:
            kwargs["user_branch_oids"] = user_branch_oids
        all_officers = AnalyticsRepository.get_field_officers(
            db, user_branch_oid=user_branch_oid, **kwargs
        )
        all_officer_oids = [o["employee_oid"] for o in all_officers]

        selected_officer_summary: Optional[OfficerProfileSummary] = None
        target_officer_oids = all_officer_oids

        if employee_oid is not None:
            from app.models.employee import Employee
            emp = db.query(Employee).filter(Employee.oid == employee_oid).first()
            if not emp:
                raise AppBaseException(
                    message=f"Officer with ID {employee_oid} not found.",
                    code="OFFICER_NOT_FOUND",
                    status_code=404,
                )
            if user_branch_oids is not None:
                is_allowed = (
                    (area_manager_oid is not None and emp.AREA_MANAGER_OID == area_manager_oid)
                    or (emp.BRANCH in user_branch_oids and (emp.AREA_MANAGER_OID is None or emp.AREA_MANAGER_OID == area_manager_oid))
                )
                if not is_allowed:
                    raise AppBaseException(
                        message=f"Access denied: Officer with ID {employee_oid} belongs to an unassigned branch.",
                        code="FORBIDDEN_BRANCH",
                        status_code=403,
                    )
            elif area_manager_oid is not None and emp.AREA_MANAGER_OID != area_manager_oid:
                raise AppBaseException(
                    message=f"Access denied: Officer with ID {employee_oid} is not assigned to this area manager.",
                    code="FORBIDDEN_OFFICER",
                    status_code=403,
                )
            elif area_manager_oid is None and user_branch_oid is not None and emp.BRANCH != user_branch_oid:
                raise AppBaseException(
                    message=f"Access denied: Officer with ID {employee_oid} belongs to another branch.",
                    code="FORBIDDEN_BRANCH",
                    status_code=403,
                )
            target_officer_oids = [employee_oid]

        # 1. Fetch raw datasets for target officers
        day_reports = AnalyticsRepository.get_day_reports(
            db, employee_oid=employee_oid, from_date=from_date, to_date=to_date, officer_oids=target_officer_oids
        )
        night_reports = AnalyticsRepository.get_night_reports(
            db, employee_oid=employee_oid, from_date=from_date, to_date=to_date, officer_oids=target_officer_oids
        )
        gen_reports = AnalyticsRepository.get_general_reports(
            db, employee_oid=employee_oid, from_date=from_date, to_date=to_date, officer_oids=target_officer_oids
        )
        site_sessions = AnalyticsRepository.get_site_sessions(
            db, employee_oid=employee_oid, from_date=from_date, to_date=to_date, officer_oids=target_officer_oids
        )
        plans = AnalyticsRepository.get_plans_and_frequencies(
            db, employee_oid=employee_oid, officer_oids=target_officer_oids
        )
        attendance = AnalyticsRepository.get_attendance_punches(
            db, officer_oids=target_officer_oids, from_date=from_date, to_date=to_date
        )

        # 2. Build Executive KPIs
        total_day = len(day_reports)
        total_night = len(night_reports)
        total_gen = len(gen_reports)
        total_reports_count = total_day + total_night + total_gen

        total_completed_visits = total_reports_count
        if total_completed_visits == 0 and len(site_sessions) > 0:
            total_completed_visits = len(site_sessions)

        # Planned visits calculation
        total_planned_visits = sum(p.get("visit_frequency", 0) for p in plans)
        if total_planned_visits == 0:
            total_planned_visits = max(total_completed_visits, len(target_officer_oids) * 4)

        total_missed_visits = max(0, total_planned_visits - total_completed_visits)
        total_pending_visits = max(0, total_planned_visits - total_completed_visits)
        completion_rate = (
            round((total_completed_visits / total_planned_visits) * 100.0, 1)
            if total_planned_visits > 0
            else (100.0 if total_completed_visits > 0 else 0.0)
        )

        # Distinct sites covered
        unique_sites: Set[str] = set()
        for r in day_reports + night_reports + gen_reports:
            if r.get("site_name"):
                unique_sites.add(r["site_name"])
            elif r.get("site_id"):
                unique_sites.add(f"Site #{r['site_id']}")
        for s in site_sessions:
            if s.get("site_name"):
                unique_sites.add(s["site_name"])
            elif s.get("site_id"):
                unique_sites.add(f"Site #{s['site_id']}")

        total_sites_covered = len(unique_sites)

        # Work hours & average duration calculations
        total_duration_minutes = 0.0
        duration_count = 0
        for s in site_sessions:
            if s.get("duration_minutes") is not None and s["duration_minutes"] > 0:
                total_duration_minutes += s["duration_minutes"]
                duration_count += 1

        avg_visit_duration = (
            round(total_duration_minutes / max(1, duration_count), 1)
            if duration_count > 0
            else (45.0 if total_completed_visits > 0 else 0.0)
        )

        total_attendance_minutes = sum(att.get("total_minutes", 0) for att in attendance.values())
        tot_h = int(total_attendance_minutes // 60)
        tot_m = int(total_attendance_minutes % 60)
        total_work_hours_str = f"{tot_h:02d}:{tot_m:02d}"

        active_count = len(target_officer_oids)
        on_duty_count = sum(1 for att in attendance.values() if att.get("status") == "on_duty")

        kpis = AnalyticsKPIs(
            total_planned_visits=total_planned_visits,
            total_completed_visits=total_completed_visits,
            total_missed_visits=total_missed_visits,
            total_pending_visits=total_pending_visits,
            completion_rate=completion_rate,
            total_reports=total_reports_count,
            day_reports=total_day,
            night_reports=total_night,
            general_reports=total_gen,
            total_sites_covered=total_sites_covered,
            total_work_hours=total_work_hours_str,
            avg_visit_duration_mins=avg_visit_duration,
            active_officers_count=active_count,
            on_duty_officers_count=on_duty_count,
            days_in_period=1,
        )

        # 3. Daily Trends (Grouped by visit_date)
        daily_map: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {
                "completed": 0,
                "day_reports": 0,
                "night_reports": 0,
                "gen_reports": 0,
                "planned": max(1, len(target_officer_oids) * 2),
            }
        )

        for r in day_reports:
            d_str = str(r.get("visit_date") or date.today())
            daily_map[d_str]["completed"] += 1
            daily_map[d_str]["day_reports"] += 1

        for r in night_reports:
            d_str = str(r.get("visit_date") or date.today())
            daily_map[d_str]["completed"] += 1
            daily_map[d_str]["night_reports"] += 1

        for r in gen_reports:
            d_str = str(r.get("visit_date") or date.today())
            daily_map[d_str]["completed"] += 1
            daily_map[d_str]["gen_reports"] += 1

        for s in site_sessions:
            if s.get("start_time"):
                d_str = (
                    s["start_time"].strftime("%Y-%m-%d")
                    if isinstance(s["start_time"], datetime)
                    else str(s["start_time"])[:10]
                )
                if d_str not in daily_map:
                    daily_map[d_str]["completed"] += 1

        sorted_dates = sorted(daily_map.keys())
        daily_trends: List[DailyTrendItem] = []
        for d_str in sorted_dates:
            try:
                dt = datetime.strptime(d_str, "%Y-%m-%d").date()
                day_name = dt.strftime("%a, %d %b")
            except Exception:
                day_name = d_str
            data = daily_map[d_str]
            c = data["completed"]
            p = max(c, data["planned"])
            m = max(0, p - c)
            rate = round((c / p) * 100.0, 1) if p > 0 else 100.0
            daily_trends.append(
                DailyTrendItem(
                    date=d_str,
                    day=day_name,
                    completed=c,
                    planned=p,
                    missed=m,
                    day_reports=data["day_reports"],
                    night_reports=data["night_reports"],
                    general_reports=data["gen_reports"],
                    completion_rate=rate,
                )
            )

        # 4. Top Sites Analytics
        site_agg: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {
                "site_id": None,
                "site_name": "",
                "visits_count": 0,
                "total_duration": 0.0,
                "day_count": 0,
                "night_count": 0,
                "gen_count": 0,
            }
        )

        for r in day_reports:
            s_name = r.get("site_name") or (f"Site #{r['site_id']}" if r.get("site_id") else "General Site")
            site_agg[s_name]["site_id"] = r.get("site_id")
            site_agg[s_name]["site_name"] = s_name
            site_agg[s_name]["visits_count"] += 1
            site_agg[s_name]["day_count"] += 1

        for r in night_reports:
            s_name = r.get("site_name") or (f"Site #{r['site_id']}" if r.get("site_id") else "General Site")
            site_agg[s_name]["site_id"] = r.get("site_id")
            site_agg[s_name]["site_name"] = s_name
            site_agg[s_name]["visits_count"] += 1
            site_agg[s_name]["night_count"] += 1

        for r in gen_reports:
            s_name = r.get("site_name") or (f"Site #{r['site_id']}" if r.get("site_id") else "General Site")
            site_agg[s_name]["site_id"] = r.get("site_id")
            site_agg[s_name]["site_name"] = s_name
            site_agg[s_name]["visits_count"] += 1
            site_agg[s_name]["gen_count"] += 1

        for s in site_sessions:
            s_name = s.get("site_name") or (f"Site #{s['site_id']}" if s.get("site_id") else "General Site")
            if s_name in site_agg:
                dur = s.get("duration_minutes") or 0.0
                site_agg[s_name]["total_duration"] += dur
            else:
                site_agg[s_name]["site_id"] = s.get("site_id")
                site_agg[s_name]["site_name"] = s_name
                site_agg[s_name]["visits_count"] += 1
                site_agg[s_name]["total_duration"] += s.get("duration_minutes") or 0.0

        top_sites: List[SiteAnalyticsItem] = []
        for s_name, s_data in sorted(site_agg.items(), key=lambda x: x[1]["visits_count"], reverse=True)[:10]:
            v_cnt = s_data["visits_count"]
            tot_dur = s_data["total_duration"]
            avg_dur = round(tot_dur / max(1, v_cnt), 1) if tot_dur > 0 else 45.0
            top_sites.append(
                SiteAnalyticsItem(
                    site_id=s_data["site_id"],
                    site_name=s_name,
                    visits_count=v_cnt,
                    total_duration_mins=tot_dur,
                    avg_duration_mins=avg_dur,
                    day_count=s_data["day_count"],
                    night_count=s_data["night_count"],
                    general_count=s_data["gen_count"],
                )
            )

        # 5. Officers Leaderboard Matrix
        officer_stats: Dict[int, Dict[str, Any]] = {}
        for o in all_officers:
            oid = o["employee_oid"]
            att = attendance.get(oid, {})
            officer_stats[oid] = {
                "employee_oid": oid,
                "name": o["name"],
                "emp_code": o.get("emp_code"),
                "branch": o.get("branch_name"),
                "visits_completed": 0,
                "visits_planned": 4,
                "day_reports": 0,
                "night_reports": 0,
                "gen_reports": 0,
                "sites": set(),
                "total_minutes": att.get("total_minutes", 0),
                "punch_in": att.get("punch_in"),
                "punch_out": att.get("punch_out"),
                "days_present": att.get("days_present", 0),
                "status": att.get("status", "off_duty"),
            }

        # Populate with reports
        for r in day_reports:
            oid = r["employee_oid"]
            if oid in officer_stats:
                officer_stats[oid]["visits_completed"] += 1
                officer_stats[oid]["day_reports"] += 1
                if r.get("site_name"):
                    officer_stats[oid]["sites"].add(r["site_name"])

        for r in night_reports:
            oid = r["employee_oid"]
            if oid in officer_stats:
                officer_stats[oid]["visits_completed"] += 1
                officer_stats[oid]["night_reports"] += 1
                if r.get("site_name"):
                    officer_stats[oid]["sites"].add(r["site_name"])

        for r in gen_reports:
            oid = r["employee_oid"]
            if oid in officer_stats:
                officer_stats[oid]["visits_completed"] += 1
                officer_stats[oid]["gen_reports"] += 1
                if r.get("site_name"):
                    officer_stats[oid]["sites"].add(r["site_name"])

        for s in site_sessions:
            oid = s.get("employee_oid")
            if oid and oid in officer_stats:
                if s.get("site_name"):
                    officer_stats[oid]["sites"].add(s["site_name"])

        officers_leaderboard: List[OfficerPerformanceItem] = []
        for oid, stat in officer_stats.items():
            vc = stat["visits_completed"]
            vp = max(vc, stat["visits_planned"])
            comp_rate = round((vc / vp) * 100.0, 1) if vp > 0 else 0.0
            tot_rep = stat["day_reports"] + stat["night_reports"] + stat["gen_reports"]
            mins = stat["total_minutes"]
            th = f"{int(mins // 60):02d}:{int(mins % 60):02d}"

            score = int(min(100, max(50, comp_rate * 0.7 + (min(tot_rep, 10) * 3))))

            if comp_rate >= 90:
                tier = "Top Performer"
                compliance_st = "Target Met"
            elif comp_rate >= 75:
                tier = "Good Compliance"
                compliance_st = "On Track"
            elif comp_rate >= 50:
                tier = "Average"
                compliance_st = "In Progress"
            else:
                tier = "Needs Follow-up"
                compliance_st = "Action Needed"

            officers_leaderboard.append(
                OfficerPerformanceItem(
                    employee_oid=oid,
                    name=stat["name"],
                    emp_code=stat["emp_code"],
                    branch=stat["branch"],
                    visits_completed=vc,
                    visits_planned=vp,
                    completion_rate=comp_rate,
                    day_reports=stat["day_reports"],
                    night_reports=stat["night_reports"],
                    general_reports=stat["gen_reports"],
                    total_reports=tot_rep,
                    sites_visited=len(stat["sites"]),
                    total_hours=th,
                    punch_in=stat["punch_in"],
                    punch_out=stat["punch_out"],
                    days_present=stat["days_present"],
                    status=stat["status"],
                    efficiency_score=score,
                    performance_tier=tier,
                    compliance_status=compliance_st,
                )
            )

        officers_leaderboard.sort(key=lambda x: (x.visits_completed, x.efficiency_score), reverse=True)

        # 6. Planned vs Actual Breakdown
        planned_vs_actual_sites: List[PlannedVsActualSiteAnalytics] = []
        seen_sites: Set[int] = set()
        for p in plans:
            s_oid = p.get("site_oid")
            if s_oid and s_oid not in seen_sites:
                seen_sites.add(s_oid)
                s_name = p.get("site_name") or f"Site #{s_oid}"
                freq = p.get("visit_frequency") or 1
                actual_c = site_agg.get(s_name, {}).get("visits_count", 0)
                crate = round((actual_c / max(1, freq)) * 100.0, 1)
                st = "COMPLETED" if actual_c >= freq else ("IN_PROGRESS" if actual_c > 0 else "PENDING")
                planned_vs_actual_sites.append(
                    PlannedVsActualSiteAnalytics(
                        site_oid=s_oid,
                        site_name=s_name,
                        planned_frequency=freq,
                        actual_visits=actual_c,
                        completion_rate=crate,
                        status=st,
                    )
                )

        # 7. Recent Visits Log
        recent_visits: List[OfficerVisitSessionItem] = []
        sess_id = 1
        for r in day_reports:
            recent_visits.append(
                OfficerVisitSessionItem(
                    session_id=sess_id,
                    site_id=r.get("site_id"),
                    site_name=r.get("site_name") or (f"Site #{r['site_id']}" if r.get("site_id") else "Site Inspection"),
                    visit_type="Day Visit",
                    check_in=r.get("start_time"),
                    check_out=r.get("end_time"),
                    duration_minutes=None,
                    status=r.get("status") or "COMPLETED",
                    visit_date=str(r.get("visit_date") or ""),
                    report_id=r.get("report_id"),
                )
            )
            sess_id += 1

        for r in night_reports:
            recent_visits.append(
                OfficerVisitSessionItem(
                    session_id=sess_id,
                    site_id=r.get("site_id"),
                    site_name=r.get("site_name") or (f"Site #{r['site_id']}" if r.get("site_id") else "Night Inspection"),
                    visit_type="Night Visit",
                    check_in=r.get("start_time"),
                    check_out=r.get("end_time"),
                    duration_minutes=None,
                    status=r.get("status") or "COMPLETED",
                    visit_date=str(r.get("visit_date") or ""),
                    report_id=r.get("report_id"),
                )
            )
            sess_id += 1

        for r in gen_reports:
            recent_visits.append(
                OfficerVisitSessionItem(
                    session_id=sess_id,
                    site_id=r.get("site_id"),
                    site_name=r.get("site_name") or (f"Site #{r['site_id']}" if r.get("site_id") else "General Visit"),
                    visit_type="General Visit",
                    check_in=r.get("start_time"),
                    check_out=r.get("end_time"),
                    duration_minutes=None,
                    status="COMPLETED",
                    visit_date=str(r.get("visit_date") or ""),
                    report_id=r.get("report_id"),
                )
            )
            sess_id += 1

        for s in site_sessions:
            recent_visits.append(
                OfficerVisitSessionItem(
                    session_id=sess_id,
                    site_id=s.get("site_id"),
                    site_name=s.get("site_name") or (f"Site #{s['site_id']}" if s.get("site_id") else "Site Session"),
                    visit_type="Site Session",
                    check_in=s["start_time"].strftime("%H:%M") if isinstance(s.get("start_time"), datetime) else str(s.get("start_time") or ""),
                    check_out=s["end_time"].strftime("%H:%M") if isinstance(s.get("end_time"), datetime) else (str(s.get("end_time")) if s.get("end_time") else None),
                    duration_minutes=s.get("duration_minutes"),
                    status=s.get("status") or "COMPLETED",
                    visit_date=str(s["start_time"])[:10] if s.get("start_time") else "",
                )
            )
            sess_id += 1

        recent_visits.sort(key=lambda x: x.visit_date, reverse=True)

        # 8. Single Officer Profile Summary
        if employee_oid is not None and len(target_officer_oids) == 1:
            emp_rec = AnalyticsRepository.get_officer_by_oid(db, employee_oid, user_branch_oid=user_branch_oid)
            if emp_rec:
                att_rec = attendance.get(employee_oid, {})
                score = 88
                tier_val = "Good Compliance"
                comp_st = "Target Met"
                for o_item in officers_leaderboard:
                    if o_item.employee_oid == employee_oid:
                        score = o_item.efficiency_score
                        tier_val = o_item.performance_tier
                        comp_st = o_item.compliance_status
                        break

                selected_officer_summary = OfficerProfileSummary(
                    employee_oid=employee_oid,
                    name=emp_rec["name"],
                    emp_code=emp_rec.get("emp_code"),
                    branch=emp_rec.get("branch_name"),
                    shift="General",
                    punch_in=att_rec.get("punch_in"),
                    punch_out=att_rec.get("punch_out"),
                    work_hours=att_rec.get("work_hours"),
                    days_present=att_rec.get("days_present", 0),
                    duty_status=att_rec.get("status", "off_duty"),
                    efficiency_score=score,
                    performance_tier=tier_val,
                    compliance_status=comp_st,
                )

        return AnalyticsSummaryResponse(
            mode="officer" if employee_oid is not None else "fleet",
            period=period,
            from_date=str(from_date) if from_date else None,
            to_date=str(to_date) if to_date else None,
            selected_officer=selected_officer_summary,
            kpis=kpis,
            daily_trends=daily_trends,
            top_sites=top_sites,
            officers_leaderboard=officers_leaderboard,
            planned_vs_actual_sites=planned_vs_actual_sites,
            recent_visits=recent_visits[:50],
        )
