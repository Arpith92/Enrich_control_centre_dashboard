from sldc.scada_realtime import _document_time, _plant_name, extract_inverter_values, extract_plant_totals


def test_extracts_flat_and_nested_inverter_tags_up_to_twenty():
    document = {
        "INV1_ActivePower": "1,250.5",
        "INV1_Cumulative_Generation": {"value": 5000},
        "payload": {
            "INV20_ActivePower": 749.5,
            "INV21_ActivePower": 999,
        },
    }
    result = extract_inverter_values(document)
    assert result["active_power"] == {1: 1250.5, 20: 749.5}
    assert result["cumulative_generation"] == {1: 5000.0}


def test_extracts_tag_value_record_shape():
    document = {"tags": [
        {"TagName": "INV2_ActivePower", "Value": "300.25"},
        {"name": "INV2_Cumulative_Generation", "value": 12345},
    ]}
    result = extract_inverter_values(document)
    assert result["active_power"][2] == 300.25
    assert result["cumulative_generation"][2] == 12345


def test_extracts_zero_padded_and_separated_power_tags():
    result = extract_inverter_values({
        "INV01_Active_Power": 120,
        "payload": {"INV_02_Active-Power": {"value": 80}},
    })
    assert result["active_power"] == {1: 120, 2: 80}


def test_bhokar_collection_names_match_plant_mapping():
    assert _plant_name("B2_Jagdeesh_LIVE") == "Jagadeesh"
    assert _plant_name("B5_SoundCasting_LIVE") == "Sound Castings"
    assert _plant_name("B7_Suyash_LIVE") == "Suyesh"
    assert _plant_name("B8_Veersha_LIVE") == "Veeresha"


def test_timestamp_ist_is_interpreted_as_india_time():
    timestamp = _document_time({"timestamp_IST": "2026-07-16T12:30:00"})
    assert timestamp.utcoffset().total_seconds() == 19800


def test_extracts_aggregate_live_collection_values():
    result = extract_plant_totals({
        "Active_Power": "12,500",
        "DailyGeneration": {"value": 4450},
        "payload": {"Total_Generation": 987654},
    })
    assert result["active_power"] == 12500
    assert result["daily_generation"] == 4450
    assert result["cumulative_generation"] == 987654
