from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.dependencies.database import get_db
from app.dependencies.auth import get_current_user_context
from app.schemas.user_context import UserContext
from app.schemas.visit import (
    FieldOfficerListResponse,
    BranchListResponse,
    ClientListResponse,
    SiteListResponse,
    CreatePlanRequest,
    UpdatePlanHeaderRequest,
    AddSiteToPlanRequest,
    UpdateSiteFrequencyRequest,
    ConfiguredSiteResponse,
    PlanDetailResponse,
    PlanSummaryListResponse,
    GenericSuccessResponse,
)
from app.services.visit_service import VisitService

router = APIRouter()


# --- Step 1 Master Data Read APIs ---

@router.get("/field-officers", response_model=FieldOfficerListResponse)
def get_field_officers(
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> FieldOfficerListResponse:
    """
    Retrieve active Field Officers scoped to user branch context.
    """
    return VisitService.get_field_officers(db, user_branch_oid=current_user.branch_oid)


@router.get("/branches", response_model=BranchListResponse)
def get_branches(
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> BranchListResponse:
    """
    Retrieve branches scoped to user branch context.
    """
    return VisitService.get_branches(db, user_branch_oid=current_user.branch_oid)


@router.get("/clients", response_model=ClientListResponse)
def get_clients(
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> ClientListResponse:
    """
    Retrieve clients scoped to user branch context.
    """
    return VisitService.get_clients(db, user_branch_oid=current_user.branch_oid)


@router.get("/sites", response_model=SiteListResponse)
def get_sites(
    branch_oid: Optional[int] = Query(None, description="Optional Branch OID filter"),
    client_oid: Optional[int] = Query(None, description="Optional Client OID filter"),
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> SiteListResponse:
    """
    Retrieve sites from the SITE table scoped to user branch context.
    """
    return VisitService.get_sites(
        db,
        branch_oid=branch_oid,
        client_oid=client_oid,
        user_branch_oid=current_user.branch_oid
    )


# --- Step 2 & Step 4 Visit Plan Management APIs ---

@router.get("/plans", response_model=PlanSummaryListResponse)
def list_visit_plans(
    planning_type: Optional[str] = Query(None, description="Filter by WEEKLY or MONTHLY"),
    employee_oid: Optional[int] = Query(None, description="Filter by Field Officer OID"),
    status: Optional[str] = Query(None, description="Filter by DRAFT or PUBLISHED"),
    search: Optional[str] = Query(None, description="Search plan_code or Field Officer name"),
    planning_month: Optional[int] = Query(None, description="Filter MONTHLY plans by month (1-12)"),
    planning_year: Optional[int] = Query(None, description="Filter MONTHLY plans by year"),
    week_start_date: Optional[date] = Query(None, description="Filter WEEKLY plans by start date"),
    week_end_date: Optional[date] = Query(None, description="Filter WEEKLY plans by end date"),
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> PlanSummaryListResponse:
    """
    Retrieve visit plans scoped to user branch context.
    """
    return VisitService.list_plans(
        db=db,
        planning_type=planning_type,
        employee_oid=employee_oid,
        status_filter=status,
        search=search,
        planning_month=planning_month,
        planning_year=planning_year,
        week_start_date=week_start_date,
        week_end_date=week_end_date,
        user_branch_oid=current_user.branch_oid
    )


@router.post("/plans", response_model=PlanDetailResponse, status_code=status.HTTP_201_CREATED)
def create_visit_plan(
    payload: CreatePlanRequest,
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> PlanDetailResponse:
    """
    Create a new DRAFT visit plan for a Field Officer in user's branch.
    """
    return VisitService.create_plan(db=db, payload=payload, user_branch_oid=current_user.branch_oid)


@router.get("/plans/{plan_oid}", response_model=PlanDetailResponse)
def get_visit_plan(
    plan_oid: int,
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> PlanDetailResponse:
    """
    Retrieve single visit plan details scoped to user branch context.
    """
    return VisitService.get_plan_details(db=db, plan_oid=plan_oid, user_branch_oid=current_user.branch_oid)


@router.put("/plans/{plan_oid}", response_model=PlanDetailResponse)
def update_visit_plan_header(
    plan_oid: int,
    payload: UpdatePlanHeaderRequest,
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> PlanDetailResponse:
    """
    Update header fields of a DRAFT visit plan with branch validation.
    """
    return VisitService.update_plan_header(
        db=db, plan_oid=plan_oid, payload=payload, user_branch_oid=current_user.branch_oid
    )


@router.delete("/plans/{plan_oid}", response_model=GenericSuccessResponse)
def delete_visit_plan(
    plan_oid: int,
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> GenericSuccessResponse:
    """
    Delete a DRAFT visit plan with branch validation.
    """
    return VisitService.delete_plan(db=db, plan_oid=plan_oid, user_branch_oid=current_user.branch_oid)


@router.post("/plans/{plan_oid}/duplicate", response_model=PlanDetailResponse, status_code=status.HTTP_201_CREATED)
def duplicate_visit_plan(
    plan_oid: int,
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> PlanDetailResponse:
    """
    Duplicate an existing plan with branch validation.
    """
    return VisitService.duplicate_plan(db=db, plan_oid=plan_oid, user_branch_oid=current_user.branch_oid)


@router.post("/plans/{plan_oid}/sites", response_model=ConfiguredSiteResponse, status_code=status.HTTP_201_CREATED)
def add_site_to_plan(
    plan_oid: int,
    payload: AddSiteToPlanRequest,
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> ConfiguredSiteResponse:
    """
    Add a site to a DRAFT visit plan with branch validation.
    """
    return VisitService.add_site_to_plan(
        db=db, plan_oid=plan_oid, payload=payload, user_branch_oid=current_user.branch_oid
    )


@router.put("/plans/{plan_oid}/sites/{frequency_oid}", response_model=ConfiguredSiteResponse)
def update_site_frequency(
    plan_oid: int,
    frequency_oid: int,
    payload: UpdateSiteFrequencyRequest,
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> ConfiguredSiteResponse:
    """
    Update visit frequency for a site in a DRAFT plan with branch validation.
    """
    return VisitService.update_site_frequency(
        db=db,
        plan_oid=plan_oid,
        frequency_oid=frequency_oid,
        payload=payload,
        user_branch_oid=current_user.branch_oid
    )


@router.delete("/plans/{plan_oid}/sites/{frequency_oid}", response_model=GenericSuccessResponse)
def remove_site_from_plan(
    plan_oid: int,
    frequency_oid: int,
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> GenericSuccessResponse:
    """
    Remove a site configuration from a DRAFT plan with branch validation.
    """
    return VisitService.remove_site_from_plan(
        db=db,
        plan_oid=plan_oid,
        frequency_oid=frequency_oid,
        user_branch_oid=current_user.branch_oid
    )


@router.put("/plans/{plan_oid}/publish", response_model=PlanDetailResponse)
def publish_visit_plan(
    plan_oid: int,
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> PlanDetailResponse:
    """
    Publish a DRAFT visit plan with branch validation.
    """
    return VisitService.publish_plan(db=db, plan_oid=plan_oid, user_branch_oid=current_user.branch_oid)


@router.put("/plans/{plan_oid}/unpublish", response_model=PlanDetailResponse)
def unpublish_visit_plan(
    plan_oid: int,
    current_user: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db)
) -> PlanDetailResponse:
    """
    Revert a PUBLISHED visit plan to DRAFT with branch validation.
    """
    return VisitService.unpublish_plan(db=db, plan_oid=plan_oid, user_branch_oid=current_user.branch_oid)

