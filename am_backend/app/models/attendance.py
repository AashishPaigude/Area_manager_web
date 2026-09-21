from sqlalchemy import Column, BigInteger, String, Date, ForeignKey
from sqlalchemy.orm import relationship
from app.database.database import Base

class EmployeeAttendance(Base):
    __tablename__ = "employee_attendance"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    duty_date = Column(Date, nullable=False)
    status = Column(String(45), nullable=True)
    EMPLOYEE = Column(BigInteger, ForeignKey("EMPLOYEE.oid"), nullable=True)
    BRANCH = Column(BigInteger, nullable=True)
    SITE = Column(BigInteger, nullable=True)
    EMPLOYEE_SITE = Column(BigInteger, ForeignKey("SITE.oid"), nullable=True)

    # Relationships within the Area Manager application scope
    employee = relationship("Employee", back_populates="attendances")
    employee_site = relationship("Site", back_populates="attendances")
