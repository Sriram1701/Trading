from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

from qx_market.models import Asset, MarketType
from qx_market.providers.base import MarketDataProvider


@dataclass(frozen=True)
class AssetDiscovery:
    assets: tuple[Asset, ...]
    retrieved_at: datetime
    duplicate_count: int


class AssetRegistry:
    """Normalizes discovered assets without inventing instruments."""

    def __init__(self, providers: Iterable[MarketDataProvider]):
        self.providers = tuple(providers)

    def discover(
        self,
        market_type: MarketType | None = None,
        category: str | None = None,
    ) -> AssetDiscovery:
        discovered: dict[str, Asset] = {}
        duplicate_count = 0
        retrieved_at = datetime.now(timezone.utc)

        for provider in self.providers:
            if market_type is MarketType.OTC:
                continue
            provider_assets = provider.discover_assets()
            for asset in provider_assets:
                if market_type is not None and asset.market_type is not market_type:
                    continue
                if category and category.upper() != "ALL" and asset.category != category.upper():
                    continue
                existing = discovered.get(asset.asset_id)
                if existing is None:
                    discovered[asset.asset_id] = asset
                else:
                    same_identity = (
                        existing.name == asset.name
                        and existing.symbol == asset.symbol
                        and existing.category == asset.category
                        and existing.market_type is asset.market_type
                        and existing.provider == asset.provider
                        and existing.supported_timeframes == asset.supported_timeframes
                        and existing.availability_status == asset.availability_status
                    )
                    if not same_identity:
                        raise ValueError(f"Conflicting duplicate asset definition: {asset.asset_id}")
                    duplicate_count += 1

        assets = tuple(sorted(discovered.values(), key=lambda item: (item.category, item.symbol)))
        return AssetDiscovery(assets, retrieved_at, duplicate_count)

    def categories(self, market_type: MarketType = MarketType.REGULAR) -> tuple[str, ...]:
        if market_type is MarketType.OTC:
            return ()
        discovery = self.discover(market_type=market_type)
        return tuple(sorted({asset.category for asset in discovery.assets}))
