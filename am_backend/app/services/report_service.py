import json
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional, Set, Union
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.exceptions import AppBaseException
from app.core.logging import logger
from app.models.visit_report_metadata import VisitReportMetadata
from app.models.assigned_visit import FieldOfficerAssignedVisits
from app.models.visit_frequency import FieldOfficerVisitFrequency
from app.repositories.report_repository import ReportRepository
from app.repositories.visit_repository import VisitRepository
from app.utils.dynamic_report_logo_resolver import resolve_report_company_and_logo
from app.schemas.reports import (
    CombinedReportResponse,
    DayReportResponse,
    GeneralReportResponse,
    NightReportResponse,
    OfficerListItem,
    OfficerSummary,
    PlanInfoSummary,
    ReportExecutiveSummary,
    SiteVisitSummary,
)


class ReportService:
    """Service layer for Area Manager Reports.

    Converts raw database records retrieved via ReportRepository into
    structured Pydantic schemas expected by the Area Manager frontend.
    """

    @staticmethod
    def get_officers(
        db: Session,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        user_branch_oids: Optional[List[int]] = None,
    ) -> List[OfficerListItem]:
        """Get available active officers for the Reports page officer selector, optionally scoped by area_manager_oid or user_branch_oid."""
        kwargs = {}
        if area_manager_oid is not None:
            kwargs["area_manager_oid"] = area_manager_oid
        if user_branch_oids is not None:
            kwargs["user_branch_oids"] = user_branch_oids
        raw_officers = ReportRepository.get_officers(
            db, user_branch_oid=user_branch_oid, **kwargs
        )
        officers: List[OfficerListItem] = []
        for o in raw_officers:
            officers.append(
                OfficerListItem(
                    employee_oid=o["employee_oid"],
                    officer=o["officer"],
                    emp_code=o.get("emp_code"),
                )
            )
        return officers

    @staticmethod
    def get_officers_with_reports(
        db: Session,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        user_branch_oids: Optional[List[int]] = None,
    ) -> List[OfficerListItem]:
        """Get distinct officers who have at least one report in VISIT_REPORT_METADATA, optionally scoped by area_manager_oid or user_branch_oid."""
        kwargs = {}
        if area_manager_oid is not None:
            kwargs["area_manager_oid"] = area_manager_oid
        if user_branch_oids is not None:
            kwargs["user_branch_oids"] = user_branch_oids
        raw_officers = ReportRepository.get_officers_with_reports(
            db, user_branch_oid=user_branch_oid, **kwargs
        )
        officers: List[OfficerListItem] = []
        for o in raw_officers:
            comp_info = resolve_report_company_and_logo({
                "company_id": o.get("company_id"),
                "officer": o.get("officer"),
            })
            officers.append(
                OfficerListItem(
                    employee_oid=o["employee_oid"],
                    officer=o["officer"],
                    emp_code=o.get("emp_code"),
                    last_visit_date=o.get("last_visit_date"),
                    total_reports=o.get("total_reports", 0),
                    total_sites=o.get("total_sites", 0),
                    punch_in=o.get("punch_in") or "—",
                    punch_out=o.get("punch_out") or "—",
                    hours_worked=o.get("hours_worked") or "—",
                    gps_status=o.get("gps_status") or "—",
                    sites=o.get("sites") or [],
                    company_id=comp_info.get("company_id"),
                    company_name=comp_info.get("company_name"),
                    company_short_name=comp_info.get("company_short_name"),
                    company_logo_url=comp_info.get("company_logo_url"),
                    is_eagle=comp_info.get("is_eagle", False),
                )
            )
        return officers

    @staticmethod
    def get_combined_report(
        db: Session,
        employee_oid: int,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
        plan_oid: Optional[int] = None,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        user_branch_oids: Optional[List[int]] = None,
    ) -> CombinedReportResponse:
        """Construct the consolidated Combined Officer Operations Report for a selected officer.

        Handles single/multiple date filters, metadata lookups, source report lookups,
        and aggregates Executive Summary metrics. Enforces hierarchy and branch authorization.
        """
        # 1. Authoritative Officer Lookup from EMPLOYEE
        employee_query = text("""
            SELECT oid AS employee_oid, name AS officer, emp_code, BRANCH AS branch, COMPANY AS company_id, AREA_MANAGER_OID AS area_manager_oid
            FROM EMPLOYEE
            WHERE oid = :employee_oid
            LIMIT 1
        """)
        emp_row = db.execute(employee_query, {"employee_oid": employee_oid}).mappings().first()

        if not emp_row:
            logger.warning(f"Report query failed: Employee OID {employee_oid} not found.")
            raise AppBaseException(
                message=f"Officer with ID {employee_oid} not found.",
                code="OFFICER_NOT_FOUND",
                status_code=404,
            )

        # Hierarchy / cross-branch authorization check
        if user_branch_oids is not None:
            is_allowed = (
                (area_manager_oid is not None and emp_row.get("area_manager_oid") == area_manager_oid)
                or (emp_row.get("branch") in user_branch_oids and (emp_row.get("area_manager_oid") is None or emp_row.get("area_manager_oid") == area_manager_oid))
            )
            if not is_allowed:
                raise AppBaseException(
                    message=f"Access denied: Officer with ID {employee_oid} belongs to an unassigned branch.",
                    code="FORBIDDEN_BRANCH",
                    status_code=403,
                )
        elif area_manager_oid is not None:
            if emp_row.get("area_manager_oid") != area_manager_oid:
                logger.warning(f"Access denied: Employee OID {employee_oid} is not assigned to area manager {area_manager_oid}.")
                raise AppBaseException(
                    message=f"Access denied: Officer with ID {employee_oid} is not assigned to this area manager.",
                    code="FORBIDDEN_OFFICER",
                    status_code=403,
                )
        elif user_branch_oid is not None and emp_row.get("branch") != user_branch_oid:
            logger.warning(f"Access denied: Employee OID {employee_oid} (branch {emp_row.get('branch')}) does not belong to user branch {user_branch_oid}.")
            raise AppBaseException(
                message=f"Access denied: Officer with ID {employee_oid} belongs to another branch.",
                code="FORBIDDEN_BRANCH",
                status_code=403,
            )

        # Resolve branch name if branch ID exists
        branch_id = emp_row.get("branch")
        branch_name: Optional[str] = None
        if branch_id:
            branch_row = db.execute(
                text("SELECT name FROM BRANCH WHERE oid = :oid LIMIT 1"),
                {"oid": branch_id}
            ).mappings().first()
            if branch_row:
                branch_name = branch_row.get("name")
            else:
                branch_name = str(branch_id)

        # Dynamically resolve company details (UDF vs Eagle/EISPL)
        company_info = resolve_report_company_and_logo({
            "company_id": emp_row.get("company_id"),
            "officer": emp_row.get("officer"),
        })

        # 2. Resolve Plan information (Weekly, Monthly, Single) if plan_oid or dates specified
        plan_info: Optional[PlanInfoSummary] = None
        planned_site_ids: Set[int] = set()
        active_plan: Optional[FieldOfficerAssignedVisits] = None

        if plan_oid is not None:
            active_plan = db.query(FieldOfficerAssignedVisits).filter(FieldOfficerAssignedVisits.oid == plan_oid).first()
            if active_plan:
                plan_start, plan_end = VisitRepository.get_plan_date_range(active_plan)
                if not from_date:
                    from_date = plan_start
                if not to_date:
                    to_date = plan_end

        elif from_date is not None:
            matching_plans = (
                db.query(FieldOfficerAssignedVisits)
                .filter(FieldOfficerAssignedVisits.employee_oid == employee_oid)
                .all()
            )
            for p in matching_plans:
                p_start, p_end = VisitRepository.get_plan_date_range(p)
                if p_start and p_end and p_start <= from_date <= p_end:
                    active_plan = p
                    break

        # If still no dates and no plan_oid, default to the officer's latest visit date so we don't dump all history
        if not from_date and not to_date and not active_plan:
            latest_d_row = db.execute(
                text("SELECT MAX(visit_date) FROM VISIT_REPORT_METADATA WHERE employee_oid = :emp_oid"),
                {"emp_oid": employee_oid}
            ).scalar()
            if latest_d_row:
                if isinstance(latest_d_row, str):
                    try:
                        from_date = datetime.strptime(latest_d_row, "%Y-%m-%d").date()
                    except Exception:
                        from_date = None
                elif isinstance(latest_d_row, date):
                    from_date = latest_d_row
                to_date = from_date

        if active_plan:
            freq_records = (
                db.query(FieldOfficerVisitFrequency)
                .filter(FieldOfficerVisitFrequency.plan_oid == active_plan.oid)
                .all()
            )
            planned_site_ids = {f.site_oid for f in freq_records if f.site_oid}
            total_planned = sum(f.visit_frequency for f in freq_records)
            plan_info = PlanInfoSummary(
                plan_oid=active_plan.oid,
                plan_code=active_plan.plan_code,
                planning_type=active_plan.planning_type,
                week_start_date=active_plan.week_start_date,
                week_end_date=active_plan.week_end_date,
                planning_month=active_plan.planning_month,
                planning_year=active_plan.planning_year,
                status=active_plan.status,
                total_sites=len(planned_site_ids),
                total_planned_visits=total_planned,
            )

        # 3. Build parameter map and date clauses for direct source table lookups
        params: Dict[str, Any] = {"emp_oid": employee_oid}
        date_clause = ""
        if from_date and to_date:
            date_clause = " AND (visit_date >= :from_date AND visit_date <= :to_date)"
            params["from_date"] = str(from_date)
            params["to_date"] = str(to_date)
        elif from_date:
            date_clause = " AND visit_date >= :from_date"
            params["from_date"] = str(from_date)
        elif to_date:
            date_clause = " AND visit_date <= :to_date"
            params["to_date"] = str(to_date)

        # 4. Retrieve source reports directly from FIELD_OFFICER_* tables
        day_rows = [
            dict(r)
            for r in db.execute(
                text(f"SELECT * FROM FIELD_OFFICER_DAY_VISIT_REPORTS WHERE employee_oid = :emp_oid{date_clause} ORDER BY visit_date DESC"),
                params
            ).mappings().all()
        ]

        night_rows = [
            dict(r)
            for r in db.execute(
                text(f"SELECT * FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS WHERE employee_oid = :emp_oid{date_clause} ORDER BY visit_date DESC"),
                params
            ).mappings().all()
        ]

        gen_rows = [
            dict(r)
            for r in db.execute(
                text(f"SELECT * FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS WHERE employee_oid = :emp_oid{date_clause} ORDER BY visit_date DESC"),
                params
            ).mappings().all()
        ]

        # 5. Resolve Attendance (Punch In, Punch Out, Hours Worked)
        effective_date = from_date
        if not effective_date:
            for r in (day_rows + night_rows + gen_rows):
                if r.get("visit_date"):
                    effective_date = r["visit_date"]
                    break

        att_info = ReportRepository.get_officer_attendance_for_report(
            db=db,
            employee_oid=employee_oid,
            target_date=effective_date,
            from_date=from_date,
            to_date=to_date,
        )

        officer_summary = OfficerSummary(
            employee_oid=emp_row["employee_oid"],
            officer=emp_row["officer"],
            emp_code=emp_row.get("emp_code"),
            branch=branch_name,
            area=None,
            shift="Day / Night",
            punch_in=att_info.get("punch_in") or "—",
            punch_out=att_info.get("punch_out") or "—",
            hours_worked=att_info.get("hours_worked"),
            company_id=company_info.get("company_id"),
            company_name=company_info.get("company_name"),
            company_short_name=company_info.get("company_short_name"),
            company_logo_filename=company_info.get("company_logo_filename"),
            company_logo_url=company_info.get("company_logo_url"),
            is_eagle=company_info.get("is_eagle", False),
        )

        site_visits: List[SiteVisitSummary] = []
        general_reports: List[GeneralReportResponse] = []
        day_reports: List[DayReportResponse] = []
        night_reports: List[NightReportResponse] = []
        unique_site_ids: Set[int] = set()

        serial_no = 1

        for raw in day_rows:
            dummy_meta = VisitReportMetadata()
            dummy_meta.visit_date = raw.get("visit_date")
            dummy_meta.created_at = raw.get("created_on")

            site_id = raw.get("site_id")
            site_name = raw.get("site_name")
            client_name = raw.get("client_name")

            if site_id and not site_name:
                site_info = ReportRepository.get_site(db, site_id)
                if site_info:
                    site_name = site_info.get("name")
                    client_name = client_name or site_info.get("client_name")

            is_planned = bool(site_id and site_id in planned_site_ids)
            p_code = plan_info.plan_code if (is_planned and plan_info) else None

            resp = ReportService._map_day_report(
                raw, dummy_meta, site_name, client_name, officer_summary.officer, is_planned, p_code
            )
            day_reports.append(resp)

            if site_id:
                unique_site_ids.add(site_id)

            site_visits.append(
                SiteVisitSummary(
                    serial_no=serial_no,
                    site_id=site_id,
                    site_name=resp.site_name or (f"Site #{site_id}" if site_id else "Unknown Site"),
                    visit_type="Day Inspection",
                    check_in=resp.start_time,
                    check_out=resp.end_time,
                    status=resp.status or "Completed",
                    visit_date=resp.visit_date,
                    is_planned=is_planned,
                    plan_code=p_code,
                )
            )
            serial_no += 1

        for raw in night_rows:
            dummy_meta = VisitReportMetadata()
            dummy_meta.visit_date = raw.get("visit_date")
            dummy_meta.created_at = raw.get("created_on")

            site_id = raw.get("site_id")
            site_name = raw.get("site_name")
            client_name = raw.get("client_name")

            if site_id and not site_name:
                site_info = ReportRepository.get_site(db, site_id)
                if site_info:
                    site_name = site_info.get("name")
                    client_name = client_name or site_info.get("client_name")

            is_planned = bool(site_id and site_id in planned_site_ids)
            p_code = plan_info.plan_code if (is_planned and plan_info) else None

            resp = ReportService._map_night_report(
                raw, dummy_meta, site_name, client_name, officer_summary.officer, is_planned, p_code
            )
            night_reports.append(resp)

            if site_id:
                unique_site_ids.add(site_id)

            site_visits.append(
                SiteVisitSummary(
                    serial_no=serial_no,
                    site_id=site_id,
                    site_name=resp.site_name or (f"Site #{site_id}" if site_id else "Unknown Site"),
                    visit_type="Night Inspection",
                    check_in=resp.start_time,
                    check_out=resp.end_time,
                    status=resp.status or "Completed",
                    visit_date=resp.visit_date,
                    is_planned=is_planned,
                    plan_code=p_code,
                )
            )
            serial_no += 1

        for raw in gen_rows:
            dummy_meta = VisitReportMetadata()
            dummy_meta.visit_date = raw.get("visit_date")
            dummy_meta.created_at = raw.get("created_on")

            site_id = raw.get("site_id")
            site_name = raw.get("site_name")
            client_name = raw.get("client_name")

            if site_id and not site_name:
                site_info = ReportRepository.get_site(db, site_id)
                if site_info:
                    site_name = site_info.get("name")
                    client_name = client_name or site_info.get("client_name")

            is_planned = bool(site_id and site_id in planned_site_ids)
            p_code = plan_info.plan_code if (is_planned and plan_info) else None

            resp = ReportService._map_general_report(
                raw, dummy_meta, site_name, client_name, officer_summary.officer, is_planned, p_code
            )
            general_reports.append(resp)

            if site_id:
                unique_site_ids.add(site_id)

            site_visits.append(
                SiteVisitSummary(
                    serial_no=serial_no,
                    site_id=site_id,
                    site_name=resp.site_name or (f"Site #{site_id}" if site_id else "Unknown Site"),
                    visit_type="General Inspection",
                    check_in=resp.start_time,
                    check_out=resp.end_time,
                    status="Completed",
                    visit_date=resp.visit_date,
                    is_planned=is_planned,
                    plan_code=p_code,
                )
            )
            serial_no += 1

        # 6. Executive Summary Calculations
        total_completed = len(general_reports) + len(day_reports) + len(night_reports)
        planned_completed = sum(1 for v in site_visits if v.is_planned)
        unplanned_completed = sum(1 for v in site_visits if not v.is_planned)
        total_planned_target = plan_info.total_planned_visits if (plan_info and plan_info.total_planned_visits) else (planned_completed if plan_info else 0)
        missed = max(0, total_planned_target - planned_completed) if plan_info else 0

        exec_summary = ReportExecutiveSummary(
            planned_visits=total_planned_target,
            completed_visits=total_completed,
            missed_visits=missed,
            general_reports=len(general_reports),
            day_reports=len(day_reports),
            night_reports=len(night_reports),
            total_sites_covered=len(unique_site_ids),
            planned_completed=planned_completed,
            unplanned_completed=unplanned_completed,
        )

        return CombinedReportResponse(
            officer=officer_summary,
            summary=exec_summary,
            site_visits=site_visits,
            general_reports=general_reports,
            day_reports=day_reports,
            night_reports=night_reports,
            company_id=company_info.get("company_id"),
            company_name=company_info.get("company_name"),
            company_short_name=company_info.get("company_short_name"),
            company_logo_url=company_info.get("company_logo_url"),
            is_eagle=company_info.get("is_eagle", False),
            plan_info=plan_info,
        )

    # --------------------------------------------------------------------------
    # Private Mappers & Parsing Helpers
    # --------------------------------------------------------------------------

    @staticmethod
    def _map_general_report(
        raw: Dict[str, Any],
        meta: VisitReportMetadata,
        site_name: Optional[str],
        client_name: Optional[str],
        fallback_officer: str,
        is_planned: bool = False,
        plan_code: Optional[str] = None,
    ) -> GeneralReportResponse:
        report_oid_str = str(raw.get("oid")) if raw.get("oid") is not None else None
        start_t = raw.get("check-in_time") or raw.get("start_time")
        end_t = raw.get("check-out_time") or raw.get("end_time")
        return GeneralReportResponse(
            id=report_oid_str,
            formatted_report_id=raw.get("report_id") or raw.get("formatted_report_id"),
            client_name=raw.get("client_name") or client_name,
            site_name=site_name or raw.get("site_name"),
            visit_date=ReportService._format_date(raw.get("visit_date") or meta.visit_date),
            created_on=ReportService._format_datetime(raw.get("created_on") or meta.created_at),
            officer=raw.get("officer") or fallback_officer,
            start_time=ReportService._format_time(start_t),
            end_time=ReportService._format_time(end_t),
            person_visited=raw.get("person_visited"),
            reason_of_visit=raw.get("reason_of_visit"),
            remark=raw.get("remark"),
            photos=ReportService._parse_photo_list(raw.get("photos")),
            is_planned=is_planned,
            plan_code=plan_code,
        )

    @staticmethod
    def _map_day_report(
        raw: Dict[str, Any],
        meta: VisitReportMetadata,
        site_name: Optional[str],
        client_name: Optional[str],
        fallback_officer: str,
        is_planned: bool = False,
        plan_code: Optional[str] = None,
    ) -> DayReportResponse:
        report_oid_str = str(raw.get("oid")) if raw.get("oid") is not None else None
        start_t = raw.get("check-in_time") or raw.get("start_time")
        end_t = raw.get("check-out_time") or raw.get("end_time")
        return DayReportResponse(
            id=report_oid_str,
            formatted_report_id=raw.get("report_id") or raw.get("formatted_report_id"),
            client_name=raw.get("client_name") or client_name,
            unit=raw.get("unit"),
            site_name=site_name or raw.get("site_name"),
            shift=raw.get("shift"),
            visit_date=ReportService._format_date(raw.get("visit_date") or meta.visit_date),
            officer=raw.get("officer") or fallback_officer,
            start_time=ReportService._format_time(start_t),
            end_time=ReportService._format_time(end_t),
            gps=raw.get("gps"),
            photos=ReportService._parse_photo_list(raw.get("photos")),
            guards=ReportService._parse_json_list(raw.get("guards")),
            checklist=ReportService._parse_json_list(raw.get("checklist")),
            observations=raw.get("observations"),
            suggestions=raw.get("suggestions"),
            attachments=ReportService._parse_json_list(raw.get("attachments")),
            status=raw.get("status"),
            lecture_details=ReportService._parse_json_field(raw.get("lecture_details")),
            random_checking=ReportService._parse_json_field(raw.get("random_checking")),
            overall_remarks=raw.get("overall_remarks"),
            is_planned=is_planned,
            plan_code=plan_code,
        )

    @staticmethod
    def _map_night_report(
        raw: Dict[str, Any],
        meta: VisitReportMetadata,
        site_name: Optional[str],
        client_name: Optional[str],
        fallback_officer: str,
        is_planned: bool = False,
        plan_code: Optional[str] = None,
    ) -> NightReportResponse:
        report_oid_str = str(raw.get("oid")) if raw.get("oid") is not None else None
        start_t = raw.get("check-in_time") or raw.get("start_time")
        end_t = raw.get("check-out_time") or raw.get("end_time")
        return NightReportResponse(
            id=report_oid_str,
            formatted_report_id=raw.get("report_id") or raw.get("formatted_report_id"),
            client_name=raw.get("client_name") or client_name,
            unit=raw.get("unit"),
            site_name=site_name or raw.get("site_name"),
            shift=raw.get("shift"),
            visit_date=ReportService._format_date(raw.get("visit_date") or meta.visit_date),
            officer=raw.get("officer") or fallback_officer,
            start_time=ReportService._format_time(start_t),
            end_time=ReportService._format_time(end_t),
            gps=raw.get("gps"),
            photos=ReportService._parse_photo_list(raw.get("photos")),
            guards=ReportService._parse_json_list(raw.get("guards")),
            checklist=ReportService._parse_json_list(raw.get("checklist")),
            lecture_details=ReportService._parse_json_field(raw.get("lecture_details")),
            random_checking=ReportService._parse_json_field(raw.get("random_checking")),
            suggestions=raw.get("suggestions"),
            attachments=ReportService._parse_json_list(raw.get("attachments")),
            status=raw.get("status"),
            overall_remarks=raw.get("overall_remarks"),
            officer_signature=raw.get("officer_signature"),
            is_planned=is_planned,
            plan_code=plan_code,
        )

    @staticmethod
    def _parse_json_field(val: Any) -> Any:
        """Safely parse a JSON string or return existing structured object."""
        if val is None or val == "":
            return None
        if isinstance(val, (dict, list)):
            return val
        if isinstance(val, str):
            try:
                return json.loads(val)
            except (json.JSONDecodeError, TypeError) as err:
                logger.warning(f"Failed to parse JSON field '{val}': {err}")
                return val
        return val

    @staticmethod
    def _parse_json_list(val: Any) -> List[Any]:
        """Safely parse a JSON string or list and guarantee returning a List."""
        parsed = ReportService._parse_json_field(val)
        if parsed is None:
            return []
        if isinstance(parsed, list):
            return parsed
        return [parsed]

    @staticmethod
    def _parse_photo_list(val: Any) -> List[str]:
        """Safely parse photos field and return a List of string URLs/paths."""
        raw_list = ReportService._parse_json_list(val)
        return [str(p) for p in raw_list if p is not None]

    @staticmethod
    def _format_date(val: Any) -> Optional[str]:
        if val is None:
            return None
        if isinstance(val, (date, datetime)):
            return val.strftime("%Y-%m-%d")
        return str(val)

    @staticmethod
    def _format_datetime(val: Any) -> Optional[str]:
        if val is None:
            return None
        if isinstance(val, datetime):
            return val.isoformat()
        if isinstance(val, date):
            return val.strftime("%Y-%m-%d")
        return str(val)

    @staticmethod
    def _format_time(val: Any) -> Optional[str]:
        if val is None:
            return None
        if isinstance(val, datetime):
            return val.strftime("%H:%M")
        if isinstance(val, time):
            return val.strftime("%H:%M")
        if isinstance(val, timedelta):
            total_seconds = int(val.total_seconds())
            hours = (total_seconds // 3600) % 24
            minutes = (total_seconds % 3600) // 60
            return f"{hours:02d}:{minutes:02d}"
        return str(val)
