from typing import Optional
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
import logging

from app.dependencies.database import get_db
from app.schemas.user_context import UserContext
from app.services.user_service import UserService

logger = logging.getLogger(__name__)


def get_current_user_context(
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    db: Session = Depends(get_db),
) -> UserContext:
    """FastAPI Security Dependency to resolve the current user identity & branch context from X-User-ID header.

    Rules:
    - X-User-ID is mandatory.
    - Missing or empty/whitespace X-User-ID header -> HTTP 401 Unauthorized.
    - Unknown user identity -> HTTP 401 Unauthorized.
    - Never defaults to Admin if header is missing or invalid.
    """
    if not x_user_id or not x_user_id.strip():
        logger.warning("Authentication request failed: X-User-ID header missing or empty.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication header X-User-ID",
        )

    clean_user_id = x_user_id.strip()

    try:
        return UserService.get_user_context_by_user_id(db, clean_user_id)
    except HTTPException as e:
        # Convert 404 (Not Found) to 401 (Unauthorized) for invalid user identity
        if e.status_code == status.HTTP_404_NOT_FOUND:
            logger.warning(f"Authentication request failed: User identity '{clean_user_id}' not found.")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid user identity '{clean_user_id}'",
            )
        raise e
