from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.sql import text
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.core.logging import setup_logging, logger
from app.core.exceptions import register_exception_handlers
from app.database.database import engine
from app.dependencies.database import get_db
from app.api.v1 import api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    setup_logging()
    logger.info("Initializing Area Manager Backend...")
    yield
    # Shutdown logic
    logger.info("Shutting down Area Manager Backend...")

app = FastAPI(
    title=settings.APP_NAME,
    description="FastAPI Backend for the Area Manager Application",
    version="1.0.0",
    lifespan=lifespan,
    debug=(settings.ENVIRONMENT == "development")
)

# Set debug property in app.extra so exception handlers can dynamically adapt formatting
app.extra["debug"] = (settings.ENVIRONMENT == "development")

# Configure CORS
# Uses the list of origins loaded from .env plus local LAN IP regex
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register centralized exception handlers
register_exception_handlers(app)

# Include v1 API routes
app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def read_root():
    return {
        "message": "Area Manager Backend Running"
    }

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    """
    Checks database connection health dynamically.
    """
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy"}
    except Exception as e:
        logger.error(f"Root health check failed: database connection error: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy"}
        )

