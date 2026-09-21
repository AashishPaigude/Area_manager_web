from typing import List, Optional
from pydantic import BaseModel

class BranchEmailAccessItem(BaseModel):
    oid: int
    name: str
    short_name: Optional[str] = None
    address: Optional[str] = None
    email_access: bool
    field_officer_count: int

    class Config:
        from_attributes = True

class ReportEmailAccessSummary(BaseModel):
    enabled_count: int
    disabled_count: int
    total_count: int

class ReportEmailAccessResponse(BaseModel):
    summary: ReportEmailAccessSummary
    branches: List[BranchEmailAccessItem]

class UpdateEmailAccessRequest(BaseModel):
    email_access: bool

class UpdateEmailAccessResponse(BaseModel):
    success: bool
    message: str
    branch_oid: int
    email_access: bool
