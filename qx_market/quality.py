import math
from datetime import datetime, timezone
from dataclasses import replace

from qx_market.models import Asset, Candle, MarketType, QualityReport, VerificationStatus, require_utc

KNOWN_PROVIDERS = {"binance_spot"}
TIMEFRAME_SECONDS = {
    "1m": 60,
    "3m": 180,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "2h": 7200,
    "4h": 14400,
    "6h": 21600,
    "8h": 28800,
    "12h": 43200,
    "1d": 86400,
}


class CandleQualityGate:
    def __init__(
        self,
        max_price_jump_fraction: float = 0.20,
        stale_intervals: float = 2.0,
        known_providers: set[str] | None = None,
    ):
        if not 0 < max_price_jump_fraction < 1:
            raise ValueError("max_price_jump_fraction must be between zero and one.")
        if stale_intervals <= 0:
            raise ValueError("stale_intervals must be positive.")
        self.max_price_jump_fraction = max_price_jump_fraction
        self.stale_intervals = stale_intervals
        self.known_providers = known_providers or KNOWN_PROVIDERS

    def validate(
        self,
        asset: Asset,
        candles: tuple[Candle, ...] | list[Candle],
        now: datetime | None = None,
    ) -> QualityReport:
        current_time = require_utc(now or datetime.now(timezone.utc), "now")
        diagnostics: list[str] = []
        bars = tuple(candles)

        if not bars:
            return QualityReport(False, "REJECTED", ("NO_CANDLES: provider returned no completed candles.",), ())
        if asset.provider not in self.known_providers:
            diagnostics.append(f"UNKNOWN_PROVIDER: {asset.provider}.")
        if asset.availability_status != "TRADING":
            diagnostics.append(f"ASSET_UNAVAILABLE: registry status is {asset.availability_status}.")
        if asset.market_type is not MarketType.REGULAR:
            diagnostics.append("MARKET_TYPE_UNVERIFIED: this provider supplies Regular market data only.")

        timeframe = bars[0].timeframe
        seconds = TIMEFRAME_SECONDS.get(timeframe)
        if seconds is None:
            diagnostics.append(f"UNSUPPORTED_TIMEFRAME: {timeframe}.")
        if timeframe not in asset.supported_timeframes:
            diagnostics.append(f"TIMEFRAME_NOT_REGISTERED: {timeframe}.")

        timestamps: set[datetime] = set()
        previous: Candle | None = None
        previous_timestamp: datetime | None = None
        for index, bar in enumerate(bars):
            if bar.asset_id != asset.asset_id:
                diagnostics.append(f"ASSET_MAPPING_MISMATCH: candle {index} belongs to {bar.asset_id}.")
            if bar.market_type is not asset.market_type:
                diagnostics.append(f"MARKET_TYPE_MISMATCH: candle {index} is {bar.market_type.value}.")
            if bar.source != asset.provider:
                diagnostics.append(f"PROVIDER_MISMATCH: candle source {bar.source} != {asset.provider}.")
            if bar.timeframe != timeframe:
                diagnostics.append(f"MIXED_TIMEFRAMES: candle {index} uses {bar.timeframe}.")
            if not bar.is_complete:
                diagnostics.append(f"INCOMPLETE_CANDLE: {bar.timestamp.isoformat()}.")
            if bar.verification_status not in (
                VerificationStatus.PROVIDER_RECEIVED,
                VerificationStatus.QUALITY_PASSED,
            ):
                diagnostics.append(f"UNVERIFIED_CANDLE: {bar.timestamp.isoformat()}.")

            if bar.timestamp in timestamps:
                diagnostics.append(f"DUPLICATE_TIMESTAMP: {bar.timestamp.isoformat()}.")
            timestamps.add(bar.timestamp)
            if previous_timestamp is not None:
                if bar.timestamp <= previous_timestamp:
                    diagnostics.append(f"OUT_OF_ORDER_TIMESTAMP: {bar.timestamp.isoformat()}.")
                elif seconds is not None and (bar.timestamp - previous_timestamp).total_seconds() != seconds:
                    diagnostics.append(
                        f"MISSING_CANDLE: {previous_timestamp.isoformat()} -> {bar.timestamp.isoformat()}."
                    )
            previous_timestamp = bar.timestamp

            values = (bar.open, bar.high, bar.low, bar.close, bar.volume)
            if not all(math.isfinite(value) for value in values):
                diagnostics.append(f"NON_FINITE_OHLCV: {bar.timestamp.isoformat()}.")
            elif min(bar.open, bar.high, bar.low, bar.close) <= 0 or bar.volume < 0:
                diagnostics.append(f"INVALID_PRICE_OR_VOLUME: {bar.timestamp.isoformat()}.")
            elif bar.high < max(bar.open, bar.close, bar.low) or bar.low > min(bar.open, bar.close, bar.high):
                diagnostics.append(f"INVALID_OHLC_RELATIONSHIP: {bar.timestamp.isoformat()}.")

            if bar.timestamp > current_time or bar.close_timestamp > current_time:
                diagnostics.append(f"FUTURE_CANDLE: {bar.timestamp.isoformat()}.")
            if bar.retrieval_timestamp > current_time:
                diagnostics.append(f"FUTURE_RETRIEVAL_TIMESTAMP: {bar.retrieval_timestamp.isoformat()}.")
            if seconds is not None and bar.timestamp.timestamp() % seconds != 0:
                diagnostics.append(f"UNALIGNED_CANDLE_TIMESTAMP: {bar.timestamp.isoformat()}.")
            if bar.close_timestamp < bar.timestamp:
                diagnostics.append(f"INVALID_CANDLE_INTERVAL: {bar.timestamp.isoformat()}.")
            elif seconds is not None and (bar.close_timestamp - bar.timestamp).total_seconds() > seconds:
                diagnostics.append(f"INVALID_CANDLE_INTERVAL: {bar.timestamp.isoformat()}.")

            if previous is not None and previous.close > 0 and math.isfinite(bar.close):
                close_jump = abs(bar.close - previous.close) / previous.close
                open_gap = abs(bar.open - previous.close) / previous.close
                if max(close_jump, open_gap) > self.max_price_jump_fraction:
                    diagnostics.append(
                        f"UNEXPECTED_PRICE_JUMP: {bar.timestamp.isoformat()} exceeds "
                        f"{self.max_price_jump_fraction:.0%} per candle."
                    )

            previous = bar

        last = bars[-1]
        if seconds is not None:
            max_age = seconds * self.stale_intervals
            age = (current_time - last.close_timestamp).total_seconds()
            if age > max_age:
                diagnostics.append(f"STALE_DATA: latest candle closed {age:.0f}s ago.")

        if diagnostics:
            return QualityReport(False, "REJECTED", tuple(dict.fromkeys(diagnostics)), ())

        passed = tuple(replace(bar, verification_status=VerificationStatus.QUALITY_PASSED) for bar in bars)
        return QualityReport(
            True,
            "QUALITY_PASSED",
            ("All received candles passed the configured data-quality checks.",),
            passed,
        )
