import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from qx_market.models import Asset, Candle, MarketType, iso_utc

SCHEMA_VERSION = 1

TABLES = (
    """
    CREATE TABLE IF NOT EXISTS assets (
        asset_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        category TEXT NOT NULL,
        market_type TEXT NOT NULL CHECK (market_type IN ('REGULAR', 'OTC')),
        provider TEXT NOT NULL,
        supported_timeframes TEXT NOT NULL,
        availability_status TEXT NOT NULL,
        last_updated_at TEXT NOT NULL,
        data_quality_status TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS data_sources (
        provider_id TEXT PRIMARY KEY,
        provider_name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        market_types TEXT NOT NULL,
        last_updated_at TEXT NOT NULL,
        status TEXT NOT NULL,
        diagnostic TEXT NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS market_candles (
        candle_id INTEGER PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES assets(asset_id),
        market_type TEXT NOT NULL CHECK (market_type IN ('REGULAR', 'OTC')),
        timeframe TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        source TEXT NOT NULL,
        retrieval_timestamp TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        close_timestamp TEXT NOT NULL,
        UNIQUE (asset_id, market_type, timeframe, timestamp, source)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS screen_captures (
        capture_id TEXT PRIMARY KEY,
        asset_id TEXT,
        market_type TEXT NOT NULL CHECK (market_type = 'OTC'),
        timeframe TEXT,
        captured_at TEXT NOT NULL,
        source TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        image_sha256 TEXT,
        diagnostic TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS data_quality_logs (
        log_id INTEGER PRIMARY KEY,
        recorded_at TEXT NOT NULL,
        asset_id TEXT,
        market_type TEXT NOT NULL,
        timeframe TEXT,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        diagnostics TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS indicators (
        indicator_id INTEGER PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES assets(asset_id),
        market_type TEXT NOT NULL CHECK (market_type IN ('REGULAR', 'OTC')),
        timeframe TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        name TEXT NOT NULL,
        value REAL,
        source TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        UNIQUE (asset_id, market_type, timeframe, timestamp, name, source)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS signals (
        signal_id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES assets(asset_id),
        market_type TEXT NOT NULL CHECK (market_type IN ('REGULAR', 'OTC')),
        decision TEXT NOT NULL CHECK (decision IN ('UP', 'DOWN', 'WAIT')),
        timestamp TEXT NOT NULL,
        source TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        indicator_summary TEXT NOT NULL,
        explanation TEXT NOT NULL,
        data_quality_status TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS signal_outcomes (
        outcome_id TEXT PRIMARY KEY,
        signal_id TEXT NOT NULL REFERENCES signals(signal_id),
        outcome TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        source TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
        UNIQUE (signal_id, source)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS system_logs (
        log_id INTEGER PRIMARY KEY,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        component TEXT NOT NULL,
        message TEXT NOT NULL
    )
    """,
)

INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_assets_market_category ON assets(market_type, category, availability_status)",
    "CREATE INDEX IF NOT EXISTS idx_candles_lookup ON market_candles(asset_id, market_type, timeframe, timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_quality_logs_lookup ON data_quality_logs(asset_id, market_type, recorded_at)",
    "CREATE INDEX IF NOT EXISTS idx_indicators_lookup ON indicators(asset_id, market_type, timeframe, timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_signals_lookup ON signals(asset_id, market_type, timeframe, timestamp)",
)


