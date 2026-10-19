from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.visits import router as visits_router
from app.api.v1.tracking import router as tracking_router
from app.api.v1.attendance import router as attendance_router
from app.api.v1.reports import router as reports_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.admin import router as admin_router
from app.api.v1.auth import router as auth_router

api_router = APIRouter()

api_router.include_router(health_router, prefix="/health", tags=["Health"])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["Dashboard"])
api_router.include_router(visits_router, prefix="/visits", tags=["Visits"])
api_router.include_router(tracking_router, prefix="/tracking", tags=["Tracking"])
api_router.include_router(attendance_router, prefix="/attendance", tags=["Attendance"])
api_router.include_router(reports_router, prefix="/reports", tags=["Reports"])
api_router.include_router(analytics_router, prefix="/analytics", tags=["Analytics"])
api_router.include_router(admin_router, prefix="/admin", tags=["Admin"])
api_router.include_router(auth_router, prefix="/auth", tags=["Auth"])

