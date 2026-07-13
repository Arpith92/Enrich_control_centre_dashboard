"""Headless Selenium collector with DOM-table and current JPEG-report support."""
from __future__ import annotations
from datetime import datetime
from io import BytesIO
import hashlib
from html import unescape
import os
import re
import time
import requests
from urllib.parse import urljoin
from PIL import Image, ImageChops, ImageFilter, ImageOps
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from .config import settings
from .logger import get_logger
from .parser import Reading, reading

log = get_logger(__name__)


DOM_SCRIPT = r"""
const clean = s => (s || '').trim();
const tables = [...document.querySelectorAll('table')];
return tables.flatMap(table => {
  const headers = [...table.querySelectorAll('thead th')].map(x => clean(x.innerText).toLowerCase());
  const idx = names => headers.findIndex(h => names.some(n => h.includes(n)));
  const ni=idx(['station','plant']), ii=idx(['installed','ic']), mi=idx(['current mw','mw']), ti=idx(['timestamp','time']);
  if (ni < 0 || mi < 0) return [];
  return [...table.querySelectorAll('tbody tr')].map(row => {
    const c=[...row.querySelectorAll('td')]; if (!c[ni] || !clean(c[ni].innerText).toUpperCase().includes('ENRICH')) return null;
    const mw=c[mi]; return {name:clean(c[ni].innerText),ic:ii>=0?clean(c[ii].innerText):'',mw:clean(mw.innerText),
      color:getComputedStyle(mw).color,time:ti>=0?clean(c[ti].innerText):''};
  }).filter(Boolean);
});
"""


