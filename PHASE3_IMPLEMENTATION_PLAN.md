# Phase 3 Implementation Plan (Approval Required)

**Status:** Research and design only. No provider code, production files, dependencies, schemas, dashboard behavior, or live integration were changed in Phase 3. Do not begin these implementation steps until the owner approves a scoped plan and confirms licensing/usage choices.

## Current supported scope

- Binance Spot crypto is the only implemented provider.
- Binance 1-minute candles are runtime-tested in the existing implementation.
- No Forex, metals, indices, Quotex, or OTC price source is implemented.
- WAIT-only behavior remains in force.

## Decisions required before implementation

1. Is usage strictly personal/internal, or will data be displayed/shared commercially?
2. What is the user's jurisdiction and which provider terms/data entitlements apply there?
3. What recurring provider budget is acceptable? Twelve Data Basic has hard quotas; minute endpoint and symbol entitlements must be tested. Alpha Vantage minute intraday endpoints in scope are Premium. Alpaca Basic equities are IEX-only.
4. Which asset classes and exact named instruments should be tested first?
5. Are exchange-traded proxies acceptable when direct cash index/metal data is unavailable? If so, label proxy product types explicitly; never call them the underlying index/metal.
6. Does any future objective require matching Quotex? If yes, do not proceed on external data as a proxy; a permitted broker source and verification evidence are prerequisites. No credentials or undocumented integration should be requested.

## Proposed phases

### Phase 3A — Account/terms and exact-instrument entitlement review

**Candidate files:** `PROVIDER_RESEARCH_REPORT.md`, `ASSET_COVERAGE_MATRIX.md`, `PROVIDER_COMPARISON.md` only; no runtime source changes.

**Work:** Owner selects a provider/plan and instruments. Review official terms, geographic eligibility, personal/commercial use, API-key requirements, exchange fees, persistence/display/redistribution rights, and per-symbol 1m entitlement.

**Acceptance:** Written allowlist with provider, exact symbol, product type, venue, interval, plan, delay, limits, and allowed use. Every unresolved field remains disabled/UNKNOWN. No live trading access.

### Phase 3B — Additive registry and mapping schema proposal

**Candidate files if approved:** new migration/schema module; `qx_market/models.py`, `qx_market/database.py`, registry/service tests, schema docs.

**Work:** Add provider-independent instrument identity, provider-symbol aliases, data/license status, versioned session calendar reference, source verification evidence, mapping status/evidence, last successful retrieval, and entitlement metadata. Preserve existing `Asset` and candle identifiers via additive migration.

**Acceptance:** Migration runs twice safely; old rows remain byte-for-byte logically preserved; duplicate and conflicting aliases fail closed; no Quotex mapping is set verified by default.

### Phase 3C — Provider adapter spike, one provider at a time

**Recommended order:** Twelve Data only if owner approves its plan/terms; alternatively Alpaca for US IEX development; Alpha Vantage only with an approved premium entitlement. Do not implement OANDA/Massive until their official docs and terms are validated.

**Candidate files if approved:** one new `qx_market/providers/<provider>.py`, provider registration/config, requirements only if needed, fixture tests, data-source documentation.

**Work:** Read-only public/documented endpoints; dynamic instrument catalog; parse timestamps and complete/incomplete bars; preserve provider ID, product/venue, source timestamps, plan/feed, and retry diagnostics; no secrets in source or browser. API key, if required, is kept server-side in environment configuration.

**Acceptance:** Contract tests against captured fixtures; approved low-volume read-only request for only approved symbols; dynamic discovery matches official response; provider outage/rate limit returns WAIT; no synthetic fallback; no unapproved asset appears.

### Phase 3D — Market calendar and source-aware quality

**Candidate files if approved:** `qx_market/quality.py`, proposed calendar module, quality tests, source-specific docs.

**Work:** Define versioned calendars per actual instrument/venue. Check session opens/closes, holidays, early closes, daylight saving, halts/breaks, maintenance windows, timestamp alignment, candle completion and staleness. For market-open expected intervals, detect provider gaps; for closed intervals, do not demand bars. Unknown/stale calendars reject session-sensitive use.

**Acceptance:** Golden fixtures around session boundary, holiday, early close, DST transition, weekend, missing expected candle, and provider outage; no false gap fill and no cross-session synthetic candles.

### Phase 3E — Mapping verification and optional source comparison

**Candidate files if approved:** `INSTRUMENT_MAPPING_DESIGN.md`, mapping-evidence store, source-comparison tests/report.

**Work:** Test named source pairs concurrently and document product/venue/session/quote identity and divergences. Keep series separate. Assign `VERIFIED_MATCH` only after predeclared test evidence and legal review; else partial/unverified/unsupported.

