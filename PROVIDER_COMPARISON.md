# Provider Comparison

**Reviewed:** 2026-11-15. Provider statements below are not independent uptime, accuracy, licensing, or price-equivalence tests. See [Provider Research Report](PROVIDER_RESEARCH_REPORT.md) for source links and confidence labels.

## Decision table

| Provider | Documented class breadth | Minute candle availability | Free access | Auth | Key limits / delays | Use/license and region | Current project recommendation |
|---|---|---|---|---|---|---|---|
| **Binance Spot** | Crypto Spot | Yes, public `1m` klines; current bar must be treated incomplete | Public market data is accessible without API key | No key for current public GET integration | Exchange-published weights/limits vary by endpoint; honor current docs and 418/429. Historical depth not established in this report. | Commercial/display/redistribution terms and geographic eligibility: **UNKNOWN**, recheck official terms. | Keep current adapter for clearly labeled crypto Spot. No broker mapping. |
| **Twelve Data** | Broadest documented single candidate: equities/ETFs, Forex, crypto; commodities on paid plans; exact indices **UNKNOWN** | Generic time-series schema documents `1min`; specific per-symbol/plan entitlement **UNKNOWN** | Basic personal tier: 8 API credits/min, 800/day; 8 trial WS credits | API key/account | Credits are weighted by endpoint and symbol. Basic daily/minute limits; tier and symbol entitlement vary. Basic advertises selected real-time markets. | Terms explicitly say Free Tier data cannot be used commercially and restrict redistribution/external display. Geographic eligibility **UNKNOWN**. | Best candidate to evaluate first for personal research if symbol-specific access and use rights pass. Not a complete or verified all-class provider. |
| **Alpha Vantage** | Equities, Forex, crypto; gold/silver spot/history; selected indices | Stocks/FX/crypto intraday have 1m endpoints labeled Premium. Gold/silver history daily/weekly/monthly; index endpoint daily/weekly/monthly. | Standard free allowance 25 API requests/day for most free datasets; verified OSS/education may qualify for expanded requests but premium endpoints remain premium. | API key required | Premium plan page advertises paid RPM tiers beginning at 75 RPM; endpoint-specific tier required. | US realtime/delayed data has exchange-license restrictions: personal non-commercial requires subscription; business/commercial contact sales. Other classes and geography **UNKNOWN**. | Consider only if paid endpoint and licensing terms fit. Not a free minute source for FX/US equities/crypto. |
| **Alpaca** | US equities/ETFs and crypto; no verified FX/metals/index | Equity bars support `1Min`; Basic has a 15-minute freshness/feed restriction. Crypto minute-bar entitlement must be checked for the exact pair/account. | Basic $0; equity real-time IEX only. Free limited crypto access advertised. | Key/secret generally required; official docs except historical crypto. | Basic equities: 200 historical calls/min; 30 stream symbols; recent SIP data requires a paid entitlement. Do not transfer those exact limits to crypto. | Commercial/redistribution terms and user geographic eligibility **UNKNOWN** from reviewed pages. | Narrow option for US equities/IEX or crypto after testing. IEX-only prices/volume differ from consolidated US market. |
| **OANDA v20 (screened)** | **UNKNOWN in this review** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | Do not implement until current official docs resolve and terms are reviewed. |
| **Massive/Polygon (screened)** | **UNKNOWN in this review** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | Do not implement until current official docs resolve and terms are reviewed. |

## Relative strengths and risks

### Binance Spot

- **Strength:** already working in the repository; public REST and Spot kline semantics are narrow and concrete.
- **Risk:** one exchange's crypto Spot feed cannot stand in for global FX, precious metals, index values, or broker prices. Trading restrictions may vary by jurisdiction; review official terms. A no-key endpoint does not imply unrestricted redistribution rights.

### Twelve Data

- **Strength:** broad catalogs and one documented time-series interface with a `1min` interval; plan page advertises free Basic access for selected real-time US equity/ETF, Forex, and crypto data.
- **Risk:** 8 credits/min and 800/day constrain multi-timeframe/multi-asset polling. A call may cost per symbol. Personal Basic terms disallow commercial use; commodities are shown on paid tiers. Do not expose data externally or redistribute under an assumed free license. Exact instrument/plan/interval entitlement must be checked from API metadata and account.

### Alpha Vantage

- **Strength:** precise docs by endpoint make asset-class/interval boundaries visible; supports multiple minute endpoints for a paid entitlement.
- **Risk:** 25 calls/day free allowance is not adequate for multi-timeframe monitoring, and the 1-minute endpoints identified here are Premium. Metal/index APIs documented here do not provide 1-minute bars. Realtime US market data has a separate regulated license requirement.

### Alpaca

- **Strength:** free Basic access can support limited US equities and crypto development; precise free-equity-feed restrictions and history behavior are documented.
- **Risk:** IEX-only data is a venue subset, not the SIP consolidated tape. The 15-minute history limit means data near current time is constrained. API credentials are required for most requests. It does not fill Forex/metals/index requirements.

## Suggested provider layering (not yet implemented)

1. Retain Binance Spot for its explicit crypto-Spot namespace.
2. Evaluate Twelve Data as a single optional adapter for specific FX and equity symbols, and only the Basic-eligible instruments confirmed through its instrument catalog/account.
3. Do not enable Twelve Data commodity/index assets until the exact instrument type, interval, subscription, licensing, and calendar are verified.
4. Evaluate Alpha Vantage only when a paid plan and separate exchange/data license are approved; use it as its own source series, not as a replacement for a different provider's candles.
5. Evaluate Alpaca only for explicit US equity IEX or crypto series; show feed identity prominently.
6. Keep OTC and Quotex mapping unavailable. No provider comparison establishes a Quotex match.

## Why not merge providers to fill apparent gaps?

Different providers can represent different exchanges, price contributors, bid/ask/last/trade aggregation, sessions, adjustments, bar boundaries, and missing-bar policies. Do not append one provider's bars after another provider's outage. For comparison, store parallel source series, align on UTC interval and session, quantify price/volume differences, and mark the comparison `PARTIAL_MATCH` or `UNVERIFIED` until a documented acceptance test passes.

## Research decision

Proceed to an approval-gated test spike, not production integration. Ask the owner to confirm intended personal/commercial usage, budget, user jurisdiction, and whether exchange-traded proxies are acceptable. Until then, the current verified asset coverage is Binance Spot crypto only and all broker/OTC mapping remains unverified.
