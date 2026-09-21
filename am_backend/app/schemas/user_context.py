from typing import Optional, Union
from pydantic import BaseModel, ConfigDict
from app.enums.role_type import RoleType


class UserContext(BaseModel):
    """Authenticated user context schema for authorization and branch scoping."""

    model_config = ConfigDict(from_attributes=True)

    user_account_oid: int
    user_id: str
    name: str
    app_role: Union[RoleType, str]
    branch_oid: Optional[int] = None
