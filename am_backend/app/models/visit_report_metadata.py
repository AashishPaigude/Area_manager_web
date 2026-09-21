from sqlalchemy import Column, BigInteger, String, Date, DateTime, func
from app.database.database import Base


class VisitReportMetadata(Base):
    __tablename__ = "VISIT_REPORT_METADATA"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    employee_oid = Column(BigInteger, nullable=False)
    officer = Column(String(255), nullable=False)
    report_type = Column(String(20), nullable=False)
    report_oid = Column(String(255), nullable=False)
    site_id = Column(BigInteger, nullable=False)
    visit_date = Column(Date, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
