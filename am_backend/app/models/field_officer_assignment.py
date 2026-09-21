from sqlalchemy import Column, BigInteger, Integer, Date, Time, DateTime, ForeignKey, func, text
from sqlalchemy.orm import relationship
from app.database.database import Base

class FieldOfficerAssignment(Base):
    __tablename__ = "field_officer_assignment"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    employee_id = Column(BigInteger, ForeignKey("EMPLOYEE.oid"), nullable=False)
    site_id = Column(BigInteger, ForeignKey("SITE.oid"), nullable=False)
    assignment_date = Column(Date, nullable=False)
    visit_order = Column(Integer, default=1, nullable=False)
    planned_arrival = Column(Time, nullable=True)
    planned_departure = Column(Time, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=True)
    updated_at = Column(
        DateTime, 
        server_default=text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"), 
        nullable=True
    )

    # Relationships within the Area Manager application scope
    employee = relationship("Employee", back_populates="assignments")
    site = relationship("Site", back_populates="assignments")
