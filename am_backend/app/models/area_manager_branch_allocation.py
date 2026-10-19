from sqlalchemy import Column, BigInteger
from app.database.database import Base


class AreaManagerBranchAllocation(Base):
    __tablename__ = "AREA_MANAGER_BRANCH_ALLOCATION"

    STAFF_OID = Column(BigInteger, primary_key=True, nullable=False)
    BRANCH_OID = Column(BigInteger, primary_key=True, nullable=False)
