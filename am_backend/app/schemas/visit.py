from datetime import date, datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, ConfigDict, Field


# --- Step 1 Master Data Schemas ---

class FieldOfficerItem(BaseModel):
    oid: int
    name: str
    emp_code: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class FieldOfficerListResponse(BaseModel):
    data: List[FieldOfficerItem]


class BranchItem(BaseModel):
    oid: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class BranchListResponse(BaseModel):
    data: List[BranchItem]


class ClientItem(BaseModel):
    oid: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class ClientListResponse(BaseModel):
    data: List[ClientItem]


class SiteItem(BaseModel):
    oid: int
    name: str
    branch_oid: Optional[int] = None
    client_oid: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class SiteListResponse(BaseModel):
    data: List[SiteItem]


# --- Visit Plan Management Schemas ---

class CreatePlanRequest(BaseModel):
    planning_type: Literal["WEEKLY", "MONTHLY", "SINGLE"]
    week_start_date: Optional[date] = None
    week_end_date: Optional[date] = None
    planning_month: Optional[int] = Field(None, ge=1, le=12)
    planning_year: Optional[int] = Field(None, ge=2020, le=2100)
    visit_date: Optional[date] = None
    employee_oid: int
    planning_method: Literal["MANUAL"] = "MANUAL"


class UpdatePlanHeaderRequest(BaseModel):
    planning_type: Literal["WEEKLY", "MONTHLY", "SINGLE"]
    week_start_date: Optional[date] = None
    week_end_date: Optional[date] = None
    planning_month: Optional[int] = Field(None, ge=1, le=12)
    planning_year: Optional[int] = Field(None, ge=2020, le=2100)
    visit_date: Optional[date] = None
    employee_oid: int


class AddSiteToPlanRequest(BaseModel):
    site_oid: int
    visit_frequency: int = Field(..., gt=0, description="Visit frequency must be a positive integer > 0")


class UpdateSiteFrequencyRequest(BaseModel):
    visit_frequency: int = Field(..., gt=0, description="Visit frequency must be a positive integer > 0")


class ConfiguredSiteItem(BaseModel):
    frequency_oid: int
    site_oid: int
    site_name: str
    branch_oid: Optional[int] = None
    branch_name: Optional[str] = None
    client_oid: Optional[int] = None
    client_name: Optional[str] = None
    visit_frequency: int
    visits_done: int = 0

    model_config = ConfigDict(from_attributes=True)


class ConfiguredSiteResponse(BaseModel):
    data: ConfiguredSiteItem


class PlanDetailData(BaseModel):
    oid: int
    plan_code: str
    planning_type: str
    week_start_date: Optional[date] = None
    week_end_date: Optional[date] = None
    planning_month: Optional[int] = None
    planning_year: Optional[int] = None
    visit_date: Optional[date] = None
    employee_oid: int
    field_officer_name: Optional[str] = None
    planning_method: str = "MANUAL"
    status: str = "DRAFT"
    total_sites: int = 0
    total_visits: int = 0
    visits_done: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    sites: List[ConfiguredSiteItem] = []

    model_config = ConfigDict(from_attributes=True)


class PlanDetailResponse(BaseModel):
    data: PlanDetailData


class PlanSummaryItem(BaseModel):
    oid: int
    plan_code: str
    planning_type: str
    week_start_date: Optional[date] = None
    week_end_date: Optional[date] = None
    planning_month: Optional[int] = None
    planning_year: Optional[int] = None
    visit_date: Optional[date] = None
    employee_oid: int
    field_officer_name: Optional[str] = None
    planning_method: str = "MANUAL"
    status: str
    total_sites: int = 0
    total_visits: int = 0
    visits_done: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PlanSummaryListResponse(BaseModel):
    data: List[PlanSummaryItem]


class GenericSuccessResponse(BaseModel):
    message: str
    status: str = "success"
