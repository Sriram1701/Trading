from typing import Protocol

from qx_market.models import Asset, CandleBatch


class ProviderError(RuntimeError):
    def __init__(self, provider: str, message: str):
        super().__init__(message)
        self.provider = provider


class ProviderRateLimited(ProviderError):
    def __init__(self, provider: str, message: str, retry_after_seconds: int | None = None):
        super().__init__(provider, message)
        self.retry_after_seconds = retry_after_seconds


class MarketDataProvider(Protocol):
    provider_id: str
    base_url: str
    supported_timeframes: tuple[str, ...]

    def discover_assets(self) -> tuple[Asset, ...]:
        ...

    def fetch_candles(self, asset: Asset, timeframe: str, limit: int = 200) -> CandleBatch:
        ...
