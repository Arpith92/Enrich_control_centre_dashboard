from datetime import datetime

from sldc.database import db


def test_sample_slot_is_aligned_to_fifteen_minutes():
    assert db.sample_slot(datetime(2026, 7, 13, 10, 29, 59)) == datetime(2026, 7, 13, 10, 15)
    assert db.sample_slot(datetime(2026, 7, 13, 10, 30, 0)) == datetime(2026, 7, 13, 10, 30)


def test_availability_counts_missing_and_communication_loss(monkeypatch):
    plant = "ENRICH KARASGI"
    rows = [
        {"SampleTime": "2026-07-13 10:00:00", "IsAvailable": True,
         "CommunicationIssue": None},
        {"SampleTime": "2026-07-13 10:15:00", "IsAvailable": False,
         "CommunicationIssue": "Communication Failure"},
    ]
    monkeypatch.setattr(db, "samples", lambda *args: rows)

    report = db.availability(plant, datetime(2026, 7, 13, 10),
                             datetime(2026, 7, 13, 10, 45), "day")[0]

    assert report["ExpectedSamples"] == 3
    assert report["RecordedSamples"] == 2
    assert report["AvailableSamples"] == 1
    assert report["UnavailableSamples"] == 2
    assert report["AvailabilityPercent"] == 33.33
    assert report["LossPeriods"][0]["Issue"] == "Communication Failure"
    assert report["LossPeriods"][1]["Issue"] == "No sample stored"


def test_fleet_availability_combines_all_site_samples(monkeypatch):
    monkeypatch.setattr(db, "availability", lambda *args: [{
        "ExpectedSamples": 4, "RecordedSamples": 4, "AvailableSamples": 3,
        "UnavailableSamples": 1,
    }])

    report = db.fleet_availability(datetime(2026, 7, 13),
                                   datetime(2026, 7, 13, 1))

    assert report["Sites"] == 7
    assert report["ExpectedSamples"] == 28
    assert report["AvailableSamples"] == 21
    assert report["AvailabilityPercent"] == 75.0


def test_generation_report_converts_quarter_hour_mw_to_mwh(monkeypatch):
    plant = "ENRICH KARASGI"
    rows = [
        {"SampleTime": "2026-07-13 10:00:00", "MW": 20.0, "IsAvailable": True},
        {"SampleTime": "2026-07-13 10:15:00", "MW": 40.0, "IsAvailable": True},
    ]
    status = [{"Period": "2026-07-13", "ExpectedSamples": 2,
               "RecordedSamples": 2, "AvailableSamples": 2,
               "AvailabilityPercent": 100.0}]
    monkeypatch.setattr(db, "samples", lambda *args: rows)
    monkeypatch.setattr(db, "availability", lambda *args: status)

    report = db.generation_report([plant], datetime(2026, 7, 13, 10),
                                  datetime(2026, 7, 13, 10, 30), "day")[0]
    assert report["EstimatedGenerationMWh"] == 15.0
    assert report["AverageMW"] == 30.0


def test_negative_mw_is_visible_but_excluded_from_generation_total(monkeypatch):
    plant = "ENRICH TULJAPUR"
    rows = [
        {"SampleTime": "2026-07-13 10:00:00", "MW": 4.0, "IsAvailable": True},
        {"SampleTime": "2026-07-13 10:15:00", "MW": -0.1, "IsAvailable": True},
    ]
    status = [{"Period": "2026-07-13", "ExpectedSamples": 2,
               "RecordedSamples": 2, "AvailableSamples": 2,
               "AvailabilityPercent": 100.0}]
    monkeypatch.setattr(db, "samples", lambda *args: rows)
    monkeypatch.setattr(db, "availability", lambda *args: status)

    report = db.generation_report([plant], datetime(2026, 7, 13, 10),
                                  datetime(2026, 7, 13, 10, 30), "day")[0]

    assert report["EstimatedGenerationMWh"] == 1.0
    assert report["MinimumMW"] == -0.1
    assert report["AverageMW"] == 1.95


def test_communication_report_merges_consecutive_loss_slots(monkeypatch):
    plant = "ENRICH KARASGI"
    losses = [{"SampleTime": "2026-07-13 10:00:00", "Issue": "Communication Failure"},
              {"SampleTime": "2026-07-13 10:15:00", "Issue": "Communication Failure"}]
    monkeypatch.setattr(db, "availability", lambda *args: [{"LossPeriods": losses}])

    report = db.communication_report([plant], datetime(2026, 7, 13, 10),
                                     datetime(2026, 7, 13, 10, 30))[0]
    assert report["StartTime"] == "2026-07-13 10:00:00"
    assert report["EndTime"] == "2026-07-13 10:30:00"
    assert report["DurationMinutes"] == 30
    assert report["LostSamples"] == 2
    assert report["Active"] is True
    assert report["LastObservedTime"] == "2026-07-13 10:15:00"


def test_active_incidents_keep_original_issue_start(monkeypatch):
    open_issue = {"Plant": "ENRICH TULJAPUR", "StartTime": "2026-07-13 14:00:00",
                  "EndTime": "2026-07-13 15:00:00", "LastObservedTime": "2026-07-13 14:45:00",
                  "DurationMinutes": 60, "LostSamples": 4, "Issue": "Site Down / Invalid",
                  "Active": True}
    closed_issue = {**open_issue, "Plant": "ENRICH KARASGI", "Active": False}
    monkeypatch.setattr(db, "communication_report",
                        lambda plants, *_: [open_issue] if plants[0] == "ENRICH TULJAPUR" else [closed_issue])

    incidents = db.active_communication_incidents(datetime(2026, 7, 13),
                                                  datetime(2026, 7, 13, 15))

    assert len(incidents) == 1
    assert incidents[0]["StartTime"] == "2026-07-13 14:00:00"
