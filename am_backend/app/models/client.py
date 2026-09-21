from sqlalchemy import Column, BigInteger, String
from app.database.database import Base

class Client(Base):
    __tablename__ = "CLIENTT"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    COMPANY = Column(BigInteger, nullable=True)
    name = Column(String(100), nullable=False)
    address = Column(String(150), nullable=True)
    directory_name = Column(String(200), nullable=True)
    company_vender_code = Column(String(45), nullable=True)
