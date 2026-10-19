from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.dependencies.database import get_db
from app.dependencies.auth import get_current_user_context
from app.schemas.user_context import UserContext
from app.services.user_service import UserService

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserContext


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user with username (user_id or emp_code) and password from USER_CREDENTIALS."""
    user_context = UserService.authenticate_user(db, payload.username, payload.password)
    token = f"token_{user_context.user_id}"
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user=user_context
    )


@router.get("/me", response_model=UserContext)
def get_current_user(current_user: UserContext = Depends(get_current_user_context)):
    """Retrieve authenticated user context based on credentials / X-User-ID resolved from database."""
    return current_user
