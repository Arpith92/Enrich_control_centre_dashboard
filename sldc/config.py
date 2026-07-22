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
    scada_mongodb_uri: str = os.getenv("SCADA_MONGODB_URI", "")
    scada_mongodb_database: str = os.getenv("SCADA_MONGODB_DATABASE", "")
    scada_site_collections: str = os.getenv("SCADA_SITE_COLLECTIONS", "{}")
    scada_site_databases: str = os.getenv("SCADA_SITE_DATABASES", "{}")
    scada_power_to_mw: float = float(os.getenv("SCADA_POWER_TO_MW", "0.001"))
    scada_generation_to_mwh: float = float(os.getenv("SCADA_GENERATION_TO_MWH", "0.001"))
    scada_max_age_seconds: int = int(os.getenv("SCADA_MAX_AGE_SECONDS", "300"))
    scada_refresh_seconds: int = int(os.getenv("SCADA_REFRESH_SECONDS", "60"))
    allow_sqlite_fallback: bool = _bool("ALLOW_SQLITE_FALLBACK", True)
    sqlite_path: Path = BASE_DIR / os.getenv("SQLITE_PATH", "enrich_solar.db")
    # Bind locally by default so the address shown by Uvicorn is directly
    # usable in a browser. Docker sets API_HOST=0.0.0.0 explicitly.
    api_host: str = os.getenv("API_HOST", "127.0.0.1")
    api_port: int = int(os.getenv("API_PORT", "10002"))
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    log_path: Path = BASE_DIR / "logs" / "enrich_solar.log"
    tesseract_cmd: str = os.getenv("TESSERACT_CMD", "/usr/bin/tesseract")


settings = Settings()
