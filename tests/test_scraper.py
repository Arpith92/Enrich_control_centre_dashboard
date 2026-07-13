from PIL import Image

from sldc.scraper import SLDCScraper


def test_dominant_color_ignores_white_cell_background():
    image = Image.new("RGB", (100, 30), "white")
    for x in range(10, 30):
        for y in range(8, 22):
            image.putpixel((x, y), (230, 20, 20))
    assert SLDCScraper._dominant_color(image) == "#FF0000"


def test_dominant_color_recognizes_green_data():
    image = Image.new("RGB", (100, 30), "white")
    for x in range(10, 30):
        for y in range(8, 22):
            image.putpixel((x, y), (0, 128, 0))
    assert SLDCScraper._dominant_color(image) == "#008000"


def test_dominant_color_recognizes_white_glyph_on_black_report_cell():
    image = Image.new("RGB", (100, 30), "black")
    for x in range(20, 50):
        for y in range(8, 22):
            image.putpixel((x, y), (235, 235, 235))
    assert SLDCScraper._dominant_color(image) == "#FFFFFF"


def test_report_image_is_discovered_without_selenium(monkeypatch):
    class Response:
        text = '<img src="/assets/public/scada/mvrreport8.jpg" class="report-image mb-3">'

        @staticmethod
        def raise_for_status():
            pass

    scraper = SLDCScraper()
    monkeypatch.setattr(scraper.http, "get", lambda *args, **kwargs: Response())
    assert scraper._report_image_url() == "https://mahasldc.in/assets/public/scada/mvrreport8.jpg"


def test_numeric_text_keeps_leading_digit_and_trims_trailing_noise():
    class Tesseract:
        @staticmethod
        def image_to_string(*args, **kwargs):
            return "72.2."

    cell = Image.new("RGB", (30, 12), "black")
    assert SLDCScraper._numeric_text(Tesseract(), cell, "#008000") == "72.2"


def test_numeric_text_uses_single_character_mode_when_line_mode_is_empty():
    class Tesseract:
        calls = 0

        @classmethod
        def image_to_string(cls, *args, **kwargs):
            cls.calls += 1
            return "" if cls.calls == 1 else "23.5"

    cell = Image.new("RGB", (30, 12), "black")
    assert SLDCScraper._numeric_text(Tesseract(), cell, "#008000") == "23.5"


def test_narwat_dot_matrix_pass_is_used_before_normal_ocr():
    class Tesseract:
        calls = 0

        @classmethod
        def image_to_string(cls, *args, **kwargs):
            cls.calls += 1
            return "4.5" if cls.calls == 1 else "4.3"

    cell = Image.new("RGB", (30, 12), "black")
    assert SLDCScraper._numeric_text(
        Tesseract(), cell, "#008000", thin_dot_matrix=True) == "4.5"
    assert Tesseract.calls == 1
