from enum import Enum

class VisitStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    MISSED = "missed"
