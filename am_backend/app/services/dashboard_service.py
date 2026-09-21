from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
import logging

from app.repositories.dashboard_repository import DashboardRepository
from app.schemas.dashboard import (
    DashboardOfficer,
    DashboardResponse,
    DashboardSummary,
    DashboardVisit,
)

logger = logging.getLogger(__name__)


class DashboardService:
    """Service layer for managing Area Manager Dashboard operations."""

    _cache: Dict[str, Tuple[datetime, DashboardResponse]] = {}
    CACHE_TTL_SECONDS = 0  # Real-time updates as officers punch in

    @classmethod
    def get_dashboard_summary(
        cls,
        db: Session,
        target_date: Optional[date] = None,
        force_refresh: bool = False,
        period: str = "weekly",
        branch_oid: Optional[int] = None,
    ) -> DashboardResponse:
        """Fetch consolidated Dashboard data and format into DashboardResponse Pydantic model.

        Supports a 30-minute cache TTL per date, period, and branch scope.
        """
        period_clean = (period or "weekly").strip().lower()
        branch_key = str(branch_oid) if branch_oid is not None else "all"
        date_key = f"{(target_date or date.today()).isoformat()}_{period_clean}_b{branch_key}"
        now = datetime.now()

        # Return cached response if valid and force_refresh is not requested
        if not force_refresh and date_key in cls._cache:
            cache_time, cached_response = cls._cache[date_key]
            if (now - cache_time).total_seconds() < cls.CACHE_TTL_SECONDS:
                logger.info(f"Returning cached dashboard summary for {date_key}")
                return cached_response

        logger.info(f"Fetching fresh dashboard summary from DB for {date_key} (force_refresh={force_refresh}, period={period_clean}, branch_oid={branch_oid})")
        raw_data = DashboardRepository.get_dashboard_data(db, target_date, period=period_clean, branch_oid=branch_oid)

        raw_summary = raw_data.get("summary", {})
        raw_officers = raw_data.get("officers", [])

        # 1. Format Summary KPI
        summary = DashboardSummary(
            present=raw_summary.get("present", 0),
            absent=raw_summary.get("absent", 0),
            plannedVisits=raw_summary.get("plannedVisits", 0),
            completedVisitsToday=raw_summary.get("completedVisitsToday", 0),
            plannedVisitsWeekly=raw_summary.get("plannedVisitsWeekly", 0),
            completedVisitsWeekly=raw_summary.get("completedVisitsWeekly", 0),
            plannedVisitsMonthly=raw_summary.get("plannedVisitsMonthly", 0),
            completedVisitsMonthly=raw_summary.get("completedVisitsMonthly", 0),
        )

        # 2. Format Officers list
        officer_models: List[DashboardOfficer] = []
        for o in raw_officers:
            raw_visits = o.get("visit_list", [])
            visit_models: List[DashboardVisit] = []

            for v in raw_visits:
                visit_models.append(
                    DashboardVisit(
                        sequence=v.get("sequence", 1),
                        site_id=v.get("site_id"),
                        site_name=v.get("site_name") or v.get("site") or "Unknown Site",
                        visit_type=v.get("visit_type", "General Visit"),
                        check_in=v.get("check_in") or v.get("checkIn") or "—",
                        check_out=v.get("check_out") or v.get("checkOut") or "—",
                        duration=v.get("duration") or "—",
                        status=v.get("status") or "Completed",
                        visit_date=v.get("visit_date"),
                        report_oid=v.get("report_oid"),
                    )
                )

            # Ensure fields default to '—' when missing
            punch_in_val = o.get("punch_in") or o.get("punchIn") or "—"
            punch_out_val = o.get("punch_out") or o.get("punchOut") or "—"
            hours_worked_val = o.get("hours_worked") or o.get("workHours") or "—"
            gps_status_val = o.get("gps_status") or o.get("trackStatus") or "—"
            att_status_val = o.get("attendance_status") or o.get("status") or "—"

            officer_models.append(
                DashboardOfficer(
                    employee_oid=o["employee_oid"],
                    officer=o["officer"],
                    emp_code=o.get("emp_code") or "—",
                    punch_in=punch_in_val,
                    punch_out=punch_out_val,
                    attendance_status=att_status_val,
                    visits_done=o.get("visits_done", len(visit_models)),
                    hours_worked=hours_worked_val,
                    gps_status=gps_status_val,
                    visits=visit_models,
                )
            )

        response = DashboardResponse(
            summary=summary,
            officers=officer_models,
            target_date=raw_data.get("target_date"),
        )
        cls._cache[date_key] = (now, response)
        return response
