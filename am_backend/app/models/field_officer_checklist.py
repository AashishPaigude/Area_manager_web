from sqlalchemy import Column, BigInteger, Integer, String, Text, ForeignKey, func, DateTime
from sqlalchemy.orm import relationship
from app.database.database import Base

class FieldOfficerChecklist(Base):
    __tablename__ = "field_officer_visit_checklist"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    visit_id = Column(BigInteger, ForeignKey("field_officer_visit.oid"), nullable=False)
    question = Column(String(255), nullable=False)
    answer = Column(String(255), nullable=True)
    remarks = Column(Text, nullable=True)
    sequence = Column(Integer, default=1, nullable=False)
    mandatory_flag = Column(Integer, default=0, nullable=False)  # tinyint(1) mapping
    checklist_status = Column(String(20), default="answered", nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=True)

    # Relationships within the Area Manager application scope
    visit = relationship("FieldOfficerVisit", back_populates="checklists")
