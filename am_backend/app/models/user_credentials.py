from sqlalchemy import Column, BigInteger, String, SmallInteger, ForeignKey
from app.database.database import Base


class UserCredentials(Base):
    __tablename__ = "USER_CREDENTIALS"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    user_account_oid = Column(BigInteger, ForeignKey("USER_ACCOUNT.oid"), nullable=False, unique=True, index=True)
    user_id = Column(String(45), nullable=False, index=True)
    password = Column(String(255), nullable=False)
    is_active = Column(SmallInteger, nullable=False, default=1)
