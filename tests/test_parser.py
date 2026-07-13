from datetime import datetime
from sldc.parser import normalize_color, reading


def test_color_mapping_accepts_similar_colors():
    assert normalize_color("rgb(25, 135, 84)")[:2] == ("Current", "Live Data")
    assert normalize_color("#00eeee")[0] == "Manually Substituted"
    assert normalize_color("rgb(220, 53, 69)")[0] == "Non-Current"
    assert normalize_color("#fff")[0] == "Invalid"


def test_only_enrich_is_returned():
    now = datetime.now()
    assert reading("Other Solar", "10", "2", "green", now) is None
    item = reading("Enrich Mandrup", "47.75", "21.5", "#008000", now)
    assert item.plant_name == "ENRICH MANDRUP"
    assert item.current_mw == 21.5


def test_exact_portal_station_names_are_matched_and_preserved():
    now = datetime.now()
    names = (
        "ENRICH KARASGI",
        "ENRICH MANDRUP",
        "ENRICH ENERGY LTD SOLAR PARK",
        "ENRICH TULJAPUR",
        "ENRICH ENERGY HIRADGAON",
        "ENRICH ENERGY BHOKAR",
        "ENRICH SOLAR SERVICES (Narwat)",
    )

    for name in names:
        item = reading(name, "", "1.2", "#008000", now)
        assert item is not None
        assert item.plant_name == name


def test_partial_or_legacy_enrich_names_are_not_matched():
    now = datetime.now()
    assert reading("M/s. Enrich Energy P Ltd. (Karajgi)", "", "1.2", "#008000", now) is None


def test_narwat_ocr_punctuation_loss_is_tolerated():
    for observed in ("ENRICH SOLAR SERVICES Narwat", "ENRICH SOLAR SERVICES"):
        item = reading(observed, "", "0", "#FF0000", datetime.now())
        assert item.plant_name == "ENRICH SOLAR SERVICES (Narwat)"
        assert item.msldc_status == "Non-Current"


def test_installed_capacities_match_current_msldc_rows():
    expected = {
        "ENRICH KARASGI": 47.75,
        "ENRICH MANDRUP": 47.75,
        "ENRICH ENERGY LTD SOLAR PARK": 25.0,
        "ENRICH TULJAPUR": 100.0,
        "ENRICH ENERGY HIRADGAON": 50.0,
        "ENRICH ENERGY BHOKAR": 25.0,
        "ENRICH SOLAR SERVICES (Narwat)": 25.0,
    }
    for plant, capacity in expected.items():
        assert reading(plant, "", "1.0", "#008000", datetime.now()).installed_capacity == capacity
