from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class MarketType(str, Enum):
    REGULAR = "REGULAR"
    OTC = "OTC"


class VerificationStatus(str, Enum):
    UNVERIFIED = "UNVERIFIED"
    PROVIDER_RECEIVED = "PROVIDER_RECEIVED"
    QUALITY_PASSED = "QUALITY_PASSED"
    REJECTED = "REJECTED"


def require_utc(value: datetime, field_name: str) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must be a timezone-aware datetime.")
    return value.astimezone(timezone.utc)


def iso_utc(value: datetime) -> str:
    return require_utc(value, "timestamp").isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class Asset:
    asset_id: str
    name: str
    symbol: str
    category: str
    market_type: MarketType
    provider: str
    supported_timeframes: tuple[str, ...]
    availability_status: str
    last_updated_at: datetime
    data_quality_status: str = "NOT_CHECKED"

    def __post_init__(self) -> None:
        if not self.asset_id or not self.name or not self.symbol or not self.provider:
            raise ValueError("Asset identifiers, name, symbol, and provider are required.")
        if not self.supported_timeframes:
            raise ValueError("Asset must declare at least one supported timeframe.")
        object.__setattr__(self, "last_updated_at", require_utc(self.last_updated_at, "last_updated_at"))

    def to_dict(self) -> dict[str, Any]:
        return {
            "asset_id": self.asset_id,
            "name": self.name,
            "symbol": self.symbol,
            "category": self.category,
            "market_type": self.market_type.value,
            "provider": self.provider,
            "supported_timeframes": list(self.supported_timeframes),
            "availability_status": self.availability_status,
            "last_updated_at": iso_utc(self.last_updated_at),
            "data_quality_status": self.data_quality_status,
        }


@dataclass(frozen=True)
class Candle:
    asset_id: str
    market_type: MarketType
    timeframe: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    source: str
    retrieval_timestamp: datetime
    verification_status: VerificationStatus
    close_timestamp: datetime
    is_complete: bool

    def __post_init__(self) -> None:
        object.__setattr__(self, "timestamp", require_utc(self.timestamp, "timestamp"))
        object.__setattr__(
            self, "retrieval_timestamp", require_utc(self.retrieval_timestamp, "retrieval_timestamp")
        )
        object.__setattr__(self, "close_timestamp", require_utc(self.close_timestamp, "close_timestamp"))
        if not self.asset_id or not self.timeframe or not self.source:
            raise ValueError("Candle asset, timeframe, and source are required.")

    def to_dict(self) -> dict[str, Any]:
        return {
            "asset_id": self.asset_id,
            "market_type": self.market_type.value,
            "timeframe": self.timeframe,
            "timestamp": iso_utc(self.timestamp),
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
            "source": self.source,
            "retrieval_timestamp": iso_utc(self.retrieval_timestamp),
            "verification_status": self.verification_status.value,
            "close_timestamp": iso_utc(self.close_timestamp),
            "is_complete": self.is_complete,
        }


@dataclass(frozen=True)
class CandleBatch:
    candles: tuple[Candle, ...]
    excluded_incomplete_count: int
    retrieval_timestamp: datetime


@dataclass(frozen=True)
class QualityReport:
    passed: bool
    status: str
    diagnostics: tuple[str, ...]
    candles: tuple[Candle, ...]
