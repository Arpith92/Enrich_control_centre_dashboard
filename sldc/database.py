"""SQL Server persistence with an opt-in SQLite development fallback."""
from __future__ import annotations
from contextlib import contextmanager
from datetime import datetime, timedelta
import sqlite3
from .config import settings
from .logger import get_logger
from .parser import Reading, TARGET_STATIONS

log = get_logger(__name__)


class Database:
    def __init__(self):
        self.kind = "sqlserver" if settings.sql_connection_string else "sqlite"
        self.mongo_client = None
        self.sample_collection = None
        self.operational_event_collection = None
        self.sample_kind = "mongodb" if settings.mongodb_uri else self.kind
        if self.kind == "sqlite" and not settings.allow_sqlite_fallback:
            raise RuntimeError("SQL_CONNECTION_STRING is required")

    @contextmanager
    def connect(self):
        if self.kind == "sqlserver":
            import pyodbc
            connection = pyodbc.connect(settings.sql_connection_string, timeout=8)
        else:
            connection = sqlite3.connect(settings.sqlite_path, timeout=10, check_same_thread=False)
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self):
        sql_server = """
        IF OBJECT_ID('dbo.EnrichSolarHistory', 'U') IS NULL BEGIN
          CREATE TABLE dbo.EnrichSolarHistory (
            Id BIGINT IDENTITY(1,1) PRIMARY KEY, PlantName NVARCHAR(200) NOT NULL,
            InstalledCapacity DECIMAL(12,3) NULL, CurrentMW DECIMAL(12,3) NULL,
            FontColor VARCHAR(7) NOT NULL, MSLDCStatus NVARCHAR(50) NOT NULL,
            DashboardStatus NVARCHAR(100) NOT NULL, [Timestamp] DATETIME2(0) NOT NULL
          );
          CREATE INDEX IX_EnrichSolarHistory_PlantTime ON dbo.EnrichSolarHistory(PlantName, [Timestamp] DESC);
        END"""
        sqlite = """CREATE TABLE IF NOT EXISTS EnrichSolarHistory (
          Id INTEGER PRIMARY KEY AUTOINCREMENT, PlantName TEXT NOT NULL,
          InstalledCapacity REAL, CurrentMW REAL, FontColor TEXT NOT NULL,
          MSLDCStatus TEXT NOT NULL, DashboardStatus TEXT NOT NULL, Timestamp TEXT NOT NULL)"""
        with self.connect() as con:
            cur = con.cursor()
            cur.execute(sql_server if self.kind == "sqlserver" else sqlite)
            if self.kind == "sqlserver":
                cur.execute("""IF OBJECT_ID('dbo.SLDC_DB', 'U') IS NULL BEGIN
                  CREATE TABLE dbo.SLDC_DB (
                    Id BIGINT IDENTITY(1,1) PRIMARY KEY, PlantName NVARCHAR(200) NOT NULL,
                    InstalledCapacity DECIMAL(12,3) NULL, CurrentMW DECIMAL(12,3) NULL,
                    FontColor VARCHAR(7) NOT NULL, MSLDCStatus NVARCHAR(50) NOT NULL,
                    DashboardStatus NVARCHAR(100) NOT NULL, IsAvailable BIT NOT NULL,
                    CommunicationIssue NVARCHAR(200) NULL, SampleTime DATETIME2(0) NOT NULL,
                    SourceTimestamp DATETIME2(0) NULL, CollectedAt DATETIME2(0) NOT NULL,
                    CONSTRAINT UQ_SLDC_DB_PlantSample UNIQUE (PlantName, SampleTime)
                  );
                  CREATE INDEX IX_SLDC_DB_PlantTime ON dbo.SLDC_DB(PlantName, SampleTime);
                END""")
                cur.execute("""IF OBJECT_ID('dbo.OperationalEventLog', 'U') IS NULL BEGIN
                  CREATE TABLE dbo.OperationalEventLog (
                    EventKey VARCHAR(64) PRIMARY KEY, EventType VARCHAR(20) NOT NULL,
                    PlantName NVARCHAR(200) NOT NULL, Message NVARCHAR(500) NOT NULL,
                    Severity VARCHAR(20) NOT NULL, SourceName NVARCHAR(100) NOT NULL,
                    EventTime DATETIME2(0) NOT NULL, CreatedAt DATETIME2(0) NOT NULL
                  );
                  CREATE INDEX IX_OperationalEventLog_Time ON dbo.OperationalEventLog(EventTime DESC);
                END""")
            else:
                cur.execute("""CREATE TABLE IF NOT EXISTS SLDC_DB (
                  Id INTEGER PRIMARY KEY AUTOINCREMENT, PlantName TEXT NOT NULL,
                  InstalledCapacity REAL, CurrentMW REAL, FontColor TEXT NOT NULL,
                  MSLDCStatus TEXT NOT NULL, DashboardStatus TEXT NOT NULL,
                  IsAvailable INTEGER NOT NULL, CommunicationIssue TEXT,
                  SampleTime TEXT NOT NULL, SourceTimestamp TEXT, CollectedAt TEXT NOT NULL,
                  UNIQUE(PlantName, SampleTime))""")
                cur.execute("CREATE INDEX IF NOT EXISTS IX_SLDC_DB_PlantTime ON SLDC_DB(PlantName, SampleTime)")
                cur.execute("""CREATE TABLE IF NOT EXISTS OperationalEventLog (
                  EventKey TEXT PRIMARY KEY, EventType TEXT NOT NULL,
                  PlantName TEXT NOT NULL, Message TEXT NOT NULL,
                  Severity TEXT NOT NULL, SourceName TEXT NOT NULL,
                  EventTime TEXT NOT NULL, CreatedAt TEXT NOT NULL)""")
                cur.execute("CREATE INDEX IF NOT EXISTS IX_OperationalEventLog_Time ON OperationalEventLog(EventTime DESC)")
            if self.kind == "sqlite":
                cur.execute("CREATE INDEX IF NOT EXISTS IX_EnrichSolarHistory_PlantTime ON EnrichSolarHistory(PlantName, Timestamp DESC)")
        if settings.mongodb_uri:
            from pymongo import ASCENDING, MongoClient
            self.mongo_client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=8000)
            self.mongo_client.admin.command("ping")
            self.sample_collection = self.mongo_client[settings.mongodb_database][settings.mongodb_collection]
            self.operational_event_collection = self.mongo_client[settings.mongodb_database]["OperationalEvents"]
            self.sample_collection.create_index(
                [("PlantName", ASCENDING), ("SampleTime", ASCENDING)], unique=True,
                name="UQ_SLDC_DB_PlantSample")
            self.operational_event_collection.create_index("EventKey", unique=True, name="UQ_OperationalEvents_Key")
            self.operational_event_collection.create_index([("EventTime", -1)], name="IX_OperationalEvents_Time")
            log.info("15-minute samples configured for MongoDB %s.%s",
                     settings.mongodb_database, settings.mongodb_collection)

    def save_operational_events(self, entries: list[dict]) -> int:
        """Persist deduplicated real-feed alarm and event entries."""
        if not entries:
            return 0
        if self.operational_event_collection is not None:
            from pymongo import UpdateOne
            operations = [UpdateOne({"EventKey": row["EventKey"]}, {"$setOnInsert": row}, upsert=True)
                          for row in entries]
            result = self.operational_event_collection.bulk_write(operations, ordered=False)
            return result.upserted_count
        table = "dbo.OperationalEventLog" if self.kind == "sqlserver" else "OperationalEventLog"
        inserted = 0
        with self.connect() as con:
            cur = con.cursor()
            for row in entries:
                cur.execute(f"SELECT 1 FROM {table} WHERE EventKey=?", (row["EventKey"],))
                if cur.fetchone():
                    continue
                cur.execute(f"""INSERT INTO {table}
                    (EventKey,EventType,PlantName,Message,Severity,SourceName,EventTime,CreatedAt)
                    VALUES (?,?,?,?,?,?,?,?)""", (
                    row["EventKey"], row["EventType"], row["PlantName"], row["Message"],
                    row["Severity"], row["SourceName"], row["EventTime"], row["CreatedAt"]))
                inserted += 1
        return inserted

    def operational_events(self, start: datetime, end: datetime, event_type: str | None = None,
                           plant: str | None = None, severity: str | None = None,
                           limit: int = 500) -> list[dict]:
        """Read stored alarm/event history with server-side filters."""
        if self.operational_event_collection is not None:
            query: dict = {"EventTime": {"$gte": start, "$lt": end}}
            if event_type and event_type != "all":
                query["EventType"] = event_type
            if plant:
                query["PlantName"] = plant
            if severity:
                query["Severity"] = severity
            rows = self.operational_event_collection.find(query, {"_id": 0}).sort("EventTime", -1).limit(limit)
            return [{**row,
                "EventTime": row["EventTime"].strftime("%Y-%m-%d %H:%M:%S"),
                "CreatedAt": row["CreatedAt"].strftime("%Y-%m-%d %H:%M:%S")}
                for row in rows]
        table = "dbo.OperationalEventLog" if self.kind == "sqlserver" else "OperationalEventLog"
        where = ["EventTime>=?", "EventTime<?"]
        params: list = [start, end]
        for column, value in (("EventType", event_type if event_type != "all" else None),
                              ("PlantName", plant), ("Severity", severity)):
            if value:
                where.append(f"{column}=?")
                params.append(value)
        top = f"TOP {int(limit)} " if self.kind == "sqlserver" else ""
        suffix = "" if self.kind == "sqlserver" else f" LIMIT {int(limit)}"
        with self.connect() as con:
            rows = con.cursor().execute(f"""SELECT {top}EventKey,EventType,PlantName,Message,
                Severity,SourceName,EventTime,CreatedAt FROM {table}
                WHERE {' AND '.join(where)} ORDER BY EventTime DESC{suffix}""", params).fetchall()
        def stamp(value):
            return value.strftime("%Y-%m-%d %H:%M:%S") if hasattr(value, "strftime") else str(value)
        return [{"EventKey": row[0], "EventType": row[1], "PlantName": row[2],
                 "Message": row[3], "Severity": row[4], "SourceName": row[5],
                 "EventTime": stamp(row[6]), "CreatedAt": stamp(row[7])} for row in rows]

    @staticmethod
    def sample_slot(value: datetime) -> datetime:
        """Floor a local timestamp to its configured reporting interval."""
        minutes = settings.sample_minutes
        return value.replace(minute=(value.minute // minutes) * minutes,
                             second=0, microsecond=0)

    def save_samples(self, readings: list[Reading], collected_at: datetime | None = None) -> int:
        """Store exactly one availability record per expected station and sample slot."""
        collected_at = collected_at or datetime.now()
        slot = self.sample_slot(collected_at)
        observed = {item.plant_name: item for item in readings}
        if self.sample_collection is not None:
            from pymongo import UpdateOne
            operations = []
            for _, plant_name, capacity in TARGET_STATIONS:
                item = observed.get(plant_name)
                if item:
                    available = item.msldc_status == "Current" and item.current_mw is not None
                    document = {"PlantName": plant_name,
                        "InstalledCapacity": item.installed_capacity, "CurrentMW": item.current_mw,
                        "FontColor": item.font_color, "MSLDCStatus": item.msldc_status,
                        "DashboardStatus": item.dashboard_status, "IsAvailable": available,
                        "CommunicationIssue": None if available else item.dashboard_status,
                        "SampleTime": slot, "SourceTimestamp": item.timestamp,
                        "CollectedAt": collected_at}
                else:
                    document = {"PlantName": plant_name, "InstalledCapacity": capacity,
                        "CurrentMW": None, "FontColor": "#FFFFFF", "MSLDCStatus": "Missing",
                        "DashboardStatus": "Reading missing from source extraction",
                        "IsAvailable": False,
                        "CommunicationIssue": "Reading missing from source extraction",
                        "SampleTime": slot, "SourceTimestamp": None, "CollectedAt": collected_at}
                operations.append(UpdateOne(
                    {"PlantName": plant_name, "SampleTime": slot},
                    {"$set": document}, upsert=True))
            result = self.sample_collection.bulk_write(operations, ordered=False)
            return result.upserted_count + result.modified_count
        table = "dbo.SLDC_DB" if self.kind == "sqlserver" else "SLDC_DB"
        inserted = 0
        with self.connect() as con:
            cur = con.cursor()
            for _, plant_name, capacity in TARGET_STATIONS:
                item = observed.get(plant_name)
                if item:
                    available = item.msldc_status == "Current" and item.current_mw is not None
                    values = (plant_name, item.installed_capacity, item.current_mw,
                              item.font_color, item.msldc_status, item.dashboard_status,
                              int(available), None if available else item.dashboard_status,
                              slot, item.timestamp, collected_at)
                else:
                    values = (plant_name, capacity, None, "#FFFFFF", "Missing",
                              "Reading missing from source extraction", 0,
                              "Reading missing from source extraction", slot, None, collected_at)
                cur.execute(f"SELECT 1 FROM {table} WHERE PlantName=? AND SampleTime=?",
                            (plant_name, slot))
                if cur.fetchone():
                    cur.execute(f"""UPDATE {table} SET InstalledCapacity=?,CurrentMW=?,
                        FontColor=?,MSLDCStatus=?,DashboardStatus=?,IsAvailable=?,
                        CommunicationIssue=?,SourceTimestamp=?,CollectedAt=?
                        WHERE PlantName=? AND SampleTime=?""",
                        (values[1], values[2], values[3], values[4], values[5],
                         values[6], values[7], values[9], values[10], plant_name, slot))
                    continue
                cur.execute(f"""INSERT INTO {table}
                    (PlantName,InstalledCapacity,CurrentMW,FontColor,MSLDCStatus,
                     DashboardStatus,IsAvailable,CommunicationIssue,SampleTime,
                     SourceTimestamp,CollectedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)""", values)
                inserted += 1
        return inserted

    def samples(self, plant: str, start: datetime, end: datetime) -> list[dict]:
        """Return 15-minute samples for a station in [start, end)."""
        if self.sample_collection is not None:
            documents = self.sample_collection.find(
                {"PlantName": plant, "SampleTime": {"$gte": start, "$lt": end}},
                {"_id": 0}).sort("SampleTime", 1)

            def stamp(value):
                return value.strftime("%Y-%m-%d %H:%M:%S") if value else None

            return [{"Plant": row["PlantName"],
                     "InstalledCapacity": row.get("InstalledCapacity"),
                     "MW": row.get("CurrentMW"), "Status": row.get("MSLDCStatus"),
                     "DashboardStatus": row.get("DashboardStatus"),
                     "IsAvailable": bool(row.get("IsAvailable")),
                     "CommunicationIssue": row.get("CommunicationIssue"),
                     "SampleTime": stamp(row.get("SampleTime")),
                     "SourceTimestamp": stamp(row.get("SourceTimestamp")),
                     "CollectedAt": stamp(row.get("CollectedAt"))} for row in documents]
        table = "dbo.SLDC_DB" if self.kind == "sqlserver" else "SLDC_DB"
        with self.connect() as con:
            rows = con.cursor().execute(f"""SELECT PlantName,InstalledCapacity,CurrentMW,
                MSLDCStatus,DashboardStatus,IsAvailable,CommunicationIssue,SampleTime,
                SourceTimestamp,CollectedAt FROM {table}
                WHERE PlantName=? AND SampleTime>=? AND SampleTime<? ORDER BY SampleTime""",
                (plant, start, end)).fetchall()
        result = []
        for row in rows:
            def stamp(value):
                if value is None:
                    return None
                if isinstance(value, str):
                    value = datetime.fromisoformat(value)
                return value.strftime("%Y-%m-%d %H:%M:%S")
            result.append({"Plant": row[0], "InstalledCapacity": row[1], "MW": row[2],
                           "Status": row[3], "DashboardStatus": row[4],
                           "IsAvailable": bool(row[5]), "CommunicationIssue": row[6],
                           "SampleTime": stamp(row[7]), "SourceTimestamp": stamp(row[8]),
                           "CollectedAt": stamp(row[9])})
        return result

    def availability(self, plant: str, start: datetime, end: datetime,
                     group_by: str = "day") -> list[dict]:
        """Calculate availability including completely missing 15-minute slots."""
        rows = self.samples(plant, start, end)
        recorded = {datetime.fromisoformat(row["SampleTime"]): row for row in rows}
        slot = self.sample_slot(start)
        if slot < start:
            slot += timedelta(minutes=settings.sample_minutes)
        groups: dict[str, dict] = {}
        while slot < end:
            key = slot.strftime("%Y-%m" if group_by == "month" else "%Y-%m-%d")
            if group_by == "none":
                key = "total"
            group = groups.setdefault(key, {"Period": key, "Plant": plant,
                "ExpectedSamples": 0, "RecordedSamples": 0, "AvailableSamples": 0,
                "UnavailableSamples": 0, "LossPeriods": []})
            group["ExpectedSamples"] += 1
            row = recorded.get(slot)
            if row:
                group["RecordedSamples"] += 1
            if row and row["IsAvailable"]:
                group["AvailableSamples"] += 1
            else:
                group["UnavailableSamples"] += 1
                group["LossPeriods"].append({"SampleTime": slot.strftime("%Y-%m-%d %H:%M:%S"),
                    "Issue": row["CommunicationIssue"] if row else "No sample stored"})
            slot += timedelta(minutes=settings.sample_minutes)
        for group in groups.values():
            expected = group["ExpectedSamples"]
            group["AvailabilityPercent"] = round(group["AvailableSamples"] * 100 / expected, 2) if expected else 0.0
        return list(groups.values())

    def fleet_availability(self, start: datetime, end: datetime) -> dict:
        """Aggregate SLDC data-transfer availability across all expected sites."""
        totals = {"ExpectedSamples": 0, "RecordedSamples": 0,
                  "AvailableSamples": 0, "UnavailableSamples": 0}
        for _, plant, _ in TARGET_STATIONS:
            rows = self.availability(plant, start, end, "none")
            if not rows:
                continue
            row = rows[0]
            for key in totals:
                totals[key] += row[key]
        expected = totals["ExpectedSamples"]
        totals.update({
            "PeriodStart": start.strftime("%Y-%m-%d %H:%M:%S"),
            "PeriodEnd": end.strftime("%Y-%m-%d %H:%M:%S"),
            "Sites": len(TARGET_STATIONS),
            "AvailabilityPercent": round(totals["AvailableSamples"] * 100 / expected, 2) if expected else 0.0,
        })
        return totals

    def generation_report(self, plants: list[str], start: datetime, end: datetime,
                          group_by: str = "day") -> list[dict]:
        """Aggregate 15-minute MW samples into estimated MWh report rows."""
        report = []
        interval_hours = settings.sample_minutes / 60
        for plant in plants:
            rows = self.samples(plant, start, end)
            grouped: dict[str, list[dict]] = {}
            for row in rows:
                stamp = datetime.fromisoformat(row["SampleTime"])
                period = stamp.strftime("%Y-%m" if group_by == "month" else "%Y-%m-%d")
                if group_by == "none":
                    period = "total"
                grouped.setdefault(period, []).append(row)
            availability = {row["Period"]: row for row in
                            self.availability(plant, start, end, group_by)}
            for period, status in availability.items():
                period_rows = grouped.get(period, [])
                values = [float(row["MW"]) for row in period_rows
                          if row["IsAvailable"] and row["MW"] is not None]
                generation_values = [max(0.0, value) for value in values]
                report.append({"Period": period, "Plant": plant,
                    # Negative readings remain in the raw logs and min/average/max,
                    # but represent no positive injection in generation totals.
                    "EstimatedGenerationMWh": round(sum(generation_values) * interval_hours, 3),
                    "AverageMW": round(sum(values) / len(values), 3) if values else 0.0,
                    "MinimumMW": round(min(values), 3) if values else 0.0,
                    "MaximumMW": round(max(values), 3) if values else 0.0,
                    "ExpectedSamples": status["ExpectedSamples"],
                    "RecordedSamples": status["RecordedSamples"],
                    "AvailableSamples": status["AvailableSamples"],
                    "AvailabilityPercent": status["AvailabilityPercent"]})
        return sorted(report, key=lambda row: (row["Period"], row["Plant"]))

    def communication_report(self, plants: list[str], start: datetime,
                             end: datetime) -> list[dict]:
        """Consolidate consecutive unavailable sample slots into issue periods."""
        interval = timedelta(minutes=settings.sample_minutes)
        issues = []
        for plant in plants:
            losses = []
            for group in self.availability(plant, start, end, "none"):
                losses.extend(group["LossPeriods"])
            current = None
            for loss in losses:
                stamp = datetime.fromisoformat(loss["SampleTime"])
                issue = loss["Issue"] or "Unavailable"
                if (current and current["Issue"] == issue
                        and stamp == current["_last"] + interval):
                    current["_last"] = stamp
                    current["LostSamples"] += 1
                    continue
                if current:
                    issues.append(current)
                current = {"Plant": plant, "StartTime": stamp,
                           "_last": stamp, "Issue": issue, "LostSamples": 1}
            if current:
                issues.append(current)
        result = []
        for issue in issues:
            end_time = min(issue["_last"] + interval, end)
            result.append({"Plant": issue["Plant"],
                "StartTime": issue["StartTime"].strftime("%Y-%m-%d %H:%M:%S"),
                "EndTime": end_time.strftime("%Y-%m-%d %H:%M:%S"),
                "DurationMinutes": int((end_time - issue["StartTime"]).total_seconds() / 60),
                "LastObservedTime": issue["_last"].strftime("%Y-%m-%d %H:%M:%S"),
                "Active": end_time == end,
                "LostSamples": issue["LostSamples"], "Issue": issue["Issue"]})
        return sorted(result, key=lambda row: (row["StartTime"], row["Plant"]))

    def active_communication_incidents(self, start: datetime, end: datetime) -> list[dict]:
        """Return the currently open communication incident for each affected site."""
        active = []
        for _, plant, _ in TARGET_STATIONS:
            active.extend(row for row in self.communication_report([plant], start, end)
                          if row["Active"])
        return sorted(active, key=lambda row: row["StartTime"])

    def insert_if_changed(self, item: Reading) -> bool:
        table = "dbo.EnrichSolarHistory" if self.kind == "sqlserver" else "EnrichSolarHistory"
        top = "TOP 1 " if self.kind == "sqlserver" else ""
        limit = "" if self.kind == "sqlserver" else " LIMIT 1"
        with self.connect() as con:
            cur = con.cursor()
            ts_col = "[Timestamp]" if self.kind == "sqlserver" else "Timestamp"
            cur.execute(f"SELECT {top}Id, CurrentMW, MSLDCStatus, InstalledCapacity, FontColor FROM {table} WHERE PlantName=? ORDER BY Id DESC{limit}", (item.plant_name,))
            previous = cur.fetchone()
            same_mw = previous and ((previous[1] is None and item.current_mw is None) or
                                    (previous[1] is not None and item.current_mw is not None and float(previous[1]) == item.current_mw))
            same_capacity = previous and previous[3] is not None and item.installed_capacity is not None and float(previous[3]) == item.installed_capacity
            if previous and same_mw and previous[2] == item.msldc_status and same_capacity and previous[4] == item.font_color:
                # Keep the live source timestamp exact even when the MW has not
                # changed; 15-minute history remains in SLDC_DB without duplicates.
                cur.execute(f"UPDATE {table} SET {ts_col}=?, DashboardStatus=? WHERE Id=?",
                            (item.timestamp, item.dashboard_status, previous[0]))
                return False
            cur.execute(f"INSERT INTO {table} (PlantName,InstalledCapacity,CurrentMW,FontColor,MSLDCStatus,DashboardStatus,{ts_col}) VALUES (?,?,?,?,?,?,?)",
                        (item.plant_name, item.installed_capacity, item.current_mw, item.font_color,
                         item.msldc_status, item.dashboard_status, item.timestamp))
            return True

    def latest(self) -> list[dict]:
        table = "dbo.EnrichSolarHistory" if self.kind == "sqlserver" else "EnrichSolarHistory"
        ts_col = "[Timestamp]" if self.kind == "sqlserver" else "Timestamp"
        plant_names = tuple(label for _, label, _ in TARGET_STATIONS)
        placeholders = ",".join("?" for _ in plant_names)
        sql = f"""SELECT PlantName,InstalledCapacity,CurrentMW,FontColor,MSLDCStatus,DashboardStatus,{ts_col}
        FROM (SELECT *, ROW_NUMBER() OVER(PARTITION BY PlantName ORDER BY Id DESC) rn
              FROM {table} WHERE PlantName IN ({placeholders})) x WHERE rn=1 ORDER BY PlantName"""
        with self.connect() as con:
            rows = con.cursor().execute(sql, plant_names).fetchall()
        return [self._row(row) for row in rows]

    @staticmethod
    def _row(row) -> dict:
        ts = row[6]
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts)
        return {"Plant": row[0], "InstalledCapacity": row[1], "MW": row[2], "FontColor": row[3],
                "Status": row[4], "DashboardStatus": row[5], "Timestamp": ts.strftime("%Y-%m-%d %H:%M:%S")}


db = Database()
