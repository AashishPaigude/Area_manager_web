from sqlalchemy import Column, BigInteger, String, Integer, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from app.database.database import Base


class FieldOfficerNewClientVisits(Base):
    __tablename__ = "FIELD_OFFICER_NEW_CLIENT_VISITS"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    plan_oid = Column(BigInteger, ForeignKey("FIELD_OFFICER_ASSIGNED_VISITS.oid", ondelete="CASCADE"), nullable=False)
    branch_oid = Column(BigInteger, ForeignKey("BRANCH.oid"), nullable=False)
    client_name = Column(String(100), nullable=False)
    site_name = Column(String(100), nullable=False)
    address = Column(String(255), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    visit_frequency = Column(Integer, nullable=False, default=1)
    created_by = Column(BigInteger, nullable=True)

    # Relationships
    assigned_visit = relationship("FieldOfficerAssignedVisits", back_populates="custom_visits")
    branch = relationship("Branch")
