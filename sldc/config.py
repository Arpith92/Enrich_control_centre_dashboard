"""Application configuration loaded from environment or a local .env file."""
from dataclasses import dataclass
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    sldc_url: str = os.getenv("SLDC_URL", "https://mahasldc.in/scada/reports/mvrreport8")
    refresh_seconds: float = float(os.getenv("REFRESH_SECONDS", "5"))
    sample_minutes: int = int(os.getenv("SAMPLE_MINUTES", "15"))
    page_load_timeout: int = int(os.getenv("PAGE_LOAD_TIMEOUT", "15"))
    sql_connection_string: str = os.getenv("SQL_CONNECTION_STRING", "")
    mongodb_uri: str = os.getenv("MONGODB_URI", "")
    mongodb_database: str = os.getenv("MONGODB_DATABASE", "enrich_db")
    mongodb_collection: str = os.getenv("MONGODB_COLLECTION", "SLDC_DB")
    allow_sqlite_fallback: bool = _bool("ALLOW_SQLITE_FALLBACK", True)
    sqlite_path: Path = BASE_DIR / os.getenv("SQLITE_PATH", "enrich_solar.db")
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("API_PORT", "5173"))
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    log_path: Path = BASE_DIR / "logs" / "enrich_solar.log"
    tesseract_cmd: str = os.getenv("TESSERACT_CMD", r"C:\Program Files\Tesseract-OCR\tesseract.exe")


settings = Settings()
