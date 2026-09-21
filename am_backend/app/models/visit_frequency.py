from sqlalchemy import Column, BigInteger, Integer, DateTime, ForeignKey, func, text
from sqlalchemy.orm import relationship
from app.database.database import Base


class FieldOfficerVisitFrequency(Base):
    __tablename__ = "FIELD_OFFICER_VISIT_FREQUENCY"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    plan_oid = Column(BigInteger, ForeignKey("FIELD_OFFICER_ASSIGNED_VISITS.oid"), nullable=False)
    site_oid = Column(BigInteger, ForeignKey("SITE.oid"), nullable=False)
    visit_frequency = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, server_default=func.now(), nullable=True)
    updated_at = Column(
        DateTime,
        server_default=text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        nullable=True
    )

    # Relationships
    assigned_visit = relationship("FieldOfficerAssignedVisits", back_populates="frequencies")
    site = relationship("Site")