**Acceptance:** Mapping status has evidence, reviewer/date, test window, and decision. No API ticker similarity alone can set verified. No provider failover or candle splicing.

### Phase 3F — Dashboard read-only source selection

**Candidate files if approved:** `qx_market/api.py`, `qx_market/service.py`, `screen_watcher/public/market_dashboard.js`, HTML/CSS and tests.

**Work:** Present source/feed, market class/type, product, timeframe, session status, delay, license/access status, last good retrieval, quality status, and mapping status. Distinguish exchange feed from Quotex. Keep API loopback-only unless an explicit secure deployment is designed.

**Acceptance:** Every disabled/unverified row is visible as unsupported; no source switch silently changes product identity; user-selected selection gets explicit source identity; OTC returns WAIT.

## Required tests

### Provider discovery and symbols

- Dynamic catalog response parsing, pagination, status/tradability, delisted/inactive instruments, invalid response, duplicate ID, conflicting symbol, and stable canonical IDs.
- Symbol normalization tests for delimiters, case, quote currencies, venue suffixes, provider IDs, index vs ETF vs CFD and metal spot vs future. Normalization must not imply cross-provider equivalence.
- Catalog entitlement/plan metadata missing or restricted produces disabled asset, not default access.

### Candle retrieval and timestamps

- 1-minute requests for each approved exact symbol and provider fixture.
- UTC epoch/string parsing, timezone-aware/exchange-local conversion, daylight-saving ambiguous/nonexistent timestamps, bar-open vs bar-close convention, precision preservation.
- Open current candle excluded; completed candle accepted only after source-defined close plus documented tolerance.
- OHLCV finite/positive/relationship validation; zero-volume behavior appropriate to provider contract.
- Correct pagination, historical-depth boundaries, duplicate/out-of-order bars, empty response and malformed error-shaped JSON.

### Rate limits and provider failures

- 429/418/403/5xx, network timeout, DNS/TLS error, malformed JSON, provider business-error payload, retry-after seconds/date parsing.
- Do not retry endlessly; bounded retry/backoff only where allowed; never convert errors into successful empty or cached “live” responses.
- Distinguish market closed/no trades from source outage only when documented evidence supports it.

### Missing/stale data, sessions and holidays

- Missing expected open-session bar causes explicit quality rejection.
- Weekend/holiday/early close/session break does not create false gap when a versioned official calendar proves market closed.
- A missing/stale/expired calendar returns WAIT.
- Data age threshold, system clock skew, provider timestamp drift, future candles, overlapping intervals, and outage recovery.
- DST transitions, exchange-local schedule conversion, early close, one-off closure, and daylight-saving changes.

### Instrument mapping

- Default `UNVERIFIED`; only evidence-backed decision updates.
- `VERIFIED_MATCH`, `PARTIAL_MATCH`, `UNVERIFIED`, `NOT_SUPPORTED` transition policy and audit record.
- Product and source mismatch (Spot vs CFD, index vs ETF, different FX contributor, exchange vs OTC security) never becomes verified via ticker similarity.
- Provider-symbol change creates effective-dated alias without losing historical identity.
- Quotex asset mapping remains unverified without official, permitted evidence.

### Cross-provider consistency

- Store separate original source series, compare only overlapping timestamps.
- Reject mismatched quote currency, product, venue, session, interval boundary, adjustments, or volume definition.
- Predeclare tolerances and evaluate price differences, missing-bar rates, and source latency by session/volatility.
- No source switching, candle splicing, or silent fallback after provider outage.

### Architecture/regression

- Existing Phase 1 safety and Phase 2 tests remain green.
- API remains GET-only and bound to loopback; no order routes, clicker calls, broker credentials, or trading actions.
- OTC and all mapping states other than `VERIFIED_MATCH` remain WAIT for any broker-equivalence workflow.
- SQLite migration retains existing assets/candles/logs and browser localStorage history; migration is additive and repeatable.
- Data-provider license status and timestamps are surfaced to the UI without exposing secrets.

## Phase 3 exit criteria

Phase 3 must not be called complete when documents or an adapter exist alone. Completion requires:

1. At least one newly approved provider integrated and its scope tested—or an explicit decision to retain Binance-only coverage.
2. Exact supported symbols/asset classes/timeframes established from actual catalogs and entitlement.
3. Session-aware quality tests pass for supported venues.
4. License/region/use restrictions documented and approved for the intended deployment.
5. Existing tests and new provider-specific tests pass.
6. The dashboard identifies source/feed and never implies Quotex equivalence.
7. OTC remains WAIT unless a legitimate, verified match has been established.
8. No directional decision is enabled; no accuracy claim is made.

## Stop condition

This document is the end of Phase 3 work for now. Await owner approval of the provider, use case, budget, jurisdiction, and first instrument allowlist before modifying production code.
