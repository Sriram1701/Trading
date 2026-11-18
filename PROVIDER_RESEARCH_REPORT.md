# Phase 3 Provider Research Report

**Research date:** 2026-11-15  
**Scope:** Official provider documentation, public plan/pricing pages, existing Phase 2 reports, and the project's already-tested Binance public Spot integration. No new provider account or API key was created, no candidate API was called, and no production code was changed.

## Executive summary

There is no verified, no-cost source in this research that supplies all requested asset classes as minute OHLC and also provides verified Quotex price equivalence.

- **Currently implemented and runtime-tested:** Binance Spot public REST for crypto Spot only. It is not Quotex data.
- **Broadest documented personal-tier candidate:** Twelve Data. Its docs describe one-minute time series, and its Basic tier advertises real-time US equities/ETFs, forex, and crypto at 8 API credits/minute and 800/day. A key/account is required. The Basic tier is described as for testing/side projects; its terms prohibit commercial use of free-tier data. The pricing matrix does not establish that the Basic plan supplies one-minute candles or every symbol/venue in every advertised class. Commodity coverage appears in higher personal tiers; index coverage and specific 1-minute entitlement need confirmation.
- **Additional documented candidate:** Alpha Vantage. Its docs list 1-minute FX/equity/crypto intraday endpoints as premium. The standard free allowance is 25 requests/day, but a free key does not make premium endpoints free. Gold/silver spot is a spot-price endpoint and gold/silver history is daily/weekly/monthly; its documented index endpoint is daily/weekly/monthly, not one-minute.
- **Narrow documented candidate:** Alpaca. Basic has free US equities/ETF data from IEX (one venue) and access to crypto data, with API keys. Equities historical queries are limited to recent data under Basic and have a published request limit. This does not cover Forex, metals, or indices. Do not confuse Alpaca's separately described US OTC securities with Quotex OTC.

All research of provider materials reflects the providers' own descriptions. This report does not independently certify the licensing of every underlying exchange feed, measured latency, uptime, or regional eligibility. Where these were not stated in the reviewed official materials, they are **UNKNOWN**.

## Evidence categories

- **Verified documentation fact:** stated on a linked official provider documentation, pricing, or terms page reviewed on the research date.
- **Existing project verification:** existing Phase 2 implementation report and prior read-only endpoint tests; not a new integration test in this phase.
- **Provider claim:** a performance, coverage, or reliability assertion made by the provider; not independently measured here.
- **UNKNOWN:** not established by the reviewed official source. It must not be inferred from a marketing overview or a symbol example.

## Provider findings

### Binance Spot

**Official references**

