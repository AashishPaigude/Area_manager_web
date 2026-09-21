from sqlalchemy import Column, BigInteger, Integer, Date, DateTime, Numeric, ForeignKey, func, text, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database.database import Base

class FieldOfficerDailySummary(Base):
    __tablename__ = "field_officer_daily_summary"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    employee_id = Column(BigInteger, ForeignKey("EMPLOYEE.oid"), nullable=False)
    date = Column(Date, nullable=False)
    working_hours = Column(Numeric(5, 2), default=0.00, nullable=False)
    distance_travelled = Column(Numeric(6, 2), default=0.00, nullable=False)
    completed_visits = Column(Integer, default=0, nullable=False)
    missed_visits = Column(Integer, default=0, nullable=False)
    time_spent = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=True)
    updated_at = Column(
        DateTime, 
        server_default=text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"), 
        nullable=True
    )

    __table_args__ = (
        UniqueConstraint("employee_id", "date", name="uq_summary_emp_date"),
    )

    # Relationships within the Area Manager application scope
    employee = relationship("Employee", back_populates="daily_summaries")
