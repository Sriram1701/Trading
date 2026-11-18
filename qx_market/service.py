import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from qx_market.database import MarketDatabase
from qx_market.models import Asset, MarketType, iso_utc
from qx_market.providers.base import MarketDataProvider, ProviderError, ProviderRateLimited
from qx_market.providers.binance_spot import BinanceSpotProvider
from qx_market.quality import CandleQualityGate
from qx_market.registry import AssetDiscovery, AssetRegistry

logger = logging.getLogger("qx_market")


@dataclass(frozen=True)
class MarketDataResult:
    market_type: str
    decision: str
    decision_code: str
    asset: dict | None
    timeframe: str | None
    source: str | None
    retrieval_timestamp: str
    data_quality_status: str
    diagnostics: tuple[str, ...]
    candles: tuple[dict, ...]
    retry_after_seconds: int | None = None

    def to_dict(self) -> dict:
        return {
            "market_type": self.market_type,
            "decision": self.decision,
            "decision_code": self.decision_code,
            "asset": self.asset,
            "timeframe": self.timeframe,
            "source": self.source,
            "retrieval_timestamp": self.retrieval_timestamp,
            "data_quality_status": self.data_quality_status,
            "diagnostics": list(self.diagnostics),
            "candles": list(self.candles),
            "retry_after_seconds": self.retry_after_seconds,
        }


