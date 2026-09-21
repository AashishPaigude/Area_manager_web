import logging
import logging.config
import sys
from pathlib import Path
from app.config.settings import settings

# Ensure the logs directory exists at the root of the backend directory (outside app/)
LOGS_DIR = Path(__file__).resolve().parent.parent.parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)
LOG_FILE = LOGS_DIR / "app.log"


def setup_logging():
    """
    Sets up the central logging system for the application.
    """
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    
    logging_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "[%(asctime)s] %(levelname)s in %(module)s (%(filename)s:%(lineno)d): %(message)s",
            },
            "detailed": {
                "format": "[%(asctime)s] %(levelname)s [%(name)s:%(filename)s:%(lineno)d] - %(message)s",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "stream": sys.stdout,
                "formatter": "default",
                "level": log_level,
            },
            "file": {
                "class": "logging.handlers.RotatingFileHandler",
                "filename": str(LOG_FILE),
                "maxBytes": 10 * 1024 * 1024,  # 10MB
                "backupCount": 5,
                "formatter": "detailed",
                "level": log_level,
                "encoding": "utf-8",
            },
        },
        "loggers": {
            "": {  # Root logger
                "handlers": ["console", "file"],
                "level": log_level,
            },
            "sqlalchemy.engine": {
                "handlers": ["console", "file"],
                "level": logging.WARNING,  # Set to WARNING by default to avoid cluttering logs
                "propagate": False,
            },
        },
    }
    
    logging.config.dictConfig(logging_config)

# Create an exportable logger utility
logger = logging.getLogger("app")
