# Read-Only Market Data Architecture

## Status and scope

This is the Phase 2 provider/data foundation, not a validated trading system. The only configured external source is Binance Spot's public REST API, which supplies crypto exchange data. No Quotex/QX Broker data, Forex, metals, indices, OTC prices, or broker execution is integrated. The browser continues to show WAIT; the new market-data panel is separate from the visual screen-capture prototype.

## Request and data flow

```text
Dashboard (127.0.0.1:3000)
  └─ GET /api/v1/analysis (127.0.0.1:8000)
      ├─ MarketDataService checks market type and dynamic asset registry
      ├─ BinanceSpotProvider retrieves public exchange metadata / klines
      ├─ Provider normalizes timestamps, OHLCV, source, and completion status
      ├─ CandleQualityGate rejects invalid, incomplete, stale, misaligned,
      │  duplicated, out-of-order, gapped, or implausibly discontinuous candles
      ├─ SQLite stores discovered assets, accepted candles, and quality logs
      ├─ Analysis calculates descriptive indicators from quality-passed candles
      └─ API returns WAIT and explicit diagnostics; no UP/DOWN rule is enabled
```

For a 1-minute request, the API separately requests 5-minute, 15-minute, and 1-hour candles and returns descriptive timeframe summaries. If any timeframe is unavailable or fails quality checks, that timeframe remains unavailable. Higher-timeframe checks do not change the WAIT-only decision.

## Modules

| Module | Responsibility |
|---|---|
| `qx_market/models.py` | UTC-aware asset, candle, batch, and quality-result types. |
| `qx_market/providers/base.py` | Provider error and rate-limit exceptions. |
| `qx_market/providers/binance_spot.py` | Read-only public Binance Spot discovery and kline adapter. |
| `qx_market/registry.py` | Deduplicates provider-discovered assets; rejects conflicting definitions. |
| `qx_market/quality.py` | Fail-closed validation of completed candles and market/source consistency. |
| `qx_market/database.py` | Additive SQLite initialization and persistence helpers. |
| `qx_market/service.py` | Registry caching, provider/quality orchestration, diagnostics, and WAIT responses. |
| `qx_market/analysis.py` | Descriptive indicator and candle-pattern calculations; never emits a directional decision. |
| `qx_market/api.py` | Read-only FastAPI GET endpoints and local-origin CORS policy. |
| `run_data_api.py` | Starts the API bound to `127.0.0.1`. |
| `screen_watcher/public/market_dashboard.js` | Manual asset selection, market-data retrieval, chart, and summary rendering. |

## Market separation and fail-closed behavior

- Assets and candles carry an explicit `REGULAR` or `OTC` market type and provider identifier.
- The configured provider only discovers `REGULAR` Binance Spot assets. The asset registry returns no OTC asset list.
- Every OTC data/analysis request returns `WAIT` with `OTC_DATA_UNVERIFIED`; screenshots are not converted into candles.
- No asset, source, candle, or price is inferred when a provider returns no data.
- Data quality failures produce WAIT and no candles are presented as verified measurements.
- Quality-passed candles are provider-received measurements with a quality status, not broker-equivalent or predictive data.
- There are no order routes, clicker integration, trading credentials, or execution calls in the API.
- `signals` and `signal_outcomes` tables are schema placeholders; a validated signal/outcome lifecycle is not implemented.

## Provider extension point

An additional provider should implement the same discovery/fetch behavior as the existing adapter and explicitly declare supported market types, categories, symbols, and intervals. It must not be added until its authorization, market identity, timestamps, candle completion semantics, rate limits, and error behavior are documented and tested. A provider adapter cannot mark OTC data verified merely because it returns numeric prices.

## Persistence

SQLite is initialized with `CREATE TABLE IF NOT EXISTS` statements, foreign keys, indexes, and `PRAGMA user_version`. Existing tables are not dropped. The default file is `data/market_data.sqlite3`; `QX_MARKET_DB` can point to another path. The default database and its SQLite journal files are Git-ignored.

See [ASSET_REGISTRY_DESIGN.md](ASSET_REGISTRY_DESIGN.md), [DATA_QUALITY_RULES.md](DATA_QUALITY_RULES.md), and [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).
