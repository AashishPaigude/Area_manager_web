from sqlalchemy import Column, BigInteger, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship, synonym
from app.database.database import Base


class FieldOfficerVisit(Base):
    __tablename__ = "field_officer_visit"

    oid = Column(BigInteger, primary_key=True, autoincrement=True, index=True)
    employee_id = Column(BigInteger, ForeignKey("EMPLOYEE.oid"), nullable=False, index=True)
    site_id = Column(BigInteger, ForeignKey("SITE.oid"), nullable=False, index=True)
    check_in_time = Column(DateTime, nullable=False)
    check_out_time = Column(DateTime, nullable=True)
    visit_type = Column(String(50), nullable=True)
    status = Column(String(50), nullable=True)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    activities = relationship("FieldOfficerActivity", back_populates="visit")
    checklists = relationship("FieldOfficerChecklist", back_populates="visit")
    evidences = relationship("FieldOfficerEvidence", back_populates="visit")


class SiteVisitSession(Base):
    __tablename__ = "SITE_VISIT_SESSIONS"

    oid = Column(Integer, primary_key=True, autoincrement=True, index=True)
    Employee = Column(Integer, nullable=False, index=True)
    site_id = Column(Integer, nullable=True, index=True)
    site_name = Column(String(255), nullable=True)
    
    # Real database columns in SITE_VISIT_SESSIONS
    check_in_time = Column(DateTime, nullable=True, index=True)
    check_out_time = Column(DateTime, nullable=True)
    
    # Synonyms for start_time and end_time
    start_time = synonym("check_in_time")
    end_time = synonym("check_out_time")

    duration_minutes = Column(Float, nullable=True)
    status = Column(String(50), nullable=False)
    raw_points_count = Column(Integer, nullable=False)
    entry_latitude = Column(Float, nullable=False)
    entry_longitude = Column(Float, nullable=False)
    exit_latitude = Column(Float, nullable=True)
    exit_longitude = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=True)

    employee = relationship(
        "Employee",
        primaryjoin="foreign(SiteVisitSession.Employee) == Employee.oid",
        uselist=False
    )
    site = relationship(
        "Site",
        primaryjoin="foreign(SiteVisitSession.site_id) == Site.oid",
        uselist=False
    )
