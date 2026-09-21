from typing import Generator
from sqlalchemy.orm import Session
from app.database.database import SessionLocal

def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a database session.
    Ensures that the connection is closed after the request completes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
