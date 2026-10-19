from sqlalchemy import Column, BigInteger, String, Date, SmallInteger, DateTime, Enum, ForeignKey, func, text
from sqlalchemy.orm import relationship
from app.database.database import Base


class FieldOfficerAssignedVisits(Base):
    __tablename__ = "FIELD_OFFICER_ASSIGNED_VISITS"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    plan_code = Column(String(20), nullable=True)
    planning_type = Column(Enum("WEEKLY", "MONTHLY", "SINGLE", name="planning_type_enum"), nullable=False)
    week_start_date = Column(Date, nullable=True)
    week_end_date = Column(Date, nullable=True)
    planning_month = Column(SmallInteger, nullable=True)
    planning_year = Column(SmallInteger, nullable=True)
    visit_date = Column(Date, nullable=True)
    employee_oid = Column(BigInteger, ForeignKey("EMPLOYEE.oid"), nullable=False)
    planning_method = Column(Enum("MANUAL", name="planning_method_enum"), default="MANUAL", nullable=False)
    status = Column(Enum("DRAFT", "PUBLISHED", name="status_enum"), default="DRAFT", nullable=False)
    created_by = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=True)
    updated_at = Column(
        DateTime,
        server_default=text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        nullable=True
    )

    # Relationships
    employee = relationship("Employee")
    frequencies = relationship("FieldOfficerVisitFrequency", back_populates="assigned_visit", cascade="all, delete-orphan")
    custom_visits = relationship("FieldOfficerNewClientVisits", back_populates="assigned_visit", cascade="all, delete-orphan")
