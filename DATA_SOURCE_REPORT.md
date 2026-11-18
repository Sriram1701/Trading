# Data Source Report

## Verified configuration

| Source | Current status | Scope | Authentication | Use |
|---|---|---|---|---|
| Binance Spot public REST API (`https://api.binance.com`) | Adapter implemented; public read-only endpoints were manually tested during implementation. | Tradable crypto Spot pairs only. | No API key is required for these public requests. | Dynamic instrument discovery and OHLCV klines. |
| User-selected screen/camera capture | Visual-only, unverified. | User's displayed pixels, with no verified instrument or market timestamps. | Browser permission only. | Existing independent visual prototype; never converted to OHLC. |
| Quotex/QX Broker data | Not integrated or verified. | None. | No credentials are requested or stored. | Not available. |
| Forex, metals, indices, OTC prices | No configured provider in `qx_market`. | None. | N/A. | WAIT / unavailable. |

## Binance adapter details

- Discovery endpoint: `GET /api/v3/exchangeInfo`.
- Candle endpoint: `GET /api/v3/klines` with provider symbol, interval, and bounded limit.
- The adapter uses Python's standard-library `urllib`; it sends GET requests only.
- Candles are normalized to UTC timestamps and include OHLC, volume, provider/source, retrieval time, close time, and completion status.
- Open/incomplete klines are excluded and counted. HTTP 418/429 responses are represented as rate-limit failures; `Retry-After` is retained when parseable.
- The provider's exchange price is not the price of a Quotex instrument, and it is not evidence that any Quotex asset has the same price series.

The adapter is read-only and has no trading/order code. The endpoints were tested without account access: exchange metadata returned tradable Spot symbols, and the kline endpoint returned bars. A public endpoint's availability can change; the application reports provider errors rather than substituting synthetic data.

## Limits and status language

`CONFIGURED` means an adapter is configured; it is not a guarantee of current provider availability. Availability is checked when the client requests discovery or candles. The browser's public-market panel is manually refreshed and does not continuously poll. Rate limiting, network outage, stale data, and quality rejection all produce visible WAIT diagnostics.

No historic-versus-live accuracy claim is made. The provider does not supply Quotex OTC candles. The project does not scrape broker pages, intercept browser sessions, request broker credentials, or use undocumented broker APIs.
