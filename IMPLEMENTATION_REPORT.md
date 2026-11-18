# Phase 2 Data Architecture Implementation Report

## Executive summary

The current increment adds a read-only market-data service, dynamic regular-market crypto asset discovery, normalized completed candles, a fail-closed quality gate, SQLite persistence, descriptive indicators, and a local dashboard. The implementation uses Binance Spot public data only. It does not connect to Quotex, analyze OTC prices, generate directional UP/DOWN signals, execute orders, or claim accuracy.

## Completed

- Added typed UTC-aware asset/candle structures and a read-only Binance Spot adapter.
- Added provider-derived asset categories and dynamic listing with duplicate/conflict handling.
- Added quality checks for source/asset/market/timeframe mismatch, malformed OHLCV, gaps, duplicate/out-of-order/future/stale/misaligned/incomplete candles, and extreme jumps.
- Added additive SQLite schema and persistence for assets, source configuration, quality logs, system logs, and quality-passed candles.
- Added a FastAPI service bound to `127.0.0.1:8000` with GET-only endpoints. The static dashboard server now binds to `127.0.0.1:3000`.
- Added descriptive EMA 9/20/50, RSI 14, MACD, Bollinger Bands, ATR, ADX, UTC-day VWAP, 50-bar support/resistance, previous-bar pivot levels, and selected candle-pattern labels.
- Added 5-minute, 15-minute, and 1-hour summaries when the dashboard requests 1-minute analysis.
- Integrated a manual asset/timeframe selector, candlestick chart, data timestamp, higher-timeframe status, and indicators panel.
- Preserved WAIT for OTC, failed quality checks, provider errors, insufficient history, and all regular-market decisions because no directional strategy has been validated.
- Added provider, registry, quality, persistence, API, analysis, and dashboard tests.

## Validation performed

The implementation was validated with:

- `python -m unittest discover -s tests -v`
- `node --test screen_watcher/tests/signal_history.test.js screen_watcher/tests/market_dashboard.test.js`
- Python compile check for `qx_market`, `run_data_api.py`, and `tests`
- Node syntax checks for the dashboard and static server
- `git diff --check`

The first full Python run reported 15 tests passing. The Node suite reported 10 tests passing after correcting the test DOM fixture. Re-run both commands after any further changes. Separate read-only checks against Binance public Spot endpoints confirmed exchange metadata and candle retrieval; no order endpoint or account access was used.

## Not completed / not validated

- No Quotex/QX integration, OTC feed, broker-price mapping, or screenshot-to-OHLC conversion.
- No UP/DOWN strategy, calibrated confidence, historical backtest, out-of-sample validation, payout model, risk sizing, or verified outcome evaluator.
- No signal/outcome persistence workflow; those SQLite tables are placeholders.
- No continuous polling; dashboard refresh is manual.
- No 1-minute/5-minute/15-minute/1-hour consensus rule. Higher-timeframe outputs are descriptive only.
- No Forex, metals, or indices provider.
- No performance or win-rate claim.

## Run locally

Install dependencies with `python -m pip install -r requirements.txt`. In one terminal run `python run_data_api.py`; in another run `node screen_watcher\server.js`. Open `http://127.0.0.1:3000`. The API database defaults to `data\market_data.sqlite3`; set `QX_MARKET_DB` to override it.

The dashboard calls only the local API, which calls Binance's public Spot REST API. If the provider is unavailable, rate-limited, stale, or returns invalid data, the API reports a WAIT diagnostic. OTC always returns `OTC_DATA_UNVERIFIED`.

## Remaining work before strategy development

1. Review the provider authorization and instrument scope for any additional source before adding it.
2. Define source-specific session calendars and test candle completion, timestamp, gap, and staleness behavior against historical fixtures.
3. Add deterministic indicator reference tests against a trusted implementation.
4. Add safe database migrations and tests for a real pre-existing user database before any schema evolution.
5. Design an explicitly approved, tested signal rule and a chronological, cost-aware backtest before enabling directional decisions.
6. Keep the system WAIT-only until out-of-sample evaluation and demo observation establish the required evidence.