class MarketDatabase:
    def __init__(self, path: str | Path):
        self.path = Path(path)

    @contextmanager
    def _connection(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self) -> None:
        with self._connection() as connection:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            if version > SCHEMA_VERSION:
                raise RuntimeError(
                    f"Database schema version {version} is newer than supported version {SCHEMA_VERSION}."
                )
            if version == 0:
                for statement in TABLES:
                    connection.execute(statement)
                for statement in INDEXES:
                    connection.execute(statement)
                connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    def save_assets(self, assets: tuple[Asset, ...]) -> None:
        with self._connection() as connection:
            for asset in assets:
                connection.execute(
                    """
                    INSERT INTO assets (
                        asset_id, name, symbol, category, market_type, provider,
                        supported_timeframes, availability_status, last_updated_at, data_quality_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(asset_id) DO UPDATE SET
                        name=excluded.name,
                        symbol=excluded.symbol,
                        category=excluded.category,
                        market_type=excluded.market_type,
                        provider=excluded.provider,
                        supported_timeframes=excluded.supported_timeframes,
                        availability_status=excluded.availability_status,
                        last_updated_at=excluded.last_updated_at,
                        data_quality_status=excluded.data_quality_status
                    """,
                    (
                        asset.asset_id,
                        asset.name,
                        asset.symbol,
                        asset.category,
                        asset.market_type.value,
                        asset.provider,
                        json.dumps(asset.supported_timeframes),
                        asset.availability_status,
                        iso_utc(asset.last_updated_at),
                        asset.data_quality_status,
                    ),
                )

    def save_data_source(
        self,
        provider_id: str,
        provider_name: str,
        base_url: str,
        market_types: tuple[str, ...],
        last_updated_at: str,
        status: str,
        diagnostic: str = "",
    ) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO data_sources (
                    provider_id, provider_name, base_url, market_types, last_updated_at, status, diagnostic
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(provider_id) DO UPDATE SET
                    provider_name=excluded.provider_name,
                    base_url=excluded.base_url,
                    market_types=excluded.market_types,
                    last_updated_at=excluded.last_updated_at,
                    status=excluded.status,
                    diagnostic=excluded.diagnostic
                """,
                (
                    provider_id,
                    provider_name,
                    base_url,
                    json.dumps(market_types),
                    last_updated_at,
                    status,
                    diagnostic,
                ),
            )

    def get_asset(self, asset_id: str) -> Asset | None:
        with self._connection() as connection:
            row = connection.execute("SELECT * FROM assets WHERE asset_id = ?", (asset_id,)).fetchone()
        if row is None:
            return None
        return Asset(
            asset_id=row["asset_id"],
            name=row["name"],
            symbol=row["symbol"],
            category=row["category"],
            market_type=MarketType(row["market_type"]),
            provider=row["provider"],
            supported_timeframes=tuple(json.loads(row["supported_timeframes"])),
            availability_status=row["availability_status"],
            last_updated_at=datetime.fromisoformat(row["last_updated_at"].replace("Z", "+00:00")),
            data_quality_status=row["data_quality_status"],
        )

    def save_candles(self, candles: tuple[Candle, ...]) -> int:
        inserted = 0
        with self._connection() as connection:
            for candle in candles:
                cursor = connection.execute(
                    """
                    INSERT INTO market_candles (
                        asset_id, market_type, timeframe, timestamp, open, high, low, close,
                        volume, source, retrieval_timestamp, verification_status, close_timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(asset_id, market_type, timeframe, timestamp, source) DO NOTHING
                    """,
                    (
                        candle.asset_id,
                        candle.market_type.value,
                        candle.timeframe,
                        iso_utc(candle.timestamp),
                        candle.open,
                        candle.high,
                        candle.low,
                        candle.close,
                        candle.volume,
                        candle.source,
                        iso_utc(candle.retrieval_timestamp),
                        candle.verification_status.value,
                        iso_utc(candle.close_timestamp),
                    ),
                )
                inserted += cursor.rowcount
        return inserted

    def log_quality(
        self,
        recorded_at: str,
        asset_id: str | None,
        market_type: str,
        timeframe: str | None,
        source: str,
        status: str,
        diagnostics: tuple[str, ...],
    ) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO data_quality_logs
                    (recorded_at, asset_id, market_type, timeframe, source, status, diagnostics)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (recorded_at, asset_id, market_type, timeframe, source, status, json.dumps(diagnostics)),
            )

    def log_system(self, timestamp: str, level: str, component: str, message: str) -> None:
        with self._connection() as connection:
            connection.execute(
                "INSERT INTO system_logs (timestamp, level, component, message) VALUES (?, ?, ?, ?)",
                (timestamp, level, component, message),
            )

    def list_assets(self, market_type: str | None = None, category: str | None = None) -> tuple[Asset, ...]:
        clauses = []
        parameters: list[str] = []
        if market_type:
            clauses.append("market_type = ?")
            parameters.append(market_type)
        if category and category.upper() != "ALL":
            clauses.append("category = ?")
            parameters.append(category.upper())
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        with self._connection() as connection:
            rows = connection.execute("SELECT * FROM assets" + where + " ORDER BY category, symbol", parameters).fetchall()
        return tuple(
            Asset(
                asset_id=row["asset_id"],
                name=row["name"],
                symbol=row["symbol"],
                category=row["category"],
                market_type=MarketType(row["market_type"]),
                provider=row["provider"],
                supported_timeframes=tuple(json.loads(row["supported_timeframes"])),
                availability_status=row["availability_status"],
                last_updated_at=datetime.fromisoformat(
                    row["last_updated_at"].replace("Z", "+00:00")
                ),
                data_quality_status=row["data_quality_status"],
            )
            for row in rows
        )

