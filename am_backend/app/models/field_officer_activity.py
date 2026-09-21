from sqlalchemy import Column, BigInteger, String, DateTime, Text, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database.database import Base

class FieldOfficerActivity(Base):
    __tablename__ = "field_officer_visit_activity"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    visit_id = Column(BigInteger, ForeignKey("field_officer_visit.oid"), nullable=False)
    activity_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    activity_time = Column(DateTime, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=True)

    # Relationships within the Area Manager application scope
    visit = relationship("FieldOfficerVisit", back_populates="activities")
