import asyncio
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

from qx_market.analysis import analyze_candles
from qx_market.api import create_app
from qx_market.database import MarketDatabase
from qx_market.models import (
    Asset,
    Candle,
    CandleBatch,
    MarketType,
    VerificationStatus,
)
from qx_market.providers.base import ProviderRateLimited
from qx_market.providers.binance_spot import BinanceSpotProvider
from qx_market.quality import CandleQualityGate
from qx_market.registry import AssetRegistry
from qx_market.service import MarketDataService


def build_asset(updated_at=None):
    return Asset(
        asset_id="binance_spot:BTCUSDT:REGULAR",
        name="BTC/USDT",
        symbol="BTCUSDT",
        category="CRYPTO",
        market_type=MarketType.REGULAR,
        provider="binance_spot",
        supported_timeframes=("1m", "5m", "15m", "1h"),
        availability_status="TRADING",
        last_updated_at=updated_at or datetime.now(timezone.utc),
    )


def build_candles(asset, count=70, timeframe="1m"):
    seconds = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600}[timeframe]
    now = datetime.now(timezone.utc)
    last_epoch = int(now.timestamp()) // seconds * seconds - seconds
    last_open = datetime.fromtimestamp(last_epoch, timezone.utc)
    first_open = last_open - timedelta(seconds=seconds * (count - 1))
    bars = []
    for index in range(count):
        timestamp = first_open + timedelta(seconds=seconds * index)
        close = 100.0 + index * 0.05 + (0.02 if index % 2 else 0.0)
        bars.append(Candle(
            asset_id=asset.asset_id,
            market_type=MarketType.REGULAR,
            timeframe=timeframe,
            timestamp=timestamp,
            open=close - 0.01,
            high=close + 0.08,
            low=close - 0.08,
            close=close,
            volume=10.0,
            source=asset.provider,
            retrieval_timestamp=now,
            verification_status=VerificationStatus.PROVIDER_RECEIVED,
            close_timestamp=timestamp + timedelta(seconds=seconds) - timedelta(milliseconds=1),
            is_complete=True,
        ))
    return tuple(bars)


class StaticProvider:
    provider_id = "binance_spot"
    base_url = "https://api.binance.com"
    supported_timeframes = ("1m", "5m", "15m", "1h")

    def __init__(self, limited=False):
        self.asset = build_asset()
        self.limited = limited

    def discover_assets(self):
        if self.limited:
            raise ProviderRateLimited(self.provider_id, "rate limited", 30)
        return (self.asset,)

    def fetch_candles(self, asset, timeframe, limit=200):
        return CandleBatch(build_candles(asset, limit, timeframe), 0, datetime.now(timezone.utc))


class AssetProvider:
    def __init__(self, assets):
        self.assets = assets

    def discover_assets(self):
        return self.assets


async def _send_api_requests(app, requests):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return [
            await client.get(path, params=params)
            for path, params in requests
        ]


