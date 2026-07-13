"""Continuous, drift-free scraping loop with reconnect and exponential retry."""
import threading
import time
from datetime import datetime
from .database import db
from .scraper import SLDCScraper
from .config import settings
from .logger import get_logger

log = get_logger(__name__)


class Collector:
    def __init__(self):
        self.stop_event = threading.Event()
        self.thread = None

    def start(self):
        if self.thread and self.thread.is_alive():
            return
        self.stop_event.clear()
        self.thread = threading.Thread(target=self.run, name="sldc-collector", daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=20)

    def run(self):
        scraper, failures = SLDCScraper(), 0
        latest = {}
        last_sample_slot = None
        while not self.stop_event.is_set():
            cycle = time.monotonic()
            try:
                readings = scraper.collect()
                for item in readings:
                    latest[item.plant_name] = item
                    if db.insert_if_changed(item):
                        log.info("stored change: %s MW=%s status=%s", item.plant_name, item.current_mw, item.msldc_status)
                slot = db.sample_slot(datetime.now())
                if slot != last_sample_slot and latest:
                    stored = db.save_samples(list(latest.values()))
                    log.info("stored %d station sample(s) for %s in SLDC_DB", stored, slot)
                    last_sample_slot = slot
                failures = 0
            except Exception:
                failures += 1
                log.exception("collection failure (attempt %d); browser will reconnect", failures)
                scraper.close()
            delay = max(0.0, settings.refresh_seconds - (time.monotonic() - cycle)) if not failures else min(60, 2 ** min(failures, 6))
            self.stop_event.wait(delay)
        scraper.close()


collector = Collector()
