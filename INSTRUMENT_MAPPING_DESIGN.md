# Instrument Mapping Design

## Purpose and non-equivalence rule

The registry must identify what a provider actually serves, not what a similarly named broker button appears to represent. A provider ticker, underlying asset, or matching currency text is insufficient to identify a Quotex contract.

**No current provider is mapped to a Quotex/QX instrument.** Existing Binance Spot records have `mapping_status=UNVERIFIED` relative to Quotex. That status must not authorize use of the provider price as a broker price.

## Proposed provider-independent instrument record

This design is additive and is not implemented in the current SQLite schema. Preserve current `Asset` and candle behavior during a later migration.

| Field | Type / meaning |
|---|---|
| `asset_id` | Immutable internal ID, provider-independent; generated from a canonical instrument identity, not from ticker text alone. |
| `display_name` | Human-facing, non-authoritative label. |
| `asset_class` | `CRYPTO`, `FOREX`, `METAL`, `INDEX`, `EQUITY`, `ETF`, `FUTURE`, `CFD`, or another explicitly approved value. Keep distinct product types distinct. |
| `provider_id` | Stable provider namespace such as `binance_spot` or an approved future adapter. |
| `provider_symbol` | Exact source symbol/canonical ID sent to that provider. |
| `provider_instrument_id` | Provider's immutable ID where available; otherwise NULL. |
| `market_type` | Preserve existing `REGULAR`/`OTC` distinction. New values require an explicit migration; do not infer OTC from provider or class. |
| `venue_id` | Exchange, venue, index administrator, quote contributor, or source market where documented. |
| `product_type` | Spot, cash index, exchange-traded future, ETF, CFD, or another explicit contract type. |
| `base_currency` | ISO currency or underlying where applicable. |
| `quote_currency` | ISO 4217 currency where applicable; not a free-form display suffix. |
| `timezone` | IANA timezone for source-session display; store all candle instants in UTC. |
| `calendar_id` | Versioned exchange/market calendar identifier and provenance. Nullable only when continuous-market semantics are documented. |
| `session_definition` | Reference to explicit regular/extended session schedule; avoid embedding unversioned prose. |
| `supported_timeframes` | Intervals actually confirmed for this provider symbol and entitlement, not merely adapter capabilities. |
| `data_status` | `NOT_TESTED`, `AVAILABLE`, `DELAYED`, `STALE`, `UNAVAILABLE`, `RESTRICTED`, or `DISABLED`. |
| `last_successful_retrieval_at` | UTC timestamp of most recent successful provider response for this instrument. |
| `source_verification_status` | `DOCS_REVIEWED`, `ENDPOINT_TESTED`, `QUALITY_TESTED`, `LICENSE_REVIEWED`, or `UNVERIFIED`, with evidence timestamp/source. |
| `mapping_status` | `VERIFIED_MATCH`, `PARTIAL_MATCH`, `UNVERIFIED`, or `NOT_SUPPORTED`. |
| `mapping_target_id` | Optional external instrument identity, such as a broker contract identity, only if supplied and independently verified. |
| `mapping_evidence` | Versioned evidence record, not a string assertion: sources, tests, observed dates, match dimensions, reviewer, and unresolved differences. |
| `license_status` | `APPROVED_FOR_PERSONAL_INTERNAL`, `APPROVED_FOR_COMMERCIAL_DISPLAY`, `RESTRICTED`, `UNKNOWN`, etc.; never infer from an API key. |
| `recorded_at` / `updated_at` | UTC audit timestamps. Changes to identity or mapping evidence are append-only/auditable. |

### Canonical identity

The internal ID should derive from stable, normalized components such as:

`provider-independent root + asset_class + product_type + venue/source + base/quote or underlying + contract attributes`

Provider alias records are separately keyed by `(provider_id, provider_instrument_id/provider_symbol, effective_from, effective_to)`. A ticker change creates an alias/effective-date change; it should not silently overwrite an unrelated instrument. Never merge separate providers solely because normalized ticker strings match.

## Mapping status definitions

### `VERIFIED_MATCH`

Use only after documented contract/source identity and an approved comparison establish all required match dimensions for the intended use:

- same underlying and contract/product (spot vs CFD vs futures vs ETF);
- same venue, quote source, or explicit documented broker feed relationship;
- same quote currency, units, price precision, and market/session definition;
- consistent interval boundaries, timestamp conventions, and completed-bar semantics;
- synchronized independent price observations across representative open, close, high-volatility, and session-boundary cases;
- known corrections, spreads, corporate actions, and roll behavior accounted for;
- legal data-use rights approved for the exact deployment.

It still does not imply future predictiveness.

### `PARTIAL_MATCH`

Underlying appears related but one or more dimensions differ or remain unresolved (for example, provider spot FX versus broker CFD, or IEX equity feed versus all-exchange tape). This state is descriptive only and is **not sufficient for a trading analysis comparison or signal**.

### `UNVERIFIED`

Mapping evidence is absent, only a similar symbol/name exists, or documentation/API source is incomplete. This is the initial state for all new instruments.

### `NOT_SUPPORTED`

No authorized provider or acceptable matching product exists, or use is prohibited. Requests return WAIT with a specific unsupported/unverified diagnostic.

## Series isolation and cross-provider rules

Every candle series identity includes provider, provider symbol, product type, venue, market type, timeframe, and adjustment mode. A provider outage must never cause another provider's bars to be appended to the first series.

Cross-provider comparison is a separate test dataset, never a transparent failover. If approved, it must:

1. preserve both original source streams and their raw identifiers;
2. convert timestamps to UTC without rounding away original precision;
3. align bars by declared open/close semantics and market calendar;
4. compare open/high/low/close, quote currency, volume meaning, missing-bar rate, and latency;
5. set tolerances before testing, stratified by instrument/session/volatility;
6. report all mismatches and exclusions; never patch one provider's bar with another provider's values;
7. remain `PARTIAL_MATCH` or `UNVERIFIED` if equivalence is not proven.

## Calendar/session model

Each instrument references a versioned calendar defining timezone, regular sessions, holidays, early closes, breaks, and exceptional closures. The provider's local time zone is metadata; stored timestamps remain UTC. For continuous crypto or FX-like series, continuous operation must be documented for that particular source/product rather than assumed from asset class.

When a session calendar is missing or stale, the quality layer cannot distinguish a valid closed-market gap from a provider outage. It should report `SESSION_CALENDAR_UNKNOWN` and return WAIT for session-dependent use, not synthesize candles or assume the market was open.

## Legacy mapping status

| Existing source | Current mapping to Quotex |
|---|---|
| Binance Spot assets | `UNVERIFIED`; exchange Spot and Quotex instrument identity/price equivalence not established. |
| Screen/camera pixels | `NOT_SUPPORTED` as numeric OHLC or a verified price source. |
| Forex/metals/indices providers not implemented | `NOT_SUPPORTED` in the running application until an adapter and exact source instrument are verified. |
| Quotex OTC | `NOT_SUPPORTED` / WAIT; no permitted, verified source identified. |

## Future migration and validation

Do not modify schema before explicit approval. A later migration should add normalized provider, instrument, alias, calendar, entitlement/license evidence, and mapping-evidence tables, then link candles to immutable instrument/source IDs. Migration tests must prove existing assets, candles, logs, signal history, and user data remain unchanged.
