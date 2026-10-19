from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional, Literal, Any
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator, ValidationInfo


# --- Step 1 Master Data Schemas ---

class FieldOfficerItem(BaseModel):
    oid: int
    name: str
    emp_code: Optional[str] = None
    branch_oid: Optional[int] = Field(None, validation_alias="BRANCH")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


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


# --- Custom Visit (New Client/Site) Schemas ---

class CreateCustomVisitRequest(BaseModel):
    branch_oid: int
    client_name: str = Field(..., min_length=1, max_length=100)
    site_name: str = Field(..., min_length=1, max_length=100)
    address: Optional[str] = Field(None, max_length=255)
    latitude: Optional[Decimal] = Field(None, ge=Decimal("-90.0"), le=Decimal("90.0"))
    longitude: Optional[Decimal] = Field(None, ge=Decimal("-180.0"), le=Decimal("180.0"))
    visit_frequency: int = Field(default=1, gt=0, description="Visit frequency must be a positive integer > 0")

    @field_validator("client_name", "site_name", mode="before")
    @classmethod
    def validate_and_normalize_name(cls, v: Any, info: ValidationInfo) -> str:
        if v is None or not isinstance(v, str) or not v.strip():
            raise ValueError(f"{info.field_name} cannot be empty or contain only whitespace")
        v_stripped = v.strip()
        if len(v_stripped) > 100:
            raise ValueError(f"{info.field_name} must be at most 100 characters")
        return v_stripped

    @field_validator("address", mode="before")
    @classmethod
    def normalize_address(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        if not isinstance(v, str):
            raise ValueError("address must be a string")
        v_stripped = v.strip()
        if not v_stripped:
            return None
        if len(v_stripped) > 255:
            raise ValueError("address must be at most 255 characters")
        return v_stripped

    @model_validator(mode="after")
    def validate_coordinates(self):
        lat = self.latitude
        lon = self.longitude
        if (lat is None and lon is not None) or (lat is not None and lon is None):
            raise ValueError("Coordinates must be supplied together or both omitted.")
        return self


class CustomVisitResponse(BaseModel):
    oid: int
    plan_oid: int
    branch_oid: int
    branch_name: Optional[str] = None
    client_name: str
    site_name: str
    address: Optional[str] = None
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    visit_frequency: int
    created_by: Optional[int] = None
    is_custom_location: bool = True

    model_config = ConfigDict(from_attributes=True)


class CustomVisitSingleResponse(BaseModel):
    data: CustomVisitResponse


class CustomVisitListResponse(BaseModel):
    data: List[CustomVisitResponse]
    total: int


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
    created_by: Optional[int] = None
    plan_creator_type: Literal["SELF", "MANAGER"] = "SELF"
    creator_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    sites: List[ConfiguredSiteItem] = []
    custom_visits: List[CustomVisitResponse] = []

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
    branch_oid: Optional[int] = None
    planning_method: str = "MANUAL"
    status: str
    total_sites: int = 0
    total_visits: int = 0
    visits_done: int = 0
    created_by: Optional[int] = None
    plan_creator_type: Literal["SELF", "MANAGER"] = "SELF"
    creator_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PlanSummaryListResponse(BaseModel):
    data: List[PlanSummaryItem]


class GenericSuccessResponse(BaseModel):
    message: str
    status: str = "success"
