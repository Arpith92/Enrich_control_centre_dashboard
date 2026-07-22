"""Read-only aggregation of the latest per-inverter SCADA values from MongoDB."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import logging
import os
import re
import threading
import time
from zoneinfo import ZoneInfo

from pymongo.errors import ConfigurationError

from .config import settings

log = logging.getLogger(__name__)
TAG_RE = re.compile(r"^INV(?:ERTER)?[_ -]?(\d{1,2})[_ -](ActivePower|Cumulative[_ -]Generation)$", re.I)
DETAIL_TAG_RE = re.compile(
    r"^INV(?:ERTER)?[_ -]?(\d{1,2})[_ -](ActivePower|Daily[_ -]Generation|Cumulative[_ -]Generation)$", re.I,
)
TIME_KEYS = ("timestamp_IST", "timestamp", "Timestamp", "time", "Time", "datetime", "DateTime", "createdAt", "updatedAt")


def _json_mapping(raw: str) -> dict:
    try:
        value = json.loads(raw or "{}")
        return value if isinstance(value, dict) else {}
    except (TypeError, json.JSONDecodeError):
        log.warning("Invalid SCADA JSON mapping; ignoring it")
        return {}


def site_configuration() -> dict[str, dict]:
    collections = _json_mapping(settings.scada_site_collections)
    databases = _json_mapping(settings.scada_site_databases)
    names = set(collections) | set(databases)
    # Simple per-site variables are convenient in .env and override JSON mappings.
    for key, value in os.environ.items():
        match = re.fullmatch(r"SCADA_(.+)_COLLECTIONS", key)
        if match and key != "SCADA_SITE_COLLECTIONS":
            names.add(match.group(1).replace("_", " ").title())
    result = {}
    for name in names:
        env_key = re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")
        raw = os.getenv(f"SCADA_{env_key}_COLLECTIONS")
        configured = raw.split(",") if raw is not None else collections.get(name, [])
        if isinstance(configured, str):
            configured = configured.split(",")
        collection_names = [str(item).strip() for item in configured if str(item).strip()]
        database = os.getenv(f"SCADA_{env_key}_DATABASE", databases.get(name, settings.scada_mongodb_database))
        if collection_names:
            result[name] = {"database": database, "collections": collection_names}
    return result


def _number(value):
    if isinstance(value, dict):
        for key in ("value", "Value", "val", "reading"):
            if key in value:
                return _number(value[key])
        return None
    if isinstance(value, bool):
        return None
    try:
        number = float(str(value).replace(",", "").strip())
        return number if number == number else None
    except (TypeError, ValueError):
        return None


def extract_inverter_values(document: dict) -> dict[str, dict[int, float]]:
    values = {"active_power": {}, "cumulative_generation": {}}

    def visit(node):
        if isinstance(node, dict):
            # Also accept common {tag/name: ..., value: ...} SCADA record shapes.
            tag = next((node.get(key) for key in ("tag", "Tag", "tagName", "TagName", "name", "Name") if node.get(key)), None)
            if tag:
                consume(str(tag), next((node.get(key) for key in ("value", "Value", "val", "reading") if key in node), None))
            for key, value in node.items():
                consume(str(key), value)
                if isinstance(value, (dict, list)):
                    visit(value)
        elif isinstance(node, list):
            for item in node:
                visit(item)

    def consume(tag, raw):
        match = TAG_RE.fullmatch(tag.strip())
        if not match:
            return
        inverter = int(match.group(1))
        if not 1 <= inverter <= 20:
            return
        number = _number(raw)
        if number is None:
            return
        kind = "active_power" if match.group(2).lower() == "activepower" else "cumulative_generation"
        values[kind][inverter] = number

    visit(document)
    return values


def _document_time(document: dict):
    for key in TIME_KEYS:
        value = document.get(key)
        if isinstance(value, datetime):
            if value.tzinfo:
                return value
            zone = ZoneInfo("Asia/Kolkata") if key == "timestamp_IST" else timezone.utc
            return value.replace(tzinfo=zone)
        if isinstance(value, str):
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if parsed.tzinfo:
                    return parsed
                zone = ZoneInfo("Asia/Kolkata") if key == "timestamp_IST" else timezone.utc
                return parsed.replace(tzinfo=zone)
            except ValueError:
                pass
    object_id = document.get("_id")
    return getattr(object_id, "generation_time", None)


def _serializable_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


class ScadaRealtimeReader:
    def __init__(self):
        self.client = None
        self._details_cache = {}
        self._details_expires = 0.0
        self._details_lock = threading.Lock()

    def _client(self):
        if not settings.scada_mongodb_uri:
            return None
        if self.client is None:
            from pymongo import MongoClient
            self.client = MongoClient(settings.scada_mongodb_uri, serverSelectionTimeoutMS=5000, connectTimeoutMS=5000)
        return self.client

    def latest(self) -> dict:
        configured = site_configuration()
        if not settings.scada_mongodb_uri or not configured:
            return {"configured": False, "sites": [], "message": "SCADA MongoDB is not configured"}
        client = self._client()
        try:
            uri_database = client.get_default_database().name
        except (AttributeError, TypeError, ConfigurationError):
            uri_database = ""
        now = datetime.now(timezone.utc)
        sites = []
        for site, config in configured.items():
            power, generation, power_inverters, generation_inverters, inverter_total, timestamps, errors = 0.0, 0.0, set(), set(), 0, [], []
            database_name = config["database"] or uri_database
            if not database_name:
                sites.append({
                    "name": site, "live": False, "currentMw": None,
                    "cumulativeGenerationMWh": None, "inverterCount": 0,
                    "collectionCount": len(config["collections"]), "timestamp": None,
                    "errors": ["Database missing: include it in SCADA_MONGODB_URI"],
                })
                continue
            for collection_name in config["collections"]:
                try:
                    # Deliberately read-only: this client is never passed to the SLDC writer.
                    document = client[database_name][collection_name].find_one(sort=[("_id", -1)])
                    if not document:
                        continue
                    timestamp = _document_time(document)
                    if timestamp:
                        timestamps.append(timestamp)
                        if (now - timestamp.astimezone(timezone.utc)).total_seconds() > settings.scada_max_age_seconds:
                            continue
                    values = extract_inverter_values(document)
                    power += sum(values["active_power"].values())
                    generation += sum(values["cumulative_generation"].values())
                    power_inverters.update(values["active_power"])
                    generation_inverters.update(values["cumulative_generation"])
                    inverter_total += len(set(values["active_power"]) | set(values["cumulative_generation"]))
                except Exception as exc:  # isolate one inaccessible collection from the rest of a site
                    errors.append(f"{collection_name}: {exc}")
            sites.append({
                "name": site,
                "live": bool(power_inverters),
                "communicationIssue": not bool(power_inverters),
                "sampleType": "1-minute average",
                "currentMw": round(power * settings.scada_power_to_mw, 3) if power_inverters else None,
                "cumulativeGenerationMWh": round(generation * settings.scada_generation_to_mwh, 3) if generation_inverters else None,
                "inverterCount": inverter_total,
                "collectionCount": len(config["collections"]),
                "timestamp": max(timestamps).isoformat() if timestamps else None,
                "errors": errors,
            })
        return {"configured": True, "sites": sites}

    def site_details(self, requested_site: str) -> dict | None:
        configured = site_configuration()
        site = next((name for name in configured if name.casefold() == requested_site.casefold()), None)
        if not site or not settings.scada_mongodb_uri:
            return None
        now_monotonic = time.monotonic()
        if self._details_cache.get("name") == site and now_monotonic < self._details_expires:
            return self._details_cache
        # Automatic refresh and a user click can arrive together. Only one request
        # should fan out to the nine cloud collections for each one-minute sample.
        with self._details_lock:
            now_monotonic = time.monotonic()
            if self._details_cache.get("name") == site and now_monotonic < self._details_expires:
                return self._details_cache
            return self._load_site_details(site, configured[site])

    def _load_site_details(self, site: str, config: dict) -> dict:
        client = self._client()
        try:
            uri_database = client.get_default_database().name
        except (AttributeError, TypeError, ConfigurationError):
            uri_database = ""
        database_name = config["database"] or uri_database
        if not database_name:
            return {"name": site, "plants": [], "error": "SCADA database is not configured"}

        def read_plant(collection_name):
            try:
                document = client[database_name][collection_name].find_one(sort=[("_id", -1)])
                if not document:
                    return {"collection": collection_name, "name": _plant_name(collection_name), "available": False}
                timestamp = _document_time(document)
                inverters: dict[int, dict] = {}
                parameters = {}
                raw_tags = {str(key): _serializable_value(raw) for key, raw in document.items()}
                for key, raw in document.items():
                    if key == "_id" or key in TIME_KEYS:
                        continue
                    match = DETAIL_TAG_RE.fullmatch(str(key))
                    if match and 1 <= int(match.group(1)) <= 20:
                        inverter = inverters.setdefault(int(match.group(1)), {"inverter": int(match.group(1))})
                        value = _number(raw)
                        kind = match.group(2).lower().replace(" ", "_").replace("-", "_")
                        if kind == "activepower":
                            inverter["activePowerMw"] = round(value * settings.scada_power_to_mw, 3) if value is not None else None
                        elif kind == "daily_generation":
                            inverter["dailyGenerationMWh"] = round(value * settings.scada_generation_to_mwh, 3) if value is not None else None
                        else:
                            inverter["cumulativeGenerationMWh"] = round(value * settings.scada_generation_to_mwh, 3) if value is not None else None
                    elif isinstance(raw, (str, int, float, bool)) or raw is None:
                        parameters[key] = raw
                rows = [inverters[number] for number in sorted(inverters)]
                return {
                    "collection": collection_name,
                    "name": _plant_name(collection_name),
                    "available": bool(rows),
                    "timestamp": timestamp.isoformat() if timestamp else None,
                    "parameters": parameters,
                    "rawTags": raw_tags,
                    "inverters": rows,
                    "currentMw": round(sum(row.get("activePowerMw") or 0 for row in rows), 3),
                    "dailyGenerationMWh": round(sum(row.get("dailyGenerationMWh") or 0 for row in rows), 3),
                    "cumulativeGenerationMWh": round(sum(row.get("cumulativeGenerationMWh") or 0 for row in rows), 3),
                }
            except Exception as exc:
                log.warning("Bhokar SCADA collection %s unavailable: %s", collection_name, exc)
                return {
                    "collection": collection_name, "name": _plant_name(collection_name),
                    "available": False, "error": "Cloud SCADA temporarily unavailable; retrying on the next one-minute refresh",
                }

        with ThreadPoolExecutor(max_workers=min(4, len(config["collections"]))) as executor:
            plants = list(executor.map(read_plant, config["collections"]))

        previous = {plant["collection"]: plant for plant in self._details_cache.get("plants", [])}
        for index, plant in enumerate(plants):
            if not plant.get("available") and plant["collection"] in previous and previous[plant["collection"]].get("available"):
                retained = dict(previous[plant["collection"]])
                retained["stale"] = True
                plants[index] = retained
            elif plant.get("available"):
                plant["stale"] = False

        result = {
            "name": site,
            "timestamp": max((plant.get("timestamp") for plant in plants if plant.get("timestamp")), default=None),
            "currentMw": round(sum(plant.get("currentMw") or 0 for plant in plants), 3),
            "dailyGenerationMWh": round(sum(plant.get("dailyGenerationMWh") or 0 for plant in plants), 3),
            "cumulativeGenerationMWh": round(sum(plant.get("cumulativeGenerationMWh") or 0 for plant in plants), 3),
            "plants": plants,
        }
        if any(plant.get("available") for plant in plants):
            self._details_cache = result
            self._details_expires = time.monotonic() + max(5, settings.scada_refresh_seconds - 5)
        return result


def _plant_name(collection_name: str) -> str:
    name = re.sub(r"^B\d+[_ -]*", "", collection_name, flags=re.I)
    return re.sub(r"[_-]+", " ", name).strip() or collection_name


scada_reader = ScadaRealtimeReader()
