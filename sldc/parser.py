"""Convert DOM/OCR observations into normalized Enrich station readings."""
from __future__ import annotations
from dataclasses import dataclass, asdict
from datetime import datetime
import re


@dataclass
class Reading:
    plant_name: str
    installed_capacity: float | None
    current_mw: float | None
    font_color: str
    msldc_status: str
    dashboard_status: str
    timestamp: datetime

    def as_dict(self):
        return asdict(self)


COLOR_STATUS = {
    "green": ("Current", "Live Data", "#008000"),
    "cyan": ("Manually Substituted", "Site Down / Manual Data", "#00FFFF"),
    "red": ("Non-Current", "Communication Failure", "#FF0000"),
    "white": ("Invalid", "Site Down / Invalid", "#FFFFFF"),
}

# Exact station names used by the portal. Keeping the portal spelling as the canonical
# value prevents similarly named Enrich rows from being assigned to the wrong asset.
TARGET_STATIONS = (
    ("ENRICH KARASGI", "ENRICH KARASGI", 47.75),
    ("ENRICH MANDRUP", "ENRICH MANDRUP", 47.75),
    ("ENRICH ENERGY LTD SOLAR PARK", "ENRICH ENERGY LTD SOLAR PARK", 25.0),
    ("ENRICH TULJAPUR", "ENRICH TULJAPUR", 100.0),
    ("ENRICH ENERGY HIRADGAON", "ENRICH ENERGY HIRADGAON", 50.0),
    ("ENRICH ENERGY BHOKAR", "ENRICH ENERGY BHOKAR", 25.0),
    ("ENRICH SOLAR SERVICES (NARWAT)", "ENRICH SOLAR SERVICES (Narwat)", 25.0),
)


def _rgb(value: str) -> tuple[int, int, int]:
    value = (value or "").strip().lower()
    nums = re.findall(r"\d+", value)
    if value.startswith("#") and len(value) in (4, 7):
        value = value.lstrip("#")
        if len(value) == 3:
            value = "".join(c * 2 for c in value)
        return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))
    return tuple(map(int, nums[:3])) if len(nums) >= 3 else (255, 255, 255)


def normalize_color(value: str) -> tuple[str, str, str]:
    r, g, b = _rgb(value)
    # Nearest semantic color tolerates anti-aliasing and Bootstrap's #198754/#dc3545.
    references = {"green": (0, 128, 0), "cyan": (0, 255, 255), "red": (255, 0, 0), "white": (255, 255, 255)}
    name = min(references, key=lambda n: sum((a - b_) ** 2 for a, b_ in zip((r, g, b), references[n])))
    return COLOR_STATUS[name]


def number(value: str) -> float | None:
    cleaned = re.sub(r"[^0-9.\-]", "", value or "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def reading(name: str, ic: str, mw: str, color: str, timestamp: datetime) -> Reading | None:
    if "ENRICH" not in name.upper() and "NRICH" not in name.upper():
        return None
    # OCR may attach a table border/serial glyph immediately before the keyword.
    name = "ENRICH" + re.split(r"E?NRICH", name, maxsplit=1, flags=re.IGNORECASE)[1]
    normalized = " ".join(name.upper().split())
    target = next(((label, capacity) for portal_name, label, capacity in TARGET_STATIONS
                   if normalized == portal_name), None)
    # The dot-matrix OCR sometimes drops Narwat's parentheses or the location itself.
    # This tolerance applies only to the uniquely named portal row, never to other sites.
    if not target and normalized.startswith("ENRICH SOLAR SERVICES"):
        target = next((label, capacity) for portal_name, label, capacity in TARGET_STATIONS
                      if portal_name == "ENRICH SOLAR SERVICES (NARWAT)")
    if not target:
        return None
    status, dashboard, canonical = normalize_color(color)
    current = number(mw)
    # The report is one-decimal MW. A faint decimal can be dropped by OCR (e.g. 3718
    # for 37.18); constrain only clearly impossible readings using the target capacity.
    if current is not None:
        while current > target[1] * 1.5:
            current /= 10
        current = round(current, 1)
    return Reading(target[0], target[1], current, canonical, status, dashboard, timestamp)
