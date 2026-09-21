from enum import Enum

class RoleType(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    FIELD_OFFICER = "field_officer"
    AREA_MANAGER = "qrda_areamanager"
