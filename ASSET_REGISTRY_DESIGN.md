# Asset Registry Design

## Purpose

Publish only instruments discovered from the configured provider. The registry does not make up asset names, map external symbols to Quotex symbols, or infer OTC instruments.

## Current discovery source

`BinanceSpotProvider.discover_assets()` reads `/api/v3/exchangeInfo`. It selects records whose provider status is `TRADING` and whose Spot trading permission is true. Invalid or incomplete symbol records are excluded. The resulting category is `CRYPTO`; no other category is implied.

The registry is refreshed on demand and cached in process for 900 seconds by `MarketDataService`. The API supports a `refresh=true` query parameter to force discovery. Category values are derived from currently discovered assets.

## Canonical identity

An asset uses the following normalized fields:

| Field | Current rule |
|---|---|
| `asset_id` | `binance_spot:<provider-symbol>:REGULAR` (for example `binance_spot:BTCUSDT:REGULAR`). |
| `name` | Provider base and quote assets, joined as `BASE/QUOTE`. |
| `symbol` | Exact provider symbol, used in kline requests. |
| `category` | `CRYPTO`. |
| `market_type` | `REGULAR` for this provider. |
| `provider` | `binance_spot`. |
| `supported_timeframes` | Intervals supported by the adapter (1m through 1d, subject to API validation). |
| `availability_status` | Provider's `TRADING` status at discovery time. |
| `last_updated_at` | UTC discovery time, not an instrument quote timestamp. |
| `data_quality_status` | `NOT_CHECKED` until candles pass the separate quality gate. |

Identity comparisons ignore discovery timestamps. Matching duplicate definitions are counted once; conflicting definitions with the same ID fail discovery rather than choosing an arbitrary entry.

## API behavior

- `GET /api/v1/categories?market_type=REGULAR` returns provider-derived categories.
- `GET /api/v1/assets?market_type=REGULAR&category=CRYPTO` returns dynamic assets.
- `GET /api/v1/assets?market_type=OTC` returns an empty list and an explicit unverified-OTC diagnostic.
- Discovery errors and provider rate limits are surfaced; there is no static fallback list.
- Market-data requests reject asset IDs not present in the latest discovered registry.

The current provider returned 1,372 symbols marked tradable at the time of an implementation-time read-only discovery request. This is a point-in-time observation, not a promised count or a persistent allowlist.

## Adding another provider

Before adding an adapter, document permitted use, source market, symbol conventions, categories, timeframes, quote currency, candle boundaries, completion semantics, rate limits, and error behavior. Give its asset IDs a distinct provider namespace. Keep categories and market types explicit; do not merge two providers' instruments under one identity unless equivalence has been verified.
