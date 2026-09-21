from sqlalchemy import Column, BigInteger, String, SmallInteger
from app.database.database import Base

class Branch(Base):
    __tablename__ = "BRANCH"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    COMPANY = Column(BigInteger, nullable=True)
    name = Column(String(50), nullable=False)
    short_name = Column(String(10), nullable=True)
    address = Column(String(100), nullable=True)
    email_access = Column(SmallInteger, default=0, nullable=False)