class MarketDataService:
    def __init__(
        self,
        database: MarketDatabase | None = None,
        provider: MarketDataProvider | None = None,
        quality_gate: CandleQualityGate | None = None,
        registry_ttl_seconds: int = 900,
    ):
        self.database = database or MarketDatabase(
            os.getenv("QX_MARKET_DB", str(Path("data") / "market_data.sqlite3"))
        )
        self.provider = provider or BinanceSpotProvider()
        self.quality_gate = quality_gate or CandleQualityGate(
            known_providers={self.provider.provider_id}
        )
        self.registry = AssetRegistry((self.provider,))
        self.registry_ttl = timedelta(seconds=registry_ttl_seconds)
        self._discovery: AssetDiscovery | None = None

    def initialize(self) -> None:
        self.database.initialize()
        configured_at = iso_utc(datetime.now(timezone.utc))
        self.database.save_data_source(
            self.provider.provider_id,
            "Binance Spot public REST API",
            self.provider.base_url,
            (MarketType.REGULAR.value,),
            configured_at,
            "CONFIGURED",
            "Provider availability is checked on asset discovery or candle requests.",
        )
        self.database.save_data_source(
            "otc_screen_capture",
            "User-selected screen capture",
            "local",
            (MarketType.OTC.value,),
            configured_at,
            "UNVERIFIED",
            "No OTC price feed or reliable OHLC extraction is configured.",
        )

    def refresh_assets(self, force: bool = False) -> AssetDiscovery:
        now = datetime.now(timezone.utc)
        if not force and self._discovery and now - self._discovery.retrieved_at < self.registry_ttl:
            return self._discovery
        try:
            discovery = self.registry.discover(market_type=MarketType.REGULAR)
            self.database.save_assets(discovery.assets)
            self._discovery = discovery
            self.database.log_system(
                iso_utc(discovery.retrieved_at),
                "INFO",
                "asset_registry",
                f"Discovered {len(discovery.assets)} Binance Spot assets; duplicates={discovery.duplicate_count}.",
            )
            return discovery
        except ProviderError as error:
            logger.error("Asset discovery failed for %s: %s", error.provider, error)
            self.database.log_system(iso_utc(now), "ERROR", "asset_registry", str(error))
            raise
        except ValueError as error:
            logger.error("Asset registry rejected provider output: %s", error)
            self.database.log_system(iso_utc(now), "ERROR", "asset_registry", str(error))
            raise ProviderError(self.provider.provider_id, f"Asset registry rejected provider output: {error}") from error

    def list_assets(
        self,
        market_type: MarketType = MarketType.REGULAR,
        category: str | None = None,
        refresh: bool = False,
    ) -> tuple[Asset, ...]:
        if market_type is MarketType.OTC:
            return ()
        discovery = self.refresh_assets(force=refresh)
        assets = discovery.assets
        if category and category.upper() != "ALL":
            assets = tuple(asset for asset in assets if asset.category == category.upper())
        return assets

    def categories(self, market_type: MarketType = MarketType.REGULAR) -> tuple[str, ...]:
        if market_type is MarketType.OTC:
            return ()
        return tuple(sorted({asset.category for asset in self.list_assets(market_type)}))

    def market_data(
        self,
        market_type: MarketType,
        asset_id: str | None,
        timeframe: str,
        limit: int = 200,
    ) -> MarketDataResult:
        retrieved_at = datetime.now(timezone.utc)
        if market_type is MarketType.OTC:
            diagnostics = (
                "OTC_DATA_UNVERIFIED: no permitted, verified OTC price/candle source is configured.",
                "Screen capture is visual-only and is not converted into OHLC candles.",
            )
            self.database.log_quality(
                iso_utc(retrieved_at), asset_id, market_type.value, timeframe,
                "screen_capture", "UNVERIFIED", diagnostics,
            )
            return MarketDataResult(
                market_type.value,
                "WAIT",
                "OTC_DATA_UNVERIFIED",
                None,
                timeframe,
                None,
                iso_utc(retrieved_at),
                "UNVERIFIED",
                diagnostics,
                (),
            )

        if not asset_id:
            return self._wait(
                "ASSET_REQUIRED",
                "No asset was selected; no market request was made.",
                market_type,
                timeframe,
                retrieved_at,
            )

        try:
            self.refresh_assets()
        except ProviderRateLimited as error:
            return self._wait(
                "PROVIDER_RATE_LIMITED",
                str(error),
                market_type,
                timeframe,
                datetime.now(timezone.utc),
                source=error.provider,
                retry_after_seconds=error.retry_after_seconds,
            )
        except ProviderError as error:
            return self._wait(
                "PROVIDER_UNAVAILABLE",
                str(error),
                market_type,
                timeframe,
                datetime.now(timezone.utc),
                source=error.provider,
            )
        asset = next((candidate for candidate in self._discovery.assets if candidate.asset_id == asset_id), None)
        if asset is None:
            return self._wait(
                "ASSET_NOT_DISCOVERED",
                f"Asset {asset_id} is not in the latest provider-discovered registry.",
                market_type,
                timeframe,
                datetime.now(timezone.utc),
                source=self.provider.provider_id,
            )
        if asset.market_type is not market_type:
            return self._wait(
                "MARKET_TYPE_MISMATCH",
                "Requested market type does not match the discovered asset.",
                market_type,
                timeframe,
                datetime.now(timezone.utc),
                asset=asset.to_dict(),
                source=asset.provider,
            )
        if timeframe not in asset.supported_timeframes:
            return self._wait(
                "TIMEFRAME_UNSUPPORTED",
                f"{timeframe} is not supported for {asset.symbol}.",
                market_type,
                timeframe,
                datetime.now(timezone.utc),
                asset=asset.to_dict(),
                source=asset.provider,
            )

        try:
            batch = self.provider.fetch_candles(asset, timeframe, limit)
        except ProviderRateLimited as error:
            message = str(error)
            self.database.log_system(
                iso_utc(datetime.now(timezone.utc)), "WARNING", "market_data", message
            )
            return self._wait(
                "PROVIDER_RATE_LIMITED",
                message,
                market_type,
                timeframe,
                datetime.now(timezone.utc),
                asset=asset.to_dict(),
                source=error.provider,
                retry_after_seconds=error.retry_after_seconds,
            )
        except ProviderError as error:
            message = str(error)
            self.database.log_system(
                iso_utc(datetime.now(timezone.utc)),
                "ERROR",
                "market_data",
                f"{error.provider}: {message}",
            )
            return self._wait(
                "PROVIDER_UNAVAILABLE",
                message,
                market_type,
                timeframe,
                datetime.now(timezone.utc),
                asset=asset.to_dict(),
                source=error.provider,
            )

        if not batch.candles:
            diagnostics = ("NO_COMPLETED_CANDLES: provider supplied no closed bars.",)
            if batch.excluded_incomplete_count:
                diagnostics += (
                    f"INCOMPLETE_CANDLES_EXCLUDED: {batch.excluded_incomplete_count} open bar(s) were discarded.",
                )
            self.database.log_quality(
                iso_utc(batch.retrieval_timestamp), asset.asset_id, market_type.value,
                timeframe, asset.provider, "REJECTED", diagnostics,
            )
            return self._wait(
                "NO_COMPLETED_CANDLES",
                diagnostics,
                market_type,
                timeframe,
                batch.retrieval_timestamp,
                asset=asset.to_dict(),
                source=asset.provider,
            )

        report = self.quality_gate.validate(asset, batch.candles, now=batch.retrieval_timestamp)
        diagnostics = report.diagnostics
        if batch.excluded_incomplete_count:
            diagnostics += (
                f"INCOMPLETE_CANDLES_EXCLUDED: {batch.excluded_incomplete_count} open bar(s) were excluded before validation.",
            )
        self.database.log_quality(
            iso_utc(batch.retrieval_timestamp),
            asset.asset_id,
            market_type.value,
            timeframe,
            asset.provider,
            report.status,
            diagnostics,
        )
        if not report.passed:
            return MarketDataResult(
                market_type.value, "WAIT", "DATA_QUALITY_REJECTED",
                asset.to_dict(), timeframe, asset.provider,
                iso_utc(batch.retrieval_timestamp), report.status, diagnostics, (),
            )

        self.database.save_candles(report.candles)
        return MarketDataResult(
            market_type.value,
            "WAIT",
            "ANALYSIS_NOT_VALIDATED",
            asset.to_dict(),
            timeframe,
            asset.provider,
            iso_utc(batch.retrieval_timestamp),
            report.status,
            diagnostics + ("Candles passed quality checks; no validated UP/DOWN strategy is enabled.",),
            tuple(candle.to_dict() for candle in report.candles),
        )

    def _wait(
        self,
        code: str,
        diagnostic: str | tuple[str, ...],
        market_type: MarketType,
        timeframe: str,
        retrieved_at: datetime,
        asset: dict | None = None,
        source: str | None = None,
        retry_after_seconds: int | None = None,
    ) -> MarketDataResult:
        diagnostics = (diagnostic,) if isinstance(diagnostic, str) else diagnostic
        self.database.log_quality(
            iso_utc(retrieved_at),
            asset.get("asset_id") if asset else None,
            market_type.value,
            timeframe,
            source or "none",
            "REJECTED",
            diagnostics,
        )
        return MarketDataResult(
            market_type.value,
            "WAIT",
            code,
            asset,
            timeframe,
            source,
            iso_utc(retrieved_at),
            "REJECTED",
            diagnostics,
            (),
            retry_after_seconds,
        )
