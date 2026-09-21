from sqlalchemy import Column, BigInteger, String, Double, SmallInteger, Text
from sqlalchemy.orm import relationship
from app.database.database import Base

class Site(Base):
    __tablename__ = "SITE"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False)
    short_name = Column(String(10), nullable=True)
    unit_code = Column(String(45), nullable=True)
    
    # Foreign keys referencing tables outside of Area Manager application scope
    BRANCH = Column(BigInteger, nullable=True)
    CLIENTT = Column(BigInteger, nullable=True)
    STATEE = Column(BigInteger, nullable=True)

    # Relationships to other models inside Area Manager module scope
    employees = relationship("Employee", back_populates="site")
    assignments = relationship("FieldOfficerAssignment", back_populates="site")
    attendances = relationship("EmployeeAttendance", back_populates="employee_site")
    gate_qrcodes = relationship("SiteGateQrcode", back_populates="site")
