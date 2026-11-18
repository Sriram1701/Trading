import json
import socket
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from qx_market.models import Asset, Candle, CandleBatch, MarketType, VerificationStatus
from qx_market.providers.base import ProviderError, ProviderRateLimited


class BinanceSpotProvider:
    """Read-only adapter for Binance's public Spot REST API."""

    provider_id = "binance_spot"
    base_url = "https://api.binance.com"
    supported_timeframes = (
        "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d"
    )

    def __init__(self, timeout_seconds: float = 10.0):
        self.timeout_seconds = timeout_seconds

    def _get_json(self, path: str, params: dict[str, object] | None = None) -> object:
        query = "?" + urlencode(params) if params else ""
        request = Request(
            self.base_url + path + query,
            headers={"Accept": "application/json", "User-Agent": "qx-market-data/1.0"},
            method="GET",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                body = response.read()
        except HTTPError as error:
            if error.code in (418, 429):
                retry_after = self._retry_after(error.headers.get("Retry-After"))
                raise ProviderRateLimited(
                    self.provider_id,
                    f"Binance rate limit response ({error.code}).",
                    retry_after,
                ) from error
            raise ProviderError(self.provider_id, f"Binance returned HTTP {error.code}.") from error
        except (URLError, TimeoutError, socket.timeout) as error:
            raise ProviderError(self.provider_id, f"Binance request failed: {error.reason if isinstance(error, URLError) else 'timeout'}.") from error

        try:
            return json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ProviderError(self.provider_id, "Binance returned invalid JSON.") from error

    @staticmethod
    def _retry_after(value: str | None) -> int | None:
        if not value:
            return None
        try:
            return max(0, int(value))
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(value)
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=timezone.utc)
                return max(0, int((retry_at - datetime.now(timezone.utc)).total_seconds()))
            except (TypeError, ValueError, OverflowError):
                return None

    def discover_assets(self) -> tuple[Asset, ...]:
        payload = self._get_json("/api/v3/exchangeInfo")
        if not isinstance(payload, dict) or not isinstance(payload.get("symbols"), list):
            raise ProviderError(self.provider_id, "Exchange information has an invalid response shape.")

        retrieved_at = datetime.now(timezone.utc)
        assets = []
        for item in payload["symbols"]:
            if not isinstance(item, dict) or item.get("status") != "TRADING":
                continue
            spot_allowed = item.get("isSpotTradingAllowed")
            if spot_allowed is None:
                spot_allowed = "SPOT" in (item.get("permissions") or [])
            if not spot_allowed:
                continue
            symbol = item.get("symbol")
            base = item.get("baseAsset")
            quote = item.get("quoteAsset")
            if not all(isinstance(value, str) and value for value in (symbol, base, quote)):
                continue
            assets.append(Asset(
                asset_id=f"{self.provider_id}:{symbol}:REGULAR",
                name=f"{base}/{quote}",
                symbol=symbol,
                category="CRYPTO",
                market_type=MarketType.REGULAR,
                provider=self.provider_id,
                supported_timeframes=self.supported_timeframes,
                availability_status="TRADING",
                last_updated_at=retrieved_at,
                data_quality_status="NOT_CHECKED",
            ))
        if not assets:
            raise ProviderError(self.provider_id, "No tradable Spot assets were discovered.")
        return tuple(assets)

    def fetch_candles(self, asset: Asset, timeframe: str, limit: int = 200) -> CandleBatch:
        if asset.provider != self.provider_id or asset.market_type is not MarketType.REGULAR:
            raise ProviderError(self.provider_id, "Asset provider or market type does not match Binance Spot.")
        if timeframe not in self.supported_timeframes:
            raise ProviderError(self.provider_id, f"Unsupported timeframe: {timeframe}.")
        if not 2 <= limit <= 1000:
            raise ValueError("Candle limit must be between 2 and 1000.")

        payload = self._get_json(
            "/api/v3/klines",
            {"symbol": asset.symbol, "interval": timeframe, "limit": limit},
        )
        if not isinstance(payload, list):
            raise ProviderError(self.provider_id, "Kline response has an invalid shape.")

        retrieved_at = datetime.now(timezone.utc)
        candles = []
        excluded_incomplete = 0
        try:
            for row in payload:
                if not isinstance(row, list) or len(row) < 7:
                    raise ValueError("Kline row is incomplete.")
                open_time = datetime.fromtimestamp(int(row[0]) / 1000, timezone.utc)
                close_time = datetime.fromtimestamp(int(row[6]) / 1000, timezone.utc)
                is_complete = close_time < retrieved_at
                if not is_complete:
                    excluded_incomplete += 1
                    continue
                candles.append(Candle(
                    asset_id=asset.asset_id,
                    market_type=MarketType.REGULAR,
                    timeframe=timeframe,
                    timestamp=open_time,
                    open=float(row[1]),
                    high=float(row[2]),
                    low=float(row[3]),
                    close=float(row[4]),
                    volume=float(row[5]),
                    source=self.provider_id,
                    retrieval_timestamp=retrieved_at,
                    verification_status=VerificationStatus.PROVIDER_RECEIVED,
                    close_timestamp=close_time,
                    is_complete=True,
                ))
        except (IndexError, TypeError, ValueError, OverflowError, OSError) as error:
            raise ProviderError(self.provider_id, f"Binance returned an invalid kline: {error}") from error

        return CandleBatch(tuple(candles), excluded_incomplete, retrieved_at)
