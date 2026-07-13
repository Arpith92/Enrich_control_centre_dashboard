"""Rotating file and console logging."""
import logging
from logging.handlers import RotatingFileHandler
from .config import settings


def get_logger(name: str) -> logging.Logger:
    log = logging.getLogger(name)
    if log.handlers:
        return log
    settings.log_path.parent.mkdir(parents=True, exist_ok=True)
    log.setLevel(settings.log_level.upper())
    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s")
    file_handler = RotatingFileHandler(settings.log_path, maxBytes=5_000_000, backupCount=5)
    stream_handler = logging.StreamHandler()
    for handler in (file_handler, stream_handler):
        handler.setFormatter(formatter)
        log.addHandler(handler)
    return log

