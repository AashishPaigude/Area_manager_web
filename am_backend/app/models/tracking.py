from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.orm import relationship, foreign
from app.database.database import Base

class LiveGuardLocation(Base):
    __tablename__ = "live_guard_locations"

    tracking_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    empOid = Column(Integer, unique=True, index=True, nullable=False)
    attendance_log_id = Column(Integer, nullable=True)
    siteOid = Column(Integer, index=True, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    gps_accuracy = Column(Float, nullable=True)
    tracking_interval = Column(Integer, nullable=True)
    tracking_started_at = Column(DateTime, nullable=True)
    last_location_update = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    speed = Column(Float, default=0.0, nullable=True)
    battery = Column(Integer, nullable=True)


class GpsLocationLog(Base):
    __tablename__ = "GPS_LOCATION_LOGS"

    oid = Column(Integer, primary_key=True, autoincrement=True, index=True)
    Employee = Column(Integer, nullable=False, index=True)
    shift_id = Column(Integer, nullable=True, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    accuracy = Column(Float, nullable=True)
    speed = Column(Float, nullable=True)
    battery_level = Column(Float, nullable=True)
    recorded_at = Column(DateTime, nullable=True, index=True)

    employee = relationship(
        "Employee",
        primaryjoin="foreign(GpsLocationLog.Employee) == Employee.oid",
        uselist=False
    )