- [Spot REST API market-data endpoints](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints)
- [Spot REST API limits](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/limits)
- [Exchange information endpoint](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints#exchange-information)
- [Kline/candlestick endpoint](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints#klinecandlestick-data)

**Documented / existing evidence**

- The existing adapter discovers Spot symbols with trading status and Spot permissions, and requests public klines using GET.
- The kline contract accepts intervals including `1m`; the existing adapter excludes the current unfinished bar.
- No API key is required for the public market-data calls used by this project.
- Existing project records a successful read-only check of exchange information and 1-minute klines, and a later Phase 2 smoke test returned quality-passed BTC/USDT candles. This verifies adapter reachability at those points in time, not ongoing availability.
- The official documentation URLs are listed above, but their contents could not be retrieved by the research browser in this pass. Therefore exact request weights/limits are **not independently re-verified in Phase 3**; do not hard-code a numeric rate. The existing project adapter handles HTTP 418/429 and parseable `Retry-After` values, as described in the existing Phase 2 report.

**Scope and limits**

- Supported here: exchange-listed crypto Spot symbols actually discovered from the API.
- Not supported here: Forex, metals, cash indices, Quotex, or broker OTC.
- Historical depth, current jurisdiction eligibility, and commercial/display/redistribution rights for the project's contemplated usage: **UNKNOWN from the pages reviewed**; review the applicable Binance terms and market-data rules before expanding use or redistribution.
- Provider uptime/latency: **UNKNOWN and not independently measured**.

### Twelve Data

**Official references**

- [Time-series API](https://twelvedata.com/docs/market-data/time-series)
- [Asset catalogs](https://twelvedata.com/docs/asset-catalogs)
- [Forex pair catalog](https://twelvedata.com/docs/asset-catalogs/forex-pairs-list)
- [Commodities catalog](https://twelvedata.com/docs/asset-catalogs/commodities-list)
- [Market/exchange schedules](https://twelvedata.com/docs/markets/exchange-schedule)
- [Personal pricing](https://twelvedata.com/pricing)
- [Business pricing](https://twelvedata.com/pricing-business)
- [Terms of Use](https://twelvedata.com/terms)
- [Credit/rate-limit explanation](https://support.twelvedata.com/en/articles/5615854-credits)

**Documented facts and provider statements**

- The time-series API documents a `1min` interval and describes historical time series for instruments. Examples include an equity symbol, a Forex pair, and a crypto pair; individual symbols and plan entitlements still must be queried/confirmed.
- The current Basic personal page advertises 8 API credits/minute, 800/day, and 8 trial WebSocket credits. Standard time-series use is weighted per symbol; a multi-symbol call consumes credits per symbol. There is no basis to treat the daily limit as unlimited.
- The Basic page advertises real-time US equities/ETFs, Forex, and crypto. The page labels Basic as for testing and side projects. The personal pricing table lists commodities data under paid tiers (Grow and above), not as a verified Basic entitlement.
- The market-data docs describe broad catalogs and exchange-schedule/market-state facilities. The exact plan entitlement for a particular symbol, market, calendar, and interval must be resolved from provider metadata/account access.
- The docs require API-key authentication for API use. Geographic eligibility for this project's user is **UNKNOWN**.
- Terms reserve use for the relevant subscription rights, prohibit commercial use of Free Tier data, restrict redistribution/external display absent explicit rights, and require compliance with third-party/exchange terms. Do not publish this data from the dashboard or distribute it without reviewing the license.
- The pricing page describes the feeds and tiers; these are provider claims, not an independent entitlement check or latency test.

**Minute resolution / historical status**

- The API schema supports `1min`; it documents time series with historical range parameters. Historical depth for each specific symbol and Basic-tier access are **UNKNOWN** until checked against the selected account and instrument.
- Real-time is claimed for selected Basic markets (US equities/ETFs, Forex, crypto); it is not proof that all symbols, 1-minute history, or every geography is available on Basic.
- Commodities: a catalog is documented and a paid plan advertises commodities market data. Whether a named spot metal has 1-minute OHLC, at which plan, and with what data delay: **UNKNOWN**.
- Indices: an index asset class/catalog and one-minute entitlement were not established in the reviewed docs: **UNKNOWN**.

### Alpha Vantage

**Official references**

- [API documentation](https://www.alphavantage.co/documentation/)
- [Premium plans](https://www.alphavantage.co/premium/)
- [Free-key and usage FAQ](https://www.alphavantage.co/support/#api-key)
- [US real-time/delayed market-data policy](https://www.alphavantage.co/realtime_data_policy/)
- [Terms of Service](https://www.alphavantage.co/terms_of_service/)

**Documented facts**

- The API requires an API key.
- The support page states a standard allowance of 25 API requests/day for most free stock API datasets; it also mentions unlimited requests for verified open-source or educational projects. That statement does not waive an endpoint-specific premium label or data licensing restrictions.
- The stock `TIME_SERIES_INTRADAY` docs specify 1-, 5-, 15-, 30-, and 60-minute intervals and describe long historical depth. The endpoint is labelled Premium. US real-time/15-minute delayed data has separate exchange entitlement and personal/commercial use conditions.
- `FX_INTRADAY` is labelled Premium, returns timestamp/OHLC for a currency pair, documents `1min` through `60min`, and describes updates as realtime. Full historical depth and exact free-key entitlements are not established for that endpoint.
- `CRYPTO_INTRADAY` is labelled Premium, documents 1-minute OHLCV, and describes realtime updates. Exact supported pair inventory and historical depth for the intended account are **UNKNOWN**.
- `GOLD_SILVER_SPOT` documents current spot prices for Gold/XAU and Silver/XAG; it is not an intraday OHLC candle endpoint. `GOLD_SILVER_HISTORY` documents daily, weekly, and monthly intervals, not one-minute.
- `INDEX_DATA` documentation covers named equity indices and documents daily, weekly, and monthly intervals. It is labelled Premium; no 1-minute index candles are documented on that endpoint.
- Premium pricing displays paid plans beginning at 75 requests/minute, with a displayed monthly price starting at US$49.99. The specific plan required for each premium endpoint and separately licensed US exchange entitlement must be confirmed.
- The provider's policy page says realtime/delayed US data is exchange-regulated, personal non-commercial use requires the stated subscription, and business/commercial use requires contacting sales. Terms for other data classes and geographic eligibility: **UNKNOWN** pending direct review.

**Assessment**

Potential supplementary provider after explicit paid-entitlement/licensing review: 1-minute FX and crypto, plus US equity minute bars. It does not provide 1-minute gold/silver or index bars in the documented endpoints reviewed. It is not a free-tier solution for these premium intraday endpoints.

### Alpaca Market Data

**Official references**

- [Market Data API and subscription plans](https://docs.alpaca.markets/us/docs/about-market-data-api)
- [Historical stock data](https://docs.alpaca.markets/us/docs/historical-stock-data-1)
- [Historical stock bars reference](https://docs.alpaca.markets/reference/stockbars)
- [Market Data FAQ, including IEX/SIP and OTC](https://docs.alpaca.markets/us/docs/market-data-faq)
- [Crypto pricing data](https://docs.alpaca.markets/us/docs/crypto-pricing-data)
- [Historical crypto bars reference](https://docs.alpaca.markets/reference/v1beta2cryptobars)

**Documented facts**

- The Basic Trading API plan is free and lists US stocks/ETFs. Basic equity real-time coverage is IEX, not consolidated all-exchange SIP. The provider describes IEX as a single exchange and says its share is approximately 2.5% of market volume; that figure is the provider's statement, not an independent measurement.
- Basic equities documentation lists history since 2016, a “latest 15 minutes” historical-data limitation, 200 historical API calls/minute, and 30 WebSocket symbols. The market-data FAQ explains that Basic users cannot query recent SIP data and that the query end must be at least 15 minutes old without the paid entitlement. Read the plan's phrase as a feed/freshness restriction, not a claim that the archive contains only 15 minutes of history. The bars API supports `1Min` timeframe. An API key/secret pair is required for regular market-data endpoints.
- A paid plan is shown at US$99/month for wider US stock exchange coverage and higher limits in the reviewed page; pricing and feeds should be rechecked at implementation time.
- Alpaca describes free limited crypto data and a paid unlimited plan; the docs show crypto pairs and streaming. The general docs exempt historical crypto from authentication, but exact rate limit, archive depth, plan-specific symbol coverage, and 1-minute historical availability for the chosen pair should be reverified against the specific crypto-bars reference/account. Do not infer this from equity-plan limits.
- No Forex, metals, or index cash-market service was verified in the reviewed pages.
- Alpaca's FAQ says its separately defined US OTC securities data requires a special subscription currently available only to broker partners. This is unrelated to Quotex OTC/synthetic instruments; no equivalence follows.
- Commercial/redistribution rights and geographic eligibility for the proposed dashboard: **UNKNOWN from the reviewed pages**; review account agreements and exchange policy.

**Assessment**

Possible supplementary provider for explicitly identified US equity/IEX bars and crypto, but the free equity feed is a partial venue sample and not an interchangeable consolidated quote. It does not fill the project's Forex/metals/index gaps.

## Sources considered but not advanced

- **OANDA v20:** A potentially relevant broker/API source was not advanced because the official developer endpoint returned 404 during this research and the web retrieval service could not validate the current docs. Instrument coverage, free access, minute-candle limits, rate limits, license, and geography are therefore **UNKNOWN** here. Do not implement from memory or secondary-source snippets.
- **Massive/Polygon:** Official documentation domains could not be retrieved by the research browser; a shell request reached the documentation application shell but did not expose endpoint content. Asset coverage, 1-minute limits, free plan, pricing, license, and geography remain **UNKNOWN** and the provider is not recommended until the canonical official docs and terms are reviewed.

These are not treated as verified providers or as project coverage.

## Important distinction: “free API” versus “free usable data”

A no-cost key, developer account, or endpoint response does not itself grant commercial display, redistribution, persistent storage, non-display processing, or exchange redistribution rights. A tier may also constrain latency, symbols, history, API credits, or the user's region. The app should store explicit license/access status separately from provider technical connectivity and fail closed if the needed entitlement is unknown.

## Verification still required before adapter approval

For each exact symbol and plan, verify using an approved account or documented test access:

1. Instrument catalog entry, provider symbol, exchange/venue, base/quote currency, asset type, and tradability.
2. One-minute OHLC availability and the entitlement/plan required for that symbol.
3. Whether timestamps are UTC, exchange-local, bar-open or bar-close, and whether the current bar is complete.
4. Historical lookback and daily/minute quota, rate-limit headers, and 429/retry behavior.
5. Trading-session and holiday calendar source, including early closes, halts, daylight-saving changes, and maintenance windows.
6. Terms for personal use, commercial use, storage, display, redistribution, and derived data.
7. Geographical eligibility and licensing requirements.
8. A measured comparison window against an independent permitted source before cross-provider use.

No phase-3 provider has been integrated, and no new provider endpoint was called or tested.
