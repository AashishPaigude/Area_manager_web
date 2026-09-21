from sqlalchemy import Column, BigInteger, SmallInteger, DateTime, String, func
from app.database.database import Base

class FieldOfficerTrackHistoryConfig(Base):
    __tablename__ = "FIELD_OFFICER_TRACK_HISTORY_CONFIG"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    employee_oid = Column(BigInteger, nullable=False, index=True)
    is_enabled = Column(SmallInteger, nullable=False, default=1)
    effective_from = Column(DateTime, nullable=False)
    effective_to = Column(DateTime, nullable=True)
    updated_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=True)
