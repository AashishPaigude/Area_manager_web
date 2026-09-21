import calendar
from datetime import date
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text
from app.models.employee import Employee
from app.models.branch import Branch
from app.models.client import Client
from app.models.site import Site
from app.models.assigned_visit import FieldOfficerAssignedVisits
from app.models.visit_frequency import FieldOfficerVisitFrequency
from app.models.visit_report_metadata import VisitReportMetadata


class VisitRepository:

    # --- Master Data Queries ---

    @staticmethod
    def get_active_field_officers(db: Session, user_branch_oid: Optional[int] = None) -> List[Employee]:
        """
        Retrieve active Field Officers (active = 1, DESIGNATION = 19), optionally scoped by user_branch_oid.
        """
        query = db.query(Employee).filter(Employee.active == 1, Employee.DESIGNATION == 19)
        if user_branch_oid is not None:
            query = query.filter(Employee.BRANCH == user_branch_oid)
        return query.order_by(Employee.name.asc()).all()

    @staticmethod
    def get_branches(db: Session, user_branch_oid: Optional[int] = None) -> List[Branch]:
        """
        Retrieve branches from the BRANCH master table, optionally scoped by user_branch_oid.
        """
        query = db.query(Branch)
        if user_branch_oid is not None:
            query = query.filter(Branch.oid == user_branch_oid)
        return query.order_by(Branch.name.asc()).all()

    @staticmethod
    def get_clients(db: Session, user_branch_oid: Optional[int] = None) -> List[Client]:
        """
        Retrieve clients from the CLIENTT master table, optionally scoped by user_branch_oid.
        """
        if user_branch_oid is not None:
            b_oids = [6, 3] if user_branch_oid == 6 else [user_branch_oid]
            return (
                db.query(Client)
                .join(Site, Site.CLIENTT == Client.oid)
                .filter(Site.BRANCH.in_(b_oids))
                .distinct()
                .order_by(Client.name.asc())
                .all()
            )
        return db.query(Client).order_by(Client.name.asc()).all()

    @staticmethod
    def get_sites(
        db: Session,
        branch_oid: Optional[int] = None,
        client_oid: Optional[int] = None,
        user_branch_oid: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieve sites from the SITE table with optional branch_oid, client_oid, and user_branch_oid filtering.
        """
        query = db.query(Site)
        effective_branch = user_branch_oid if user_branch_oid is not None else branch_oid
        if effective_branch is not None:
            b_oids = [6, 3] if effective_branch == 6 else [effective_branch]
            query = query.filter(Site.BRANCH.in_(b_oids))
        if client_oid is not None:
            query = query.filter(Site.CLIENTT == client_oid)

        sites = query.order_by(Site.name.asc()).all()

        result = []
        for site in sites:
            result.append({
                "oid": site.oid,
                "name": site.name,
                "branch_oid": site.BRANCH,
                "client_oid": site.CLIENTT
            })
        return result

    # --- Visit Plan Management Queries ---

    @staticmethod
    def generate_next_plan_code(db: Session) -> str:
        """
        Generate unique plan_code using sequential VP-XXX format.
        """
        max_oid = db.query(func.max(FieldOfficerAssignedVisits.oid)).scalar() or 0
        next_id = max_oid + 1
        return f"VP-{next_id:03d}"

    @staticmethod
    def get_plan_date_range(plan: FieldOfficerAssignedVisits) -> tuple[Optional[date], Optional[date]]:
        """
        Calculate boundary start and end dates for a plan period.
        """
        if plan.planning_type == "WEEKLY":
            return plan.week_start_date, plan.week_end_date
        elif plan.planning_type == "MONTHLY":
            if plan.planning_month and plan.planning_year:
                start_d = date(plan.planning_year, plan.planning_month, 1)
                last_day = calendar.monthrange(plan.planning_year, plan.planning_month)[1]
                end_d = date(plan.planning_year, plan.planning_month, last_day)
                return start_d, end_d
        elif plan.planning_type == "SINGLE":
            return plan.visit_date, plan.visit_date
        return None, None

    @staticmethod
    def calculate_site_visits_done(
        db: Session,
        employee_oid: int,
        site_oid: int,
        start_d: Optional[date],
        end_d: Optional[date]
    ) -> int:
        """
        Calculate total completed visits/reports count submitted by officer for a site in date range.
        """
        if not start_d or not end_d:
            return 0

        params = {
            "emp_oid": employee_oid,
            "site_oid": site_oid,
            "start_d": str(start_d),
            "end_d": str(end_d),
        }

        day_cnt = db.execute(
            text("SELECT COUNT(*) FROM FIELD_OFFICER_DAY_VISIT_REPORTS WHERE employee_oid = :emp_oid AND site_id = :site_oid AND visit_date >= :start_d AND visit_date <= :end_d"),
            params
        ).scalar() or 0

        night_cnt = db.execute(
            text("SELECT COUNT(*) FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS WHERE employee_oid = :emp_oid AND site_id = :site_oid AND visit_date >= :start_d AND visit_date <= :end_d"),
            params
        ).scalar() or 0

        gen_cnt = db.execute(
            text("SELECT COUNT(*) FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS WHERE employee_oid = :emp_oid AND site_id = :site_oid AND visit_date >= :start_d AND visit_date <= :end_d"),
            params
        ).scalar() or 0

        meta_cnt = db.execute(
            text("SELECT COUNT(*) FROM VISIT_REPORT_METADATA WHERE employee_oid = :emp_oid AND site_id = :site_oid AND visit_date >= :start_d AND visit_date <= :end_d"),
            params
        ).scalar() or 0

        return max(day_cnt + night_cnt + gen_cnt, meta_cnt)

    @staticmethod
    def get_visit_plans(
        db: Session,
        planning_type: Optional[str] = None,
        employee_oid: Optional[int] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        planning_month: Optional[int] = None,
        planning_year: Optional[int] = None,
        week_start_date: Optional[date] = None,
        week_end_date: Optional[date] = None,
        user_branch_oid: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieve visit plans with aggregated total_sites, total_visits, and calculated visits_done, optionally scoped by user_branch_oid.
        """
        query = (
            db.query(
                FieldOfficerAssignedVisits,
                Employee.name.label("field_officer_name"),
                func.count(FieldOfficerVisitFrequency.oid).label("total_sites"),
                func.coalesce(func.sum(FieldOfficerVisitFrequency.visit_frequency), 0).label("total_visits")
            )
            .outerjoin(Employee, FieldOfficerAssignedVisits.employee_oid == Employee.oid)
            .outerjoin(FieldOfficerVisitFrequency, FieldOfficerAssignedVisits.oid == FieldOfficerVisitFrequency.plan_oid)
        )

        # Filters
        if user_branch_oid is not None:
            query = query.filter(Employee.BRANCH == user_branch_oid)
        if planning_type:
            query = query.filter(FieldOfficerAssignedVisits.planning_type == planning_type)
        if employee_oid:
            query = query.filter(FieldOfficerAssignedVisits.employee_oid == employee_oid)
        if status:
            query = query.filter(FieldOfficerAssignedVisits.status == status)
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                or_(
                    FieldOfficerAssignedVisits.plan_code.ilike(search_pattern),
                    Employee.name.ilike(search_pattern)
                )
            )
        if planning_month is not None:
            query = query.filter(FieldOfficerAssignedVisits.planning_month == planning_month)
        if planning_year is not None:
            query = query.filter(FieldOfficerAssignedVisits.planning_year == planning_year)
        
        if week_start_date is not None or week_end_date is not None:
            date_conditions = []
            if week_start_date is not None and week_end_date is not None:
                # Matches WEEKLY plans overlapping range or SINGLE plans falling inside date range
                date_conditions.append(
                    FieldOfficerAssignedVisits.week_start_date >= week_start_date
                )
                date_conditions.append(
                    FieldOfficerAssignedVisits.week_end_date <= week_end_date
                )
                date_conditions.append(
                    FieldOfficerAssignedVisits.visit_date.between(week_start_date, week_end_date)
                )
            elif week_start_date is not None:
                date_conditions.append(FieldOfficerAssignedVisits.week_start_date >= week_start_date)
                date_conditions.append(FieldOfficerAssignedVisits.visit_date >= week_start_date)
            elif week_end_date is not None:
                date_conditions.append(FieldOfficerAssignedVisits.week_end_date <= week_end_date)
                date_conditions.append(FieldOfficerAssignedVisits.visit_date <= week_end_date)

            query = query.filter(or_(*date_conditions))

        query = (
            query.group_by(FieldOfficerAssignedVisits.oid, Employee.name)
            .order_by(FieldOfficerAssignedVisits.created_at.desc(), FieldOfficerAssignedVisits.oid.desc())
        )

        results = query.all()

        data = []
        for plan, officer_name, total_sites, total_visits in results:
            start_d, end_d = VisitRepository.get_plan_date_range(plan)

            freq_sites = (
                db.query(FieldOfficerVisitFrequency.site_oid)
                .filter(FieldOfficerVisitFrequency.plan_oid == plan.oid)
                .all()
            )

            plan_visits_done = 0
            if start_d and end_d and freq_sites:
                for s_oid in [s[0] for s in freq_sites]:
                    plan_visits_done += VisitRepository.calculate_site_visits_done(
                        db=db,
                        employee_oid=plan.employee_oid,
                        site_oid=s_oid,
                        start_d=start_d,
                        end_d=end_d,
                    )

            data.append({
                "oid": plan.oid,
                "plan_code": plan.plan_code,
                "planning_type": plan.planning_type,
                "week_start_date": plan.week_start_date,
                "week_end_date": plan.week_end_date,
                "planning_month": plan.planning_month,
                "planning_year": plan.planning_year,
                "visit_date": plan.visit_date,
                "employee_oid": plan.employee_oid,
                "field_officer_name": officer_name,
                "planning_method": plan.planning_method,
                "status": plan.status,
                "total_sites": total_sites,
                "total_visits": int(total_visits),
                "visits_done": plan_visits_done,
                "created_at": plan.created_at,
                "updated_at": plan.updated_at
            })
        return data

    @staticmethod
    def create_assigned_plan(
        db: Session,
        planning_type: str,
        employee_oid: int,
        week_start_date: Optional[date] = None,
        week_end_date: Optional[date] = None,
        planning_month: Optional[int] = None,
        planning_year: Optional[int] = None,
        visit_date: Optional[date] = None,
        created_by: Optional[int] = None
    ) -> FieldOfficerAssignedVisits:
        """
        Create a new FIELD_OFFICER_ASSIGNED_VISITS record in DRAFT status.
        """
        plan_code = VisitRepository.generate_next_plan_code(db)
        plan = FieldOfficerAssignedVisits(
            plan_code=plan_code,
            planning_type=planning_type,
            week_start_date=week_start_date,
            week_end_date=week_end_date,
            planning_month=planning_month,
            planning_year=planning_year,
            visit_date=visit_date,
            employee_oid=employee_oid,
            planning_method="MANUAL",
            status="DRAFT",
            created_by=created_by
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)
        return plan

    @staticmethod
    def get_plan_by_oid(db: Session, plan_oid: int) -> Optional[FieldOfficerAssignedVisits]:
        """
        Get FieldOfficerAssignedVisits by oid.
        """
        return db.query(FieldOfficerAssignedVisits).filter(FieldOfficerAssignedVisits.oid == plan_oid).first()

    @staticmethod
    def get_plan_with_details(db: Session, plan_oid: int) -> Optional[Dict[str, Any]]:
        """
        Get full details of a visit plan including field officer name, joined site details, total_sites, total_visits, and site-level visits_done.
        """
        plan = db.query(FieldOfficerAssignedVisits).filter(FieldOfficerAssignedVisits.oid == plan_oid).first()
        if not plan:
            return None

        # Get officer name
        officer = db.query(Employee).filter(Employee.oid == plan.employee_oid).first()
        officer_name = officer.name if officer else None

        # Calculate date boundaries for actual visit lookup
        start_d, end_d = VisitRepository.get_plan_date_range(plan)

        # Get site frequencies with joined Site, Branch, Client details
        freq_records = (
            db.query(FieldOfficerVisitFrequency)
            .filter(FieldOfficerVisitFrequency.plan_oid == plan_oid)
            .order_by(FieldOfficerVisitFrequency.oid.asc())
            .all()
        )

        sites_data = []
        total_visits_count = 0
        plan_visits_done_total = 0

        for freq in freq_records:
            site = db.query(Site).filter(Site.oid == freq.site_oid).first()
            branch = db.query(Branch).filter(Branch.oid == site.BRANCH).first() if site and site.BRANCH else None
            client = db.query(Client).filter(Client.oid == site.CLIENTT).first() if site and site.CLIENTT else None

            # Calculate visits_done for this specific site
            site_visits_done = VisitRepository.calculate_site_visits_done(
                db=db,
                employee_oid=plan.employee_oid,
                site_oid=freq.site_oid,
                start_d=start_d,
                end_d=end_d
            )

            total_visits_count += freq.visit_frequency
            plan_visits_done_total += site_visits_done

            sites_data.append({
                "frequency_oid": freq.oid,
                "site_oid": freq.site_oid,
                "site_name": site.name if site else f"Site {freq.site_oid}",
                "branch_oid": site.BRANCH if site else None,
                "branch_name": branch.name if branch else None,
                "client_oid": site.CLIENTT if site else None,
                "client_name": client.name if client else None,
                "visit_frequency": freq.visit_frequency,
                "visits_done": site_visits_done
            })

        return {
            "oid": plan.oid,
            "plan_code": plan.plan_code,
            "planning_type": plan.planning_type,
            "week_start_date": plan.week_start_date,
            "week_end_date": plan.week_end_date,
            "planning_month": plan.planning_month,
            "planning_year": plan.planning_year,
            "visit_date": plan.visit_date,
            "employee_oid": plan.employee_oid,
            "field_officer_name": officer_name,
            "planning_method": plan.planning_method,
            "status": plan.status,
            "total_sites": len(sites_data),
            "total_visits": total_visits_count,
            "visits_done": plan_visits_done_total,
            "created_at": plan.created_at,
            "updated_at": plan.updated_at,
            "sites": sites_data
        }

    @staticmethod
    def duplicate_plan(db: Session, original_plan_oid: int) -> Optional[FieldOfficerAssignedVisits]:
        """
        Duplicate an existing plan into a brand new DRAFT plan with its own plan_code and copied site frequencies.
        """
        original = db.query(FieldOfficerAssignedVisits).filter(FieldOfficerAssignedVisits.oid == original_plan_oid).first()
        if not original:
            return None

        # Generate new plan_code
        new_plan_code = VisitRepository.generate_next_plan_code(db)

        # Create new DRAFT plan record
        new_plan = FieldOfficerAssignedVisits(
            plan_code=new_plan_code,
            planning_type=original.planning_type,
            week_start_date=original.week_start_date,
            week_end_date=original.week_end_date,
            planning_month=original.planning_month,
            planning_year=original.planning_year,
            visit_date=original.visit_date,
            employee_oid=original.employee_oid,
            planning_method="MANUAL",
            status="DRAFT",
            created_by=original.created_by
        )
        db.add(new_plan)
        db.commit()
        db.refresh(new_plan)

        # Copy all site frequency records (For SINGLE, frequency is 1)
        freqs = db.query(FieldOfficerVisitFrequency).filter(FieldOfficerVisitFrequency.plan_oid == original_plan_oid).all()
        for f in freqs:
            freq_val = 1 if original.planning_type == "SINGLE" else f.visit_frequency
            new_freq = FieldOfficerVisitFrequency(
                plan_oid=new_plan.oid,
                site_oid=f.site_oid,
                visit_frequency=freq_val
            )
            db.add(new_freq)
        db.commit()

        return new_plan

    @staticmethod
    def update_plan_header(
        db: Session,
        plan_oid: int,
        planning_type: str,
        employee_oid: int,
        week_start_date: Optional[date] = None,
        week_end_date: Optional[date] = None,
        planning_month: Optional[int] = None,
        planning_year: Optional[int] = None,
        visit_date: Optional[date] = None
    ) -> Optional[FieldOfficerAssignedVisits]:
        """
        Update header fields of a DRAFT plan. Reset stale inactive period fields to None.
        """
        plan = db.query(FieldOfficerAssignedVisits).filter(FieldOfficerAssignedVisits.oid == plan_oid).first()
        if plan:
            plan.planning_type = planning_type
            plan.employee_oid = employee_oid
            plan.week_start_date = week_start_date if planning_type == "WEEKLY" else None
            plan.week_end_date = week_end_date if planning_type == "WEEKLY" else None
            plan.planning_month = planning_month if planning_type == "MONTHLY" else None
            plan.planning_year = planning_year if planning_type == "MONTHLY" else None
            plan.visit_date = visit_date if planning_type == "SINGLE" else None

            # If changed to SINGLE, enforce frequency = 1 for all existing site frequencies
            if planning_type == "SINGLE":
                db.query(FieldOfficerVisitFrequency).filter(
                    FieldOfficerVisitFrequency.plan_oid == plan_oid
                ).update({"visit_frequency": 1})

            db.commit()
            db.refresh(plan)
        return plan

    @staticmethod
    def delete_plan(db: Session, plan_oid: int) -> bool:
        """
        Delete a DRAFT plan and its associated site frequency configurations.
        """
        plan = db.query(FieldOfficerAssignedVisits).filter(FieldOfficerAssignedVisits.oid == plan_oid).first()
        if plan:
            db.query(FieldOfficerVisitFrequency).filter(FieldOfficerVisitFrequency.plan_oid == plan_oid).delete()
            db.delete(plan)
            db.commit()
            return True
        return False

    @staticmethod
    def get_site_frequency_by_plan_and_site(
        db: Session,
        plan_oid: int,
        site_oid: int
    ) -> Optional[FieldOfficerVisitFrequency]:
        """
        Check if a site is already added to a plan.
        """
        return (
            db.query(FieldOfficerVisitFrequency)
            .filter(
                FieldOfficerVisitFrequency.plan_oid == plan_oid,
                FieldOfficerVisitFrequency.site_oid == site_oid
            )
            .first()
        )

    @staticmethod
    def get_site_frequency_by_oid(db: Session, frequency_oid: int) -> Optional[FieldOfficerVisitFrequency]:
        """
        Get FIELD_OFFICER_VISIT_FREQUENCY by oid.
        """
        return db.query(FieldOfficerVisitFrequency).filter(FieldOfficerVisitFrequency.oid == frequency_oid).first()

    @staticmethod
    def add_site_to_plan(
        db: Session,
        plan_oid: int,
        site_oid: int,
        visit_frequency: int
    ) -> Dict[str, Any]:
        """
        Add a site and its visit frequency to a draft plan. Enforce visit_frequency = 1 for SINGLE plans.
        """
        plan = db.query(FieldOfficerAssignedVisits).filter(FieldOfficerAssignedVisits.oid == plan_oid).first()
        effective_freq = 1 if (plan and plan.planning_type == "SINGLE") else visit_frequency

        freq = FieldOfficerVisitFrequency(
            plan_oid=plan_oid,
            site_oid=site_oid,
            visit_frequency=effective_freq
        )
        db.add(freq)
        db.commit()
        db.refresh(freq)

        site = db.query(Site).filter(Site.oid == site_oid).first()
        branch = db.query(Branch).filter(Branch.oid == site.BRANCH).first() if site and site.BRANCH else None
        client = db.query(Client).filter(Client.oid == site.CLIENTT).first() if site and site.CLIENTT else None

        start_d, end_d = VisitRepository.get_plan_date_range(plan) if plan else (None, None)
        visits_done = VisitRepository.calculate_site_visits_done(
            db=db,
            employee_oid=plan.employee_oid if plan else 0,
            site_oid=site_oid,
            start_d=start_d,
            end_d=end_d
        )

        return {
            "frequency_oid": freq.oid,
            "site_oid": freq.site_oid,
            "site_name": site.name if site else f"Site {site_oid}",
            "branch_oid": site.BRANCH if site else None,
            "branch_name": branch.name if branch else None,
            "client_oid": site.CLIENTT if site else None,
            "client_name": client.name if client else None,
            "visit_frequency": freq.visit_frequency,
            "visits_done": visits_done
        }

    @staticmethod
    def update_site_frequency(
        db: Session,
        frequency_oid: int,
        visit_frequency: int
    ) -> Dict[str, Any]:
        """
        Update the visit_frequency of an existing site frequency record. Enforce visit_frequency = 1 for SINGLE plans.
        """
        freq = db.query(FieldOfficerVisitFrequency).filter(FieldOfficerVisitFrequency.oid == frequency_oid).first()
        plan = db.query(FieldOfficerAssignedVisits).filter(FieldOfficerAssignedVisits.oid == freq.plan_oid).first() if freq else None
        effective_freq = 1 if (plan and plan.planning_type == "SINGLE") else visit_frequency

        if freq:
            freq.visit_frequency = effective_freq
            db.commit()
            db.refresh(freq)

        site = db.query(Site).filter(Site.oid == freq.site_oid).first() if freq else None
        branch = db.query(Branch).filter(Branch.oid == site.BRANCH).first() if site and site.BRANCH else None
        client = db.query(Client).filter(Client.oid == site.CLIENTT).first() if site and site.CLIENTT else None

        start_d, end_d = VisitRepository.get_plan_date_range(plan) if plan else (None, None)
        visits_done = VisitRepository.calculate_site_visits_done(
            db=db,
            employee_oid=plan.employee_oid if plan else 0,
            site_oid=freq.site_oid if freq else 0,
            start_d=start_d,
            end_d=end_d
        )

        return {
            "frequency_oid": freq.oid,
            "site_oid": freq.site_oid if freq else 0,
            "site_name": site.name if site else f"Site {freq.site_oid}" if freq else "",
            "branch_oid": site.BRANCH if site else None,
            "branch_name": branch.name if branch else None,
            "client_oid": site.CLIENTT if site else None,
            "client_name": client.name if client else None,
            "visit_frequency": freq.visit_frequency if freq else effective_freq,
            "visits_done": visits_done
        }

    @staticmethod
    def delete_site_frequency(db: Session, frequency_oid: int) -> bool:
        """
        Remove a site frequency record from a draft plan.
        """
        freq = db.query(FieldOfficerVisitFrequency).filter(FieldOfficerVisitFrequency.oid == frequency_oid).first()
        if freq:
            db.delete(freq)
            db.commit()
            return True
        return False

    @staticmethod
    def publish_plan(db: Session, plan_oid: int) -> Optional[FieldOfficerAssignedVisits]:
        """
        Change status of a visit plan from DRAFT to PUBLISHED.
        """
        plan = db.query(FieldOfficerAssignedVisits).filter(FieldOfficerAssignedVisits.oid == plan_oid).first()
        if plan:
            plan.status = "PUBLISHED"
            db.commit()
            db.refresh(plan)
        return plan

    @staticmethod
    def unpublish_plan(db: Session, plan_oid: int) -> Optional[FieldOfficerAssignedVisits]:
        """
        Change status of a visit plan from PUBLISHED to DRAFT for editing.
        """
        plan = db.query(FieldOfficerAssignedVisits).filter(FieldOfficerAssignedVisits.oid == plan_oid).first()
        if plan:
            plan.status = "DRAFT"
            db.commit()
            db.refresh(plan)
        return plan
