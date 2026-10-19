from datetime import date
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status
from app.repositories.visit_repository import VisitRepository
from app.models.employee import Employee
from app.models.site import Site
from app.models.client import Client
from app.models.branch import Branch
from app.models.new_client_visit import FieldOfficerNewClientVisits
from app.schemas.user_context import UserContext
from app.schemas.visit import (
    FieldOfficerItem,
    FieldOfficerListResponse,
    BranchItem,
    BranchListResponse,
    ClientItem,
    ClientListResponse,
    SiteItem,
    SiteListResponse,
    CreatePlanRequest,
    UpdatePlanHeaderRequest,
    AddSiteToPlanRequest,
    UpdateSiteFrequencyRequest,
    ConfiguredSiteItem,
    ConfiguredSiteResponse,
    PlanDetailData,
    PlanDetailResponse,
    PlanSummaryItem,
    PlanSummaryListResponse,
    GenericSuccessResponse,
    CreateCustomVisitRequest,
    CustomVisitResponse,
    CustomVisitSingleResponse,
    CustomVisitListResponse,
)


class VisitService:

    # --- Helper Method for Plan Branch Authorization ---

    @staticmethod
    def _validate_plan_branch_access(
        db: Session, 
        plan_oid: int, 
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> Employee:
        """Helper to verify that a target visit plan exists and belongs to user hierarchy / branch."""
        plan = VisitRepository.get_plan_by_oid(db, plan_oid)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visit plan with oid={plan_oid} not found"
            )

        employee = db.query(Employee).filter(Employee.oid == plan.employee_oid).first()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Field officer for visit plan {plan_oid} not found"
            )

        allowed_branches = VisitRepository._resolve_allowed_branches(
            db, user_branch_oid=user_branch_oid, area_manager_oid=area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )
        if allowed_branches is not None:
            if len(allowed_branches) == 0:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied: Visit plan {plan_oid} belongs to an unassigned officer or branch"
                )
            is_own = (
                (area_manager_oid is not None and employee.AREA_MANAGER_OID == area_manager_oid)
                or (employee.BRANCH in allowed_branches and (employee.AREA_MANAGER_OID is None or employee.AREA_MANAGER_OID == area_manager_oid))
            )
            if not is_own:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied: Visit plan {plan_oid} belongs to an unassigned officer or branch"
                )

        return employee

    # --- Step 1 Master Data Services ---

    @staticmethod
    def get_field_officers(
        db: Session, 
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> FieldOfficerListResponse:
        """
        Fetch active Field Officers for dropdown selections, scoped by area_manager_oid or user_branch_oid.
        """
        kwargs = {}
        if area_manager_oid is not None:
            kwargs["area_manager_oid"] = area_manager_oid
        if allocated_branch_oids is not None:
            kwargs["allocated_branch_oids"] = allocated_branch_oids
        employees = VisitRepository.get_active_field_officers(db, user_branch_oid=user_branch_oid, **kwargs)
        data = [
            FieldOfficerItem(
                oid=emp.oid,
                name=emp.name,
                emp_code=emp.emp_code
            )
            for emp in employees
        ]
        return FieldOfficerListResponse(data=data)

    @staticmethod
    def get_branches(
        db: Session,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> BranchListResponse:
        """
        Fetch active branches for dropdown selections, scoped by user_branch_oid / area_manager_oid.
        """
        kwargs = {}
        if area_manager_oid is not None:
            kwargs["area_manager_oid"] = area_manager_oid
        if allocated_branch_oids is not None:
            kwargs["allocated_branch_oids"] = allocated_branch_oids
        branches = VisitRepository.get_branches(db, user_branch_oid=user_branch_oid, **kwargs)
        data = [
            BranchItem(
                oid=b.oid,
                name=b.name
            )
            for b in branches
        ]
        return BranchListResponse(data=data)

    @staticmethod
    def get_clients(
        db: Session,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> ClientListResponse:
        """
        Fetch active clients for dropdown selections, scoped by user_branch_oid / area_manager_oid.
        """
        kwargs = {}
        if area_manager_oid is not None:
            kwargs["area_manager_oid"] = area_manager_oid
        if allocated_branch_oids is not None:
            kwargs["allocated_branch_oids"] = allocated_branch_oids
        clients = VisitRepository.get_clients(db, user_branch_oid=user_branch_oid, **kwargs)
        data = [
            ClientItem(
                oid=c.oid,
                name=c.name
            )
            for c in clients
        ]
        return ClientListResponse(data=data)

    @staticmethod
    def get_sites(
        db: Session,
        branch_oid: Optional[int] = None,
        client_oid: Optional[int] = None,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> SiteListResponse:
        """
        Fetch sites with optional branch_oid and client_oid dependency filters, scoped by user_branch_oid / area_manager_oid.
        """
        kwargs = {}
        if area_manager_oid is not None:
            kwargs["area_manager_oid"] = area_manager_oid
        if allocated_branch_oids is not None:
            kwargs["allocated_branch_oids"] = allocated_branch_oids
        sites = VisitRepository.get_sites(
            db,
            branch_oid=branch_oid,
            client_oid=client_oid,
            user_branch_oid=user_branch_oid,
            **kwargs
        )
        data = [
            SiteItem(
                oid=s["oid"],
                name=s["name"],
                branch_oid=s["branch_oid"],
                client_oid=s["client_oid"]
            )
            for s in sites
        ]
        return SiteListResponse(data=data)

    # --- Plan Management Services ---

    @staticmethod
    def list_plans(
        db: Session,
        planning_type: Optional[str] = None,
        employee_oid: Optional[int] = None,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
        planning_month: Optional[int] = None,
        planning_year: Optional[int] = None,
        week_start_date: Optional[date] = None,
        week_end_date: Optional[date] = None,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        creator_type: Optional[str] = None,
        allocated_branch_oids: Optional[List[int]] = None,
        branch_oid: Optional[int] = None,
    ) -> PlanSummaryListResponse:
        """
        List visit plans with aggregated summary stats and optional filters, scoped by area_manager_oid or user_branch_oid.
        """
        results = VisitRepository.get_visit_plans(
            db=db,
            planning_type=planning_type,
            employee_oid=employee_oid,
            status=status_filter,
            search=search,
            planning_month=planning_month,
            planning_year=planning_year,
            week_start_date=week_start_date,
            week_end_date=week_end_date,
            user_branch_oid=user_branch_oid,
            area_manager_oid=area_manager_oid,
            creator_type=creator_type,
            allocated_branch_oids=allocated_branch_oids,
            branch_oid=branch_oid,
        )

        data = [PlanSummaryItem(**row) for row in results]
        return PlanSummaryListResponse(data=data)

    @staticmethod
    def create_plan(
        db: Session, 
        payload: CreatePlanRequest, 
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        created_by: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> PlanDetailResponse:
        """
        Create a new DRAFT visit plan (WEEKLY, MONTHLY, or SINGLE) for an active Field Officer.
        """
        # Validate employee exists
        employee = db.query(Employee).filter(Employee.oid == payload.employee_oid).first()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee with oid={payload.employee_oid} not found"
            )

        # Hierarchy / cross-branch check
        allowed_branches = VisitRepository._resolve_allowed_branches(
            db, user_branch_oid=user_branch_oid, area_manager_oid=area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )
        if allowed_branches is not None:
            if len(allowed_branches) == 0:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Cannot create visit plan: No branch access assigned to your account"
                )
            is_own = (
                (area_manager_oid is not None and employee.AREA_MANAGER_OID == area_manager_oid)
                or (employee.BRANCH in allowed_branches and (employee.AREA_MANAGER_OID is None or employee.AREA_MANAGER_OID == area_manager_oid))
            )
            if not is_own:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Cannot create visit plan for an employee belonging to another branch"
                )

        if employee.active != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee '{employee.name}' is inactive"
            )

        if employee.DESIGNATION != 19:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee '{employee.name}' is not a Field Officer (DESIGNATION = {employee.DESIGNATION})"
            )

        # Validate planning type requirements
        if payload.planning_type == "WEEKLY":
            if not payload.week_start_date or not payload.week_end_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="week_start_date and week_end_date are required for WEEKLY planning type"
                )
            if payload.week_start_date > payload.week_end_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="week_start_date must be less than or equal to week_end_date"
                )
        elif payload.planning_type == "MONTHLY":
            if not payload.planning_month or not payload.planning_year:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="planning_month and planning_year are required for MONTHLY planning type"
                )
            if payload.planning_month < 1 or payload.planning_month > 12:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="planning_month must be between 1 and 12"
                )
        elif payload.planning_type == "SINGLE":
            if not payload.visit_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="visit_date is required for SINGLE planning type"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="planning_type must be 'WEEKLY', 'MONTHLY', or 'SINGLE'"
            )

        # Create plan in repository
        plan = VisitRepository.create_assigned_plan(
            db=db,
            planning_type=payload.planning_type,
            employee_oid=payload.employee_oid,
            week_start_date=payload.week_start_date if payload.planning_type == "WEEKLY" else None,
            week_end_date=payload.week_end_date if payload.planning_type == "WEEKLY" else None,
            planning_month=payload.planning_month if payload.planning_type == "MONTHLY" else None,
            planning_year=payload.planning_year if payload.planning_type == "MONTHLY" else None,
            visit_date=payload.visit_date if payload.planning_type == "SINGLE" else None,
            created_by=created_by,
        )

        plan_detail = VisitRepository.get_plan_with_details(db, plan.oid)
        return PlanDetailResponse(data=PlanDetailData(**plan_detail))

    @staticmethod
    def get_plan_details(
        db: Session,
        plan_oid: int,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> PlanDetailResponse:
        """
        Get details of a single visit plan (DRAFT or PUBLISHED), scoped by area_manager_oid/branch.
        """
        VisitService._validate_plan_branch_access(
            db, plan_oid, user_branch_oid, area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )

        plan_detail = VisitRepository.get_plan_with_details(db, plan_oid)
        if not plan_detail:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visit plan with oid={plan_oid} not found"
            )
        return PlanDetailResponse(data=PlanDetailData(**plan_detail))

    @staticmethod
    def duplicate_plan(
        db: Session,
        plan_oid: int,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> PlanDetailResponse:
        """
        Duplicate an existing visit plan into a new DRAFT plan with copied site configurations.
        """
        VisitService._validate_plan_branch_access(
            db, plan_oid, user_branch_oid, area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )

        new_plan = VisitRepository.duplicate_plan(db, plan_oid)
        new_detail = VisitRepository.get_plan_with_details(db, new_plan.oid)
        return PlanDetailResponse(data=PlanDetailData(**new_detail))

    @staticmethod
    def update_plan_header(
        db: Session,
        plan_oid: int,
        payload: UpdatePlanHeaderRequest,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> PlanDetailResponse:
        """
        Update header fields of a DRAFT visit plan.
        """
        plan = VisitRepository.get_plan_by_oid(db, plan_oid)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visit plan with oid={plan_oid} not found"
            )

        # Cross-branch / Area Manager check on existing plan
        VisitService._validate_plan_branch_access(
            db, plan_oid, user_branch_oid, area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )

        if plan.status != "DRAFT":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot edit header of a {plan.status} plan. Only DRAFT plans can be edited."
            )

        # Validate new employee
        employee = db.query(Employee).filter(Employee.oid == payload.employee_oid).first()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee with oid={payload.employee_oid} not found"
            )

        # Cross-branch check on new employee
        allowed_branches = VisitRepository._resolve_allowed_branches(
            db, user_branch_oid=user_branch_oid, area_manager_oid=area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )
        if allowed_branches is not None:
            is_own = (
                (area_manager_oid is not None and employee.AREA_MANAGER_OID == area_manager_oid)
                or (employee.BRANCH in allowed_branches and (employee.AREA_MANAGER_OID is None or employee.AREA_MANAGER_OID == area_manager_oid))
            )
            if not is_own:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Cannot reassign visit plan to an employee belonging to an unassigned branch"
                )

        if employee.active != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee '{employee.name}' is inactive"
            )

        if employee.DESIGNATION != 19:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee '{employee.name}' is not a Field Officer (DESIGNATION = {employee.DESIGNATION})"
            )

        # Validate planning type requirements
        if payload.planning_type == "WEEKLY":
            if not payload.week_start_date or not payload.week_end_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="week_start_date and week_end_date are required for WEEKLY planning type"
                )
            if payload.week_start_date > payload.week_end_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="week_start_date must be less than or equal to week_end_date"
                )
        elif payload.planning_type == "MONTHLY":
            if not payload.planning_month or not payload.planning_year:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="planning_month and planning_year are required for MONTHLY planning type"
                )
            if payload.planning_month < 1 or payload.planning_month > 12:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="planning_month must be between 1 and 12"
                )
        elif payload.planning_type == "SINGLE":
            if not payload.visit_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="visit_date is required for SINGLE planning type"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="planning_type must be 'WEEKLY', 'MONTHLY', or 'SINGLE'"
            )

        VisitRepository.update_plan_header(
            db=db,
            plan_oid=plan_oid,
            planning_type=payload.planning_type,
            employee_oid=payload.employee_oid,
            week_start_date=payload.week_start_date if payload.planning_type == "WEEKLY" else None,
            week_end_date=payload.week_end_date if payload.planning_type == "WEEKLY" else None,
            planning_month=payload.planning_month if payload.planning_type == "MONTHLY" else None,
            planning_year=payload.planning_year if payload.planning_type == "MONTHLY" else None,
            visit_date=payload.visit_date if payload.planning_type == "SINGLE" else None,
        )

        updated_detail = VisitRepository.get_plan_with_details(db, plan_oid)
        return PlanDetailResponse(data=PlanDetailData(**updated_detail))

    @staticmethod
    def delete_plan(
        db: Session,
        plan_oid: int,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> GenericSuccessResponse:
        """
        Delete a DRAFT visit plan.
        """
        plan = VisitRepository.get_plan_by_oid(db, plan_oid)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visit plan with oid={plan_oid} not found"
            )

        VisitService._validate_plan_branch_access(
            db, plan_oid, user_branch_oid, area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )

        if plan.status != "DRAFT":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete a {plan.status} plan. Only DRAFT plans can be deleted."
            )

        code = plan.plan_code
        VisitRepository.delete_plan(db, plan_oid)
        return GenericSuccessResponse(
            message=f"Visit plan {code} (oid={plan_oid}) deleted successfully",
            status="success"
        )

    @staticmethod
    def add_site_to_plan(
        db: Session,
        plan_oid: int,
        payload: AddSiteToPlanRequest,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> ConfiguredSiteResponse:
        """
        Add a site to a DRAFT visit plan. For SINGLE plans, visit_frequency is forced to 1.
        """
        # Validate plan and branch access
        plan = VisitRepository.get_plan_by_oid(db, plan_oid)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visit plan with oid={plan_oid} not found"
            )

        VisitService._validate_plan_branch_access(
            db, plan_oid, user_branch_oid, area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )

        if plan.status != "DRAFT":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot add sites to a {plan.status} plan. Only DRAFT plans can be modified."
            )

        # Validate frequency (must be > 0)
        if payload.visit_frequency <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="visit_frequency must be a positive integer greater than 0"
            )

        # Validate site
        site = db.query(Site).filter(Site.oid == payload.site_oid).first()
        if not site:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Site with oid={payload.site_oid} not found"
            )

        # Cross-branch check on added site
        allowed_branches = VisitRepository._resolve_allowed_branches(
            db, user_branch_oid=user_branch_oid, area_manager_oid=area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )
        if allowed_branches is not None and site.BRANCH not in allowed_branches:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cannot add site '{site.name}' belonging to an unassigned branch to visit plan"
            )

        # Check duplicate
        existing_freq = VisitRepository.get_site_frequency_by_plan_and_site(db, plan_oid, payload.site_oid)
        if existing_freq:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Site '{site.name}' (oid={payload.site_oid}) is already added to this plan"
            )

        # For SINGLE plans, force frequency to 1 server-side
        effective_frequency = 1 if plan.planning_type == "SINGLE" else payload.visit_frequency

        site_data = VisitRepository.add_site_to_plan(
            db=db,
            plan_oid=plan_oid,
            site_oid=payload.site_oid,
            visit_frequency=effective_frequency
        )
        return ConfiguredSiteResponse(data=ConfiguredSiteItem(**site_data))

    @staticmethod
    def update_site_frequency(
        db: Session,
        plan_oid: int,
        frequency_oid: int,
        payload: UpdateSiteFrequencyRequest,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> ConfiguredSiteResponse:
        """
        Update visit frequency of a site in a DRAFT plan.
        """
        plan = VisitRepository.get_plan_by_oid(db, plan_oid)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visit plan with oid={plan_oid} not found"
            )

        VisitService._validate_plan_branch_access(
            db, plan_oid, user_branch_oid, area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )

        if plan.status != "DRAFT":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot modify sites in a {plan.status} plan. Only DRAFT plans can be modified."
            )

        if payload.visit_frequency <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="visit_frequency must be a positive integer greater than 0"
            )

        freq = VisitRepository.get_site_frequency_by_oid(db, frequency_oid)
        if not freq or freq.plan_oid != plan_oid:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Site frequency record with oid={frequency_oid} not found for plan_oid={plan_oid}"
            )

        effective_frequency = 1 if plan.planning_type == "SINGLE" else payload.visit_frequency

        updated_data = VisitRepository.update_site_frequency(
            db=db,
            frequency_oid=frequency_oid,
            visit_frequency=effective_frequency
        )
        return ConfiguredSiteResponse(data=ConfiguredSiteItem(**updated_data))

    @staticmethod
    def remove_site_from_plan(
        db: Session,
        plan_oid: int,
        frequency_oid: int,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> GenericSuccessResponse:
        """
        Remove a site configuration from a DRAFT plan.
        """
        plan = VisitRepository.get_plan_by_oid(db, plan_oid)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visit plan with oid={plan_oid} not found"
            )

        VisitService._validate_plan_branch_access(
            db, plan_oid, user_branch_oid, area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )

        if plan.status != "DRAFT":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot remove sites from a {plan.status} plan. Only DRAFT plans can be modified."
            )

        freq = VisitRepository.get_site_frequency_by_oid(db, frequency_oid)
        if not freq or freq.plan_oid != plan_oid:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Site frequency record with oid={frequency_oid} not found for plan_oid={plan_oid}"
            )

        VisitRepository.delete_site_frequency(db, frequency_oid)
        return GenericSuccessResponse(
            message=f"Site configuration oid={frequency_oid} removed from plan VP-{plan_oid}",
            status="success"
        )

    @staticmethod
    def publish_plan(
        db: Session,
        plan_oid: int,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> PlanDetailResponse:
        """
        Publish a DRAFT visit plan.
        """
        plan = VisitRepository.get_plan_by_oid(db, plan_oid)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visit plan with oid={plan_oid} not found"
            )

        VisitService._validate_plan_branch_access(
            db, plan_oid, user_branch_oid, area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )

        if plan.status == "PUBLISHED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Plan is already PUBLISHED"
            )

        # Check at least 1 registered site or custom visit location is configured
        plan_detail = VisitRepository.get_plan_with_details(db, plan_oid)
        sites = plan_detail.get("sites", []) if plan_detail else []
        custom_visits = plan_detail.get("custom_visits", []) if plan_detail else []

        if not sites and not custom_visits:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot publish an empty plan. At least one registered site or custom visit location is required."
            )

        # Check valid positive frequencies
        for site in sites:
            if site.get("visit_frequency", 0) <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Site '{site.get('site_name')}' has an invalid visit frequency of {site.get('visit_frequency')}"
                )

        for cv in custom_visits:
            if cv.get("visit_frequency", 0) <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Custom location '{cv.get('site_name')}' has an invalid visit frequency of {cv.get('visit_frequency')}"
                )

        VisitRepository.publish_plan(db, plan_oid)
        updated_detail = VisitRepository.get_plan_with_details(db, plan_oid)
        return PlanDetailResponse(data=PlanDetailData(**updated_detail))

    @staticmethod
    def unpublish_plan(
        db: Session,
        plan_oid: int,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> PlanDetailResponse:
        """
        Revert a PUBLISHED visit plan back to DRAFT state for editing.
        """
        plan = VisitRepository.get_plan_by_oid(db, plan_oid)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visit plan with oid={plan_oid} not found"
            )

        VisitService._validate_plan_branch_access(
            db, plan_oid, user_branch_oid, area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )

        VisitRepository.unpublish_plan(db, plan_oid)
        updated_detail = VisitRepository.get_plan_with_details(db, plan_oid)
        return PlanDetailResponse(data=PlanDetailData(**updated_detail))

    # --- Custom Visit (New Client/Site) Services ---

    @staticmethod
    def add_custom_visit_to_plan(
        db: Session,
        plan_oid: int,
        payload: CreateCustomVisitRequest,
        current_user: UserContext,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> CustomVisitSingleResponse:
        """
        Add a custom new client/site visit location to a DRAFT visit plan.
        """
        plan = VisitRepository.get_plan_by_oid(db, plan_oid)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visit plan with oid={plan_oid} not found"
            )

        officer = VisitService._validate_plan_branch_access(
            db, plan_oid, user_branch_oid, area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )

        if plan.status != "DRAFT":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot add custom visit locations to a {plan.status} plan. Only DRAFT plans can be modified."
            )

        # Validate manager is authorized for the requested branch
        current_user.validate_branch_access(payload.branch_oid)

        # Verify custom location's branch matches the Field Officer's applicable branch context
        allowed_branches = VisitRepository._resolve_allowed_branches(
            db, user_branch_oid=user_branch_oid, area_manager_oid=area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )
        if allowed_branches is not None and payload.branch_oid not in allowed_branches:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cannot add custom location belonging to an unassigned branch ({payload.branch_oid}) to visit plan"
            )

        if officer and officer.BRANCH is not None:
            officer_branches = [officer.BRANCH]
            if officer.AREA_MANAGER_OID is not None:
                mgr_allocs = VisitRepository._resolve_allowed_branches(db, area_manager_oid=officer.AREA_MANAGER_OID)
                if mgr_allocs:
                    officer_branches = mgr_allocs
            if payload.branch_oid not in officer_branches:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Custom location branch {payload.branch_oid} does not match the Field Officer's applicable branch context"
                )

        # Duplicate check 1: Exact matching site in permanent SITE + CLIENTT tables under this branch
        existing_site = (
            db.query(Site)
            .join(Client, Client.oid == Site.CLIENTT)
            .filter(
                Site.BRANCH == payload.branch_oid,
                func.lower(func.trim(Site.name)) == payload.site_name.strip().lower(),
                func.lower(func.trim(Client.name)) == payload.client_name.strip().lower()
            )
            .first()
        )
        if existing_site:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"An existing registered site '{existing_site.name}' already exists for client '{payload.client_name.strip()}' in branch {payload.branch_oid}. Please select the existing site instead of creating a custom location."
            )

        # Duplicate check 2: Already added to this visit plan
        existing_custom = (
            db.query(FieldOfficerNewClientVisits)
            .filter(
                FieldOfficerNewClientVisits.plan_oid == plan_oid,
                func.lower(func.trim(FieldOfficerNewClientVisits.client_name)) == payload.client_name.strip().lower(),
                func.lower(func.trim(FieldOfficerNewClientVisits.site_name)) == payload.site_name.strip().lower()
            )
            .first()
        )
        if existing_custom:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Custom location '{payload.site_name.strip()}' for client '{payload.client_name.strip()}' is already added to this plan"
            )

        # Force visit_frequency to 1 for SINGLE plans
        effective_freq = 1 if plan.planning_type == "SINGLE" else payload.visit_frequency

        # Server derives created_by from authenticated user context
        record = VisitRepository.add_custom_visit(
            db=db,
            plan_oid=plan_oid,
            branch_oid=payload.branch_oid,
            client_name=payload.client_name,
            site_name=payload.site_name,
            address=payload.address,
            latitude=payload.latitude,
            longitude=payload.longitude,
            visit_frequency=effective_freq,
            created_by=current_user.user_account_oid,
        )

        branch = db.query(Branch).filter(Branch.oid == record.branch_oid).first() if record.branch_oid else None
        branch_name = str(branch.name) if branch and getattr(branch, "name", None) is not None else None
        item = CustomVisitResponse(
            oid=record.oid,
            plan_oid=record.plan_oid,
            branch_oid=record.branch_oid,
            branch_name=branch_name,
            client_name=record.client_name,
            site_name=record.site_name,
            address=record.address,
            latitude=record.latitude,
            longitude=record.longitude,
            visit_frequency=record.visit_frequency,
            created_by=record.created_by,
            is_custom_location=True
        )
        return CustomVisitSingleResponse(data=item)

    @staticmethod
    def get_custom_visits_for_plan(
        db: Session,
        plan_oid: int,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> CustomVisitListResponse:
        """
        Retrieve all custom visit locations for a visit plan.
        """
        plan = VisitRepository.get_plan_by_oid(db, plan_oid)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visit plan with oid={plan_oid} not found"
            )

        VisitService._validate_plan_branch_access(
            db, plan_oid, user_branch_oid, area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )

        records = VisitRepository.get_custom_visits_by_plan(db, plan_oid)
        items = []
        for r in records:
            branch = db.query(Branch).filter(Branch.oid == r.branch_oid).first() if r.branch_oid else None
            branch_name = str(branch.name) if branch and getattr(branch, "name", None) is not None else None
            items.append(
                CustomVisitResponse(
                    oid=r.oid,
                    plan_oid=r.plan_oid,
                    branch_oid=r.branch_oid,
                    branch_name=branch_name,
                    client_name=r.client_name,
                    site_name=r.site_name,
                    address=r.address,
                    latitude=r.latitude,
                    longitude=r.longitude,
                    visit_frequency=r.visit_frequency,
                    created_by=r.created_by,
                    is_custom_location=True
                )
            )
        return CustomVisitListResponse(data=items, total=len(items))

    @staticmethod
    def remove_custom_visit_from_plan(
        db: Session,
        plan_oid: int,
        record_oid: int,
        user_branch_oid: Optional[int] = None,
        area_manager_oid: Optional[int] = None,
        allocated_branch_oids: Optional[List[int]] = None,
    ) -> GenericSuccessResponse:
        """
        Remove a custom visit location from a DRAFT visit plan.
        """
        plan = VisitRepository.get_plan_by_oid(db, plan_oid)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visit plan with oid={plan_oid} not found"
            )

        VisitService._validate_plan_branch_access(
            db, plan_oid, user_branch_oid, area_manager_oid, allocated_branch_oids=allocated_branch_oids
        )

        if plan.status != "DRAFT":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot remove custom visit locations from a {plan.status} plan. Only DRAFT plans can be modified."
            )

        record = VisitRepository.get_custom_visit_by_oid(db, record_oid)
        if not record or record.plan_oid != plan_oid:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Custom visit location with oid={record_oid} not found in plan {plan_oid}"
            )

        site_name = record.site_name
        VisitRepository.delete_custom_visit(db, record_oid)
        return GenericSuccessResponse(
            message=f"Custom visit location '{site_name}' (oid={record_oid}) removed successfully",
            status="success"
        )