class MarketArchitectureTests(unittest.TestCase):
    def test_quality_gate_rejects_duplicate_missing_and_invalid_ohlc(self):
        asset = build_asset()
        bars = build_candles(asset)
        now = datetime.now(timezone.utc)
        gate = CandleQualityGate()
        self.assertTrue(gate.validate(asset, bars, now).passed)

        duplicate = list(bars)
        duplicate[-1] = Candle(**{
            **duplicate[-1].__dict__,
            "timestamp": duplicate[-2].timestamp,
        })
        report = gate.validate(asset, duplicate, now)
        self.assertFalse(report.passed)
        self.assertTrue(any("DUPLICATE_TIMESTAMP" in item for item in report.diagnostics))

        missing = list(bars)
        missing[-1] = Candle(**{
            **missing[-1].__dict__,
            "timestamp": missing[-1].timestamp + timedelta(minutes=1),
            "close_timestamp": missing[-1].close_timestamp + timedelta(minutes=1),
        })
        report = gate.validate(asset, missing, now + timedelta(minutes=1))
        self.assertTrue(any("MISSING_CANDLE" in item for item in report.diagnostics))

        invalid = list(bars)
        invalid[-1] = Candle(**{
            **invalid[-1].__dict__,
            "high": invalid[-1].low - 1,
        })
        report = gate.validate(asset, invalid, now)
        self.assertTrue(any("INVALID_OHLC_RELATIONSHIP" in item for item in report.diagnostics))

    def test_quality_gate_rejects_incomplete_stale_and_future_data(self):
        asset = build_asset()
        bars = list(build_candles(asset))
        gate = CandleQualityGate()
        incomplete = list(bars)
        incomplete[-1] = Candle(**{**incomplete[-1].__dict__, "is_complete": False})
        now = datetime.now(timezone.utc)
        report = gate.validate(asset, incomplete, now)
        self.assertTrue(any("INCOMPLETE_CANDLE" in item for item in report.diagnostics))

        stale_now = bars[-1].close_timestamp + timedelta(minutes=5)
        report = gate.validate(asset, bars, stale_now)
        self.assertTrue(any("STALE_DATA" in item for item in report.diagnostics))

        future = list(bars)
        future[-1] = Candle(**{
            **future[-1].__dict__,
            "timestamp": future[-1].timestamp + timedelta(minutes=1),
            "close_timestamp": future[-1].close_timestamp + timedelta(minutes=1),
        })
        report = gate.validate(asset, future, now)
        self.assertTrue(any("FUTURE_CANDLE" in item for item in report.diagnostics))

        future_retrieval = list(bars)
        future_retrieval[-1] = Candle(**{
            **future_retrieval[-1].__dict__,
            "retrieval_timestamp": now + timedelta(seconds=1),
        })
        report = gate.validate(asset, future_retrieval, now)
        self.assertTrue(any("FUTURE_RETRIEVAL_TIMESTAMP" in item for item in report.diagnostics))

        invalid_interval = list(bars)
        invalid_interval[-1] = Candle(**{
            **invalid_interval[-1].__dict__,
            "close_timestamp": invalid_interval[-1].timestamp + timedelta(minutes=2),
        })
        report = gate.validate(asset, invalid_interval, now + timedelta(minutes=2))
        self.assertTrue(any("INVALID_CANDLE_INTERVAL" in item for item in report.diagnostics))

    def test_registry_deduplicates_identity_and_rejects_conflict(self):
        first = build_asset(datetime.now(timezone.utc))
        second = build_asset(datetime.now(timezone.utc) + timedelta(seconds=1))
        result = AssetRegistry((AssetProvider((first,)), AssetProvider((second,)))).discover()
        self.assertEqual(len(result.assets), 1)
        self.assertEqual(result.duplicate_count, 1)

        conflicting = Asset(**{**second.__dict__, "symbol": "OTHER"})
        with self.assertRaisesRegex(ValueError, "Conflicting duplicate"):
            AssetRegistry((AssetProvider((first,)), AssetProvider((conflicting,)))).discover()

    def test_binance_provider_excludes_open_candles_and_normalizes_completed_rows(self):
        provider = BinanceSpotProvider()
        now = datetime.now(timezone.utc)
        minute = now.replace(second=0, microsecond=0)
        opens = [
            minute - timedelta(minutes=2),
            minute - timedelta(minutes=1),
            minute,
        ]
        rows = []
        for index, opened_at in enumerate(opens):
            close_at = opened_at + timedelta(minutes=1) - timedelta(milliseconds=1)
            rows.append([
                int(opened_at.timestamp() * 1000),
                "100.0", "102.0", "99.0", str(101 + index), "10.0",
                int(close_at.timestamp() * 1000),
            ])
        provider._get_json = lambda path, params=None: rows
        batch = provider.fetch_candles(build_asset(), "1m", 3)
        self.assertEqual(len(batch.candles), 2)
        self.assertEqual(batch.excluded_incomplete_count, 1)
        self.assertEqual(batch.candles[0].source, "binance_spot")
        self.assertTrue(batch.candles[0].is_complete)
        self.assertEqual(batch.candles[0].market_type, MarketType.REGULAR)

    def test_database_initialization_preserves_existing_data_and_is_repeatable(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "market.sqlite3"
            connection = sqlite3.connect(path)
            connection.execute("CREATE TABLE legacy_records (value TEXT NOT NULL)")
            connection.execute("INSERT INTO legacy_records VALUES ('keep')")
            connection.commit()
            connection.close()

            database = MarketDatabase(path)
            database.initialize()
            database.initialize()
            database.save_assets((build_asset(),))
            database.save_data_source(
                "binance_spot", "Binance Spot", "https://api.binance.com",
                ("REGULAR",), datetime.now(timezone.utc).isoformat(), "CONFIGURED",
            )
            connection = sqlite3.connect(path)
            preserved = connection.execute("SELECT value FROM legacy_records").fetchone()[0]
            tables = {
                row[0] for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            connection.close()
            self.assertEqual(preserved, "keep")
            self.assertIn("market_candles", tables)
            self.assertEqual(database.get_asset("binance_spot:BTCUSDT:REGULAR").symbol, "BTCUSDT")

    def test_analysis_is_wait_only_and_requires_quality_pass(self):
        result = analyze_candles(
            [],
            market_type="REGULAR",
            data_quality_status="REJECTED",
            decision_code="DATA_QUALITY_REJECTED",
        )
        self.assertEqual(result["decision"], "WAIT")
        self.assertEqual(result["decision_code"], "DATA_QUALITY_REJECTED")
        self.assertEqual(result["indicators"], {})

        asset = build_asset()
        candles = [bar.to_dict() for bar in build_candles(asset)]
        result = analyze_candles(
            candles,
            market_type="REGULAR",
            data_quality_status="QUALITY_PASSED",
            decision_code="ANALYSIS_NOT_VALIDATED",
        )
        self.assertEqual(result["decision"], "WAIT")
        self.assertEqual(result["decision_code"], "ANALYSIS_NOT_VALIDATED")
        self.assertIsNotNone(result["indicators"]["ema_50"])
        self.assertIsNotNone(result["indicators"]["rsi_14"])
        self.assertIsNotNone(result["indicators"]["adx_14"])
        self.assertIn("ema_alignment", result["indicators"])

    def test_flat_ohlc_indicators_match_known_values(self):
        asset = build_asset()
        candles = [
            Candle(**{
                **bar.__dict__,
                "open": 100.0,
                "high": 100.0,
                "low": 100.0,
                "close": 100.0,
            }).to_dict()
            for bar in build_candles(asset, count=70)
        ]
        result = analyze_candles(
            candles,
            market_type="REGULAR",
            data_quality_status="QUALITY_PASSED",
            decision_code="ANALYSIS_NOT_VALIDATED",
        )
        indicators = result["indicators"]
        for key in ("ema_9", "ema_20", "ema_50", "rsi_14", "atr_14", "adx_14"):
            self.assertAlmostEqual(indicators[key], 100.0 if key.startswith("ema_") else (
                50.0 if key == "rsi_14" else 0.0
            ))
        self.assertEqual(indicators["macd_12_26_9"], {
            "line": 0.0, "signal": 0.0, "histogram": 0.0,
        })
        self.assertEqual(indicators["bollinger_20_2"], {
            "lower": 100.0, "middle": 100.0, "upper": 100.0,
        })
        self.assertEqual(indicators["support_resistance_50"], {
            "support": 100.0, "resistance": 100.0,
        })

    def test_api_exposes_live_provider_and_keeps_otc_wait_only(self):
        with tempfile.TemporaryDirectory() as temporary:
            database_path = Path(temporary) / "market.sqlite3"
            service = MarketDataService(
                database=MarketDatabase(database_path),
                provider=StaticProvider(),
            )
            service.initialize()
            app = create_app(service)
            responses = asyncio.run(_send_api_requests(app, [
                ("/api/v1/data-sources", {}),
                ("/api/v1/analysis", {"market_type": "OTC"}),
                ("/api/v1/analysis", {
                    "asset_id": service.provider.asset.asset_id, "timeframe": "1m"
                }),
            ]))
            sources = responses[0].json()["sources"]
            self.assertEqual(sources[0]["asset_categories"], ["CRYPTO"])
            self.assertEqual(sources[1]["status"], "UNVERIFIED")
            otc = responses[1].json()
            self.assertEqual(otc["decision"], "WAIT")
            self.assertEqual(otc["decision_code"], "OTC_DATA_UNVERIFIED")
            self.assertEqual(otc["candles"], [])
            market = responses[2].json()
            self.assertEqual(market["decision"], "WAIT")
            self.assertEqual(market["data_quality_status"], "QUALITY_PASSED")
            self.assertEqual(set(market["multi_timeframe"]), {"5m", "15m", "1h"})
            self.assertTrue(all(
                summary["decision"] == "WAIT"
                for summary in market["multi_timeframe"].values()
            ))
            methods = {
                method
                for route in app.routes
                if getattr(route, "methods", None)
                and route.path.startswith("/api/v1/")
                for method in route.methods
            }
            self.assertEqual(methods, {"GET"})
            connection = sqlite3.connect(database_path)
            candle_count = connection.execute("SELECT COUNT(*) FROM market_candles").fetchone()[0]
            quality_count = connection.execute("SELECT COUNT(*) FROM data_quality_logs").fetchone()[0]
            connection.close()
            self.assertGreater(candle_count, 0)
            self.assertGreater(quality_count, 0)

    def test_api_preserves_provider_retry_after(self):
        with tempfile.TemporaryDirectory() as temporary:
            service = MarketDataService(
                database=MarketDatabase(Path(temporary) / "market.sqlite3"),
                provider=StaticProvider(limited=True),
            )
            service.initialize()
            response = asyncio.run(_send_api_requests(
                create_app(service), [("/api/v1/assets", {})]
            ))[0]
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.json()["detail"]["retry_after_seconds"], 30)


if __name__ == "__main__":
    unittest.main()
