from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy.sql import text
from app.dependencies.database import get_db
from app.core.logging import logger
from fastapi.responses import JSONResponse

router = APIRouter()

@router.get("")
def health_check(db: Session = Depends(get_db)):
    """
    Checks database connection health dynamically without crashing startup.
    """
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy"}
    except Exception as e:
        logger.error(f"Health check failed: database connection error: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy"}
        )
