# SQLite Schema

## Initialization and migration safety

`MarketDatabase.initialize()` creates tables and indexes with `IF NOT EXISTS` when `PRAGMA user_version` is 0, then sets schema version 1. It rejects a database version newer than the code supports. It does not drop existing tables. The current schema has not been used to migrate an older production database.

Default location: `data/market_data.sqlite3`, overridable with `QX_MARKET_DB`. SQLite foreign keys and a 10-second busy timeout are enabled on each connection. Values are parameterized.

## Tables

| Table | Purpose and key fields |
|---|---|
| `assets` | Discovered instrument metadata keyed by `asset_id`, including category, provider, market type, supported intervals, availability, and quality status. |
| `data_sources` | Provider ID, display name, base URL, market types, last configuration/update time, status, and diagnostic. |
| `market_candles` | Normalized OHLCV keyed by asset, market, timeframe, timestamp, and source; stores retrieval/close timestamps and verification status. |
| `screen_captures` | Reserved metadata for user-provided OTC screen captures; pixels are not normalized into candles. |
| `data_quality_logs` | Timestamped provider/asset/timeframe quality result and diagnostic list. |
| `indicators` | Reserved per-asset/timeframe indicator observations with source and verification status. The analysis endpoint currently returns calculations without persisting indicator rows. |
| `signals` | Reserved signal-history schema with a constrained UP/DOWN/WAIT decision. No validated signal-writing service is connected. |
| `signal_outcomes` | Reserved outcome schema linked to signals; source and `verified` flag are required. No verified outcome pipeline is connected. |
| `system_logs` | Timestamped component diagnostics and levels. |

Indexes cover asset listing, candle lookup, quality-log lookup, indicator lookup, and signal lookup.

## Persistence behavior

- Asset discovery uses UPSERT by asset identity.
- Candle inserts are idempotent for the source-qualified candle key; duplicates are ignored rather than overwriting existing rows.
- Quality and system diagnostics append records.
- `data_sources` is updated by provider ID.
- API initialization records configured Binance and explicitly unverified OTC source rows.
- No database table is used as a fallback to claim fresh data when a provider request fails.

The browser's existing `localStorage` signal history is separate and is not migrated by this schema.
