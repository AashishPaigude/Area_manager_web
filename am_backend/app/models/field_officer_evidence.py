from sqlalchemy import Column, BigInteger, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database.database import Base

class FieldOfficerEvidence(Base):
    __tablename__ = "field_officer_visit_evidence"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    visit_id = Column(BigInteger, ForeignKey("field_officer_visit.oid"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_path = Column(String(255), nullable=False)
    uploaded_time = Column(DateTime, server_default=func.now(), nullable=True)

    # Relationships within the Area Manager application scope
    visit = relationship("FieldOfficerVisit", back_populates="evidences")
