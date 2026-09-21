from sqlalchemy import Column, BigInteger, String, Double, SmallInteger, ForeignKey
from sqlalchemy.orm import relationship
from app.database.database import Base

class SiteGateQrcode(Base):
    __tablename__ = "SITE_GATE_QRCODE"

    oid = Column(BigInteger, primary_key=True, autoincrement=True)
    gate_name = Column(String(150), nullable=False)
    latitude = Column(Double, nullable=True)
    longitude = Column(Double, nullable=True)
    radius = Column(Double, nullable=False, default=300.0)
    calibration = Column(SmallInteger, nullable=False, default=1)
    SITE = Column(BigInteger, ForeignKey("SITE.oid"), nullable=False)

    site = relationship("Site", back_populates="gate_qrcodes")
