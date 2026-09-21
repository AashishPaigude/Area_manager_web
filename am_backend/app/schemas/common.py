from typing import Any, Generic, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")

class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Any] = None

class ApiResponse(BaseModel, Generic[T]):
    """
    Standardized response structure for all backend APIs.
    """
    success: bool
    data: Optional[T] = None
    error: Optional[ErrorDetail] = None

class SuccessResponse(ApiResponse[T]):
    """
    Standardized successful response.
    """
    success: bool = True

class ErrorResponse(ApiResponse[None]):
    """
    Standardized error response.
    """
    success: bool = False
    error: ErrorDetail
