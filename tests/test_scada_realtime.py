from sldc.scada_realtime import _document_time, extract_inverter_values


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


def test_timestamp_ist_is_interpreted_as_india_time():
    timestamp = _document_time({"timestamp_IST": "2026-07-16T12:30:00"})
    assert timestamp.utcoffset().total_seconds() == 19800
