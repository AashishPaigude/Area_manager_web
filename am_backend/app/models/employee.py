from sqlalchemy import Column, BigInteger, String, Date, SmallInteger, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.database.database import Base

class Employee(Base):
    __tablename__ = "EMPLOYEE"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    BRANCH = Column(BigInteger, nullable=True)
    DESIGNATION = Column(BigInteger, nullable=True)
    SITE = Column(BigInteger, ForeignKey("SITE.oid"), nullable=True)
    emp_code = Column(String(45), unique=True, nullable=True)
    name = Column(String(100), nullable=False)
    mobile = Column(String(12), nullable=True)
    email = Column(String(45), nullable=True)
    gender = Column(String(45), nullable=True)
    date_of_joining = Column(Date, nullable=True)
    date_of_leaving = Column(Date, nullable=True)
    reason_of_leaving = Column(String(45), nullable=True)
    active = Column(SmallInteger, default=1, nullable=True)
    LAST_ATTENDANCE = Column(BigInteger, nullable=True)
    app_registered = Column(SmallInteger, default=0, nullable=True)
    COMPANY_DESIGNATION = Column(BigInteger, nullable=True)
    EMPLOYEE_PERSON = Column(BigInteger, nullable=True)
    COMPANY = Column(BigInteger, nullable=True)
    track_history_enabled = Column(SmallInteger, default=1, nullable=False)

    # Relationships within the Area Manager application scope
    site = relationship("Site", back_populates="employees")
    assignments = relationship("FieldOfficerAssignment", back_populates="employee")
    attendances = relationship("EmployeeAttendance", back_populates="employee")
    daily_summaries = relationship("FieldOfficerDailySummary", back_populates="employee")