class SLDCScraper:
    def __init__(self):
        self.driver = None
        self.http = requests.Session()
        self._last_report_digest = None

    def start(self):
        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        options.page_load_strategy = "eager"
        options.add_experimental_option("prefs", {"profile.managed_default_content_settings.images": 1})
        chrome_binary = os.getenv("CHROME_BINARY")
        chromedriver_path = os.getenv("CHROMEDRIVER_PATH")
        if chrome_binary:
            options.binary_location = chrome_binary
        service = Service(chromedriver_path) if chromedriver_path else Service()
        self.driver = webdriver.Chrome(service=service, options=options)
        self.driver.set_page_load_timeout(settings.page_load_timeout)
        self.driver.get(settings.sldc_url)

    def close(self):
        if self.driver:
            self.driver.quit()
            self.driver = None

    def collect(self) -> list[Reading]:
        started = time.perf_counter()
        observed = datetime.now()
        src = self._report_image_url()
        if src:
            content = self._download(src)
            digest = hashlib.sha256(content).digest()
            if digest == self._last_report_digest:
                log.info("report image unchanged; skipped OCR in %.3fs", time.perf_counter() - started)
                return []
            result = self._ocr_report(content, observed)
            # Only remember the image after a successful parse, so a transient OCR
            # failure is retried on the next polling cycle.
            self._last_report_digest = digest
        else:
            # Keep DOM/Selenium support as a fallback if MSLDC changes the report
            # back from its current static JPEG to an HTML telemetry table.
            if not self.driver:
                self.start()
            self.driver.refresh()
            WebDriverWait(self.driver, settings.page_load_timeout).until(
                lambda d: d.execute_script("return document.readyState") in ("interactive", "complete"))
            rows = self.driver.execute_script(DOM_SCRIPT)
            if not rows:
                raise RuntimeError("No SCADA table or report image found")
            result = [r for x in rows if (r := reading(
                x["name"], x["ic"], x["mw"], x["color"], self._time(x["time"], observed)))]
        log.info("cycle extracted %d Enrich station(s) in %.3fs", len(result), time.perf_counter() - started)
        return result

    def _report_image_url(self) -> str:
        """Discover the current JPEG without launching a browser."""
        response = self.http.get(settings.sldc_url, params={"_": int(time.time() * 1000)},
                                 timeout=settings.page_load_timeout,
                                 headers={"Cache-Control": "no-cache, no-store, max-age=0",
                                          "Pragma": "no-cache"})
        response.raise_for_status()
        match = re.search(
            r"<img\b(?=[^>]*\breport-image\b)[^>]*\bsrc\s*=\s*['\"]([^'\"]+)['\"]",
            response.text, re.IGNORECASE)
        return urljoin(settings.sldc_url, unescape(match.group(1))) if match else ""

    def _download(self, url: str) -> bytes:
        # A cache-buster prevents proxy/browser cache from serving stale telemetry.
        response = self.http.get(url, params={"_": int(time.time() * 1000)}, timeout=8,
                                 headers={"Referer": settings.sldc_url,
                                          "Cache-Control": "no-cache, no-store, max-age=0",
                                          "Pragma": "no-cache"})
        response.raise_for_status()
        return response.content

    @staticmethod
    def _time(value: str, fallback: datetime) -> datetime:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y.%m.%d - %H:%M", "%Y.%m.%d %H:%M"):
            try:
                return datetime.strptime(value.strip(), fmt)
            except ValueError:
                pass
        return fallback

    def _ocr_report(self, content: bytes, fallback_time: datetime) -> list[Reading]:
        import pytesseract
        if settings.tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd
        image = Image.open(BytesIO(content)).convert("RGB")
        w, h = image.size
        # Some report JPEGs contain a large white tail. Determine the actual report bottom first.
        ink = ImageOps.invert(ImageOps.grayscale(image)).point(lambda p: 255 if p > 12 else 0)
        content_box = ink.getbbox()
        content_bottom = content_box[3] if content_box else h
        stamp_crop = image.crop((0, int(content_bottom*.88), int(w*.50), content_bottom))
        stamp_crop = ImageOps.autocontrast(ImageOps.grayscale(stamp_crop)).resize(
            (stamp_crop.width * 2, stamp_crop.height * 2))
        stamp_text = pytesseract.image_to_string(stamp_crop, config="--psm 6")
        # The report currently prints an em dash, which Tesseract preserves. Accept
        # any non-numeric separator between the date and time rather than replacing
        # the real report time with the later collection time.
        match = re.search(r"(20\d\d)[.\-/](\d\d)[.\-/](\d\d)\D+(\d\d):(\d\d)", stamp_text)
        stamp = datetime(*map(int, match.groups())) if match else fallback_time
        # OCR only station-name columns. Enlarging these narrow panels makes the tiny raster font
        # reliable and remains much faster than enlarging/OCRing the complete 2K report.
        # Each report panel has a different station-column width. Ratios are measured
        # from the ruled IC/MW boundaries, not inferred from total panel width.
        panels = [
            (.094, .264, .209, .2273),
            (.264, .419, .3571, .3848),
            (.419, .601, .5465, .5662),
            (.601, .770, .7076, .7253),
            (.770, .922, .8737, .8889),
        ]
        result, seen = [], set()
        for panel_index, (left_ratio, right_ratio, ic_ratio, mw_ratio) in enumerate(panels):
            left, right = int(left_ratio*w), int(right_ratio*w)
            panel_w = right - left
            # Crop slightly inside the ruled IC/MW cells so vertical borders are not read as "1".
            ic_left, mw_left = int(ic_ratio*w), int(mw_ratio*w)
            top, bottom, scale = int(content_bottom*.07), int(content_bottom*.90), 3
            station_crop = image.crop((left+int(panel_w*.08), top, ic_left, bottom))
            enlarged = ImageOps.autocontrast(ImageOps.grayscale(station_crop)).resize(
                (station_crop.width*scale, station_crop.height*scale))
            data = pytesseract.image_to_data(enlarged, config="--psm 11", output_type=pytesseract.Output.DICT)
            lines = {}
            for i, text in enumerate(data["text"]):
                if not text.strip():
                    continue
                key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
                lines.setdefault(key, []).append(i)
            for indexes in lines.values():
                words = [data["text"][i].strip() for i in indexes]
                if not any("ENRICH" in word.upper() or "NRICH" in word.upper() for word in words):
                    continue
                name = " ".join(words)
                y_top = min(data["top"][i] for i in indexes)/scale + top
                y_bottom = max(data["top"][i]+data["height"][i] for i in indexes)/scale + top
                center = int((y_top+y_bottom)/2)
                # Panel four has especially tight rows; use a single-row crop there.
                # Other panels need a taller crop for the small dot-matrix digits.
                numeric_center = center + 3 if panel_index == 3 else center
                half_height = 7 if panel_index == 3 else max(12, int((y_bottom-y_top)*1.2))
                y0, y1 = max(0, numeric_center-half_height), min(content_bottom, numeric_center+half_height)
                # Installed capacities are mapped from the canonical station list.
                # OCRing this very narrow column can merge the serial number with IC
                # (for example Tuljapur 100 becoming 1100), so it is not used.
                ic = ""
                left_inset = 9 if panel_index == 3 else 5
                # Do not inset the right edge. Wide final digits (notably 6 and 9)
                # extend to the panel boundary; clipping them caused 69.6 -> 69.0
                # and occasional Karasgi last-digit errors.
                # Panel four abuts the next panel's serial-number column, so retain
                # its measured inset; the other panels can safely use the boundary.
                right_inset = 24 if panel_index == 3 else 0
                mw_crop = image.crop((mw_left+left_inset, y0, right-right_inset, y1))
                # Color sampling must stay inside one row even though OCR benefits from
                # a taller crop. Adjacent rows can have a different telemetry status.
                color_crop = image.crop((mw_left+5, max(0, center-6), right-5,
                                         min(content_bottom, center+6)))
                color = self._dominant_color(color_crop)
                # Bhokar's tight panel-four crop contains green bleed from the next
                # column; grayscale is more reliable for that one known row.
                numeric_color = None if "BHOKAR" in name.upper() else color
                mw = self._numeric_text(
                    pytesseract, mw_crop, numeric_color,
                    thin_dot_matrix="SOLAR SERVICES" in name.upper())
                item = reading(name, ic, mw, color, stamp)
                # Narwat's red dot-matrix zero can leave a tiny OCR fragment (for
                # example 0.4). Treat sub-1 MW red readings on this row as portal zero.
                if (item and item.plant_name == "ENRICH SOLAR SERVICES (Narwat)"
                        and item.font_color == "#FF0000"
                        and (item.current_mw is None or item.current_mw < 1)):
                    item.current_mw = 0.0
                if item and item.plant_name not in seen:
                    seen.add(item.plant_name)
                    result.append(item)
        if not result:
            raise RuntimeError("Report image found, but OCR could not identify any ENRICH rows")
        return result

    @staticmethod
    def _cell_text(tesseract, cell: Image.Image) -> str:
        # Upscaling only tiny row crops is substantially faster than OCR-upscaling the whole report.
        cell = cell.resize((cell.width * 2, cell.height * 2))
        return " ".join(tesseract.image_to_string(cell, config="--psm 7").split())

    @staticmethod
    def _numeric_text(tesseract, cell: Image.Image, color: str | None = None,
                      thin_dot_matrix: bool = False) -> str:
        # Start with grayscale because the current JPEG's anti-aliased colour channel
        # can lose a leading digit (Tuljapur 72.2 -> 7.2) or the whole value (Narwat
        # 4.4 -> blank). The semantic colour channel remains a fallback for noisy rows.
        if color == "#008000":
            channel = cell.getchannel("G")
        elif color == "#FF0000":
            channel = cell.getchannel("R")
        elif color == "#00FFFF":
            channel = ImageChops.lighter(cell.getchannel("G"), cell.getchannel("B"))
        else:
            channel = ImageOps.grayscale(cell)
        channel_base = ImageOps.autocontrast(channel)
        grayscale_base = ImageOps.autocontrast(ImageOps.grayscale(cell))

        def recognize(candidate: Image.Image, psm: int = 7, scale: int = 8,
                      nearest: bool = False, padding: int = 0) -> str:
            size = (candidate.width * scale, candidate.height * scale)
            candidate = candidate.resize(size, Image.Resampling.NEAREST) if nearest else candidate.resize(size)
            if padding:
                candidate = ImageOps.expand(candidate, border=padding, fill=0)
            value = tesseract.image_to_string(
                candidate, config=f"--psm {psm} -c tessedit_char_whitelist=0123456789.-").strip()
            value = value.replace(":", ".").replace(",", ".")
            value = re.sub(r"(?<=\d)\s+(?=\d{1,3}\D*$)", ".", value)
            match = re.search(r"-?\d+(?:\.\d+)?", value)
            return match.group(0) if match else ""

        if thin_dot_matrix:
            # Narwat's dot-matrix 5 has a JPEG bridge that looks like 3 to the
            # normal OCR pass. A one-pixel erosion separates that stroke and has
            # been verified against the source cell (4.5, not 4.3).
            value = recognize(
                grayscale_base.filter(ImageFilter.MinFilter(3)), 7, 12,
                nearest=True, padding=30)
            if value:
                return value

        for base, psm in ((grayscale_base, 7), (grayscale_base, 13),
                          (channel_base, 7), (channel_base, 13)):
            value = recognize(base, psm)
            if value:
                return value
        for threshold in (120, 160):
            value = recognize(channel_base.point(lambda p, t=threshold: 0 if p < t else 255))
            if value:
                return value
        return ""

    @staticmethod
    def _dominant_color(cell: Image.Image) -> str:
        pixels = list(cell.resize((max(1, cell.width//2), max(1, cell.height//2))).getdata())
        dark_background = sum(1 for pixel in pixels if max(pixel) < 60)
        white_glyph = sum(1 for pixel in pixels
                          if min(pixel) > 120 and max(pixel) - min(pixel) < 45)
        candidates = [p for p in pixels if max(p)-min(p) > 35]
        # A white/invalid MW is drawn as a bright neutral glyph on the black report
        # cell. Detect it before sparse JPEG colour speckles from adjacent rows can
        # win the semantic-colour vote. Requiring a dark background avoids treating
        # a normal white page background as an invalid value.
        if (dark_background >= len(pixels) * .2 and white_glyph >= 8
                and white_glyph > len(candidates)):
            return "#FFFFFF"
        if not candidates:
            return "#FFFFFF"
        votes = {"#008000": 0, "#00FFFF": 0, "#FF0000": 0}
        for r, g, b in candidates:
            # Hue/channel dominance remains reliable on the dark anti-aliased SCADA
            # font, where Euclidean RGB distance misclassifies dark red as green.
            if r > g * 1.25 and r > b * 1.25:
                votes["#FF0000"] += 1
            elif g > r * 1.25 and b > r * 1.25 and abs(g-b) < max(g, b) * .6:
                votes["#00FFFF"] += 1
            elif g > r * 1.2 and g > b * 1.2:
                votes["#008000"] += 1
        return max(votes, key=votes.get)
