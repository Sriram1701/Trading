# Asset Coverage Matrix

**As of:** 2026-11-15. “Documented” means the provider's official materials describe the class/endpoint. It does not mean this project has tested or enabled that source.

## Provider and asset-class coverage

| Provider/source | Crypto Spot | Forex | Metals (Gold/Silver) | Indices | Equities / regular exchange instruments | 1-minute OHLC status |
|---|---|---|---|---|---|---|
| Binance Spot (existing adapter) | **IMPLEMENTED + runtime-tested** for dynamically discovered Spot symbols | Not supported | Not supported | Not supported | Not an equities provider | **Yes** for discovered Spot pairs; public kline `1m`; current bar excluded. Historical depth and commercial terms need separate review. |
| Twelve Data Basic personal tier | Documented class; Basic page advertises realtime crypto | Documented class; Basic page advertises realtime Forex | Commodity data shown on paid plans; Basic entitlement unknown/not listed | **UNKNOWN**; no specific index one-minute entitlement verified | Basic page advertises realtime US equities/ETFs | API schema supports `1min`; per-symbol, class, plan entitlement must be verified. No integration/test. |
| Twelve Data paid personal/business | Documented crypto market data | Documented Forex market data | Commodities market data advertised in paid tiers | **UNKNOWN** for a particular index / minute candles | Multiple global equities/ETFs, plan- and exchange-dependent | Generic API supports `1min`; availability for a selected instrument and plan is **not yet verified**. |
| Alpha Vantage | Crypto intraday endpoint | FX intraday endpoint | Gold/silver spot and daily/weekly/monthly history | Index daily/weekly/monthly endpoint | Global/equity endpoints | **1m documented but premium** for stock, FX, crypto intraday. No documented 1m gold/silver history or index data in reviewed endpoints. |
| Alpaca Basic | Free limited crypto data documented | Not verified/supported in reviewed docs | Not verified/supported | Not verified/supported | US stocks/ETFs, Basic real-time is IEX only | **1Min documented** for equity bars; Basic historical access is limited to recent data. Crypto 1m reference should be checked for selected plan/pair. |
| Quotex/QX Broker | Not integrated | Not integrated | Not integrated | Not integrated | Not integrated | **NOT SUPPORTED**; no verified authorized broker data API in this project. |
| Quotex OTC instruments | No verified source | No verified source | No verified source | No verified source | No verified source | **NOT SUPPORTED**; must remain WAIT. |

## How to read these statuses

- **IMPLEMENTED + runtime-tested:** adapter exists and has passed read-only checks recorded in the existing Phase 2 implementation report.
- **Documented:** official docs or provider plan page describes a product/endpoint. Project integration, account entitlement, symbol availability, and production reliability have not been independently verified.
- **UNKNOWN:** insufficient official evidence for that specific class, instrument, interval, plan, or license.
- **NOT SUPPORTED:** there is no configured and verified project source. It does not assert that no provider anywhere offers such data.

## Minute data by class

### Crypto

- Binance Spot is the only project-integrated minute source; it represents exchange Spot pricing, not any broker quote.
- Twelve Data documents a `1min` time-series interval and advertises a Basic real-time crypto feed. Exact instrument/plan entitlement and historical depth must be checked before approval.
- Alpha Vantage documents a premium crypto intraday endpoint with a 1-minute interval.
- Alpaca advertises free limited crypto data; the exact minute-bar plan entitlement/history for selected pairs requires checking its crypto-bars API reference and account permissions.

### Forex

- Twelve Data documents Forex catalogs/time series and a generic 1-minute interval; Basic advertises real-time Forex. Exact pair entitlement/history under the intended plan is not tested.
- Alpha Vantage documents `FX_INTRADAY` at 1-minute resolution as Premium, with realtime update description. This is not a verified free endpoint.
- No project Forex adapter exists. A spot-FX provider's feed is not Quotex price equivalence.

### Metals

- Alpha Vantage documents live Gold/Silver spot-price functions and historical intervals of daily, weekly, monthly only; these functions do not establish 1-minute OHLC.
- Twelve Data advertises commodities market data on paid plans, but exact XAU/XAG product form (spot/CFD/futures), candle interval, entitlement, and market session are **UNKNOWN** until checked for named instruments.
- No project metals adapter exists.

### Indices

- Alpha Vantage's documented index endpoint provides daily, weekly, and monthly history and is Premium. No one-minute interval was documented there.
- Twelve Data's reviewed docs do not establish which exact indices have minute candles or what plan grants access. Treat as **UNKNOWN**.
- No project index adapter exists. A CFD or ETF tracking an index is a distinct asset, not the cash index.

## Instrument-specific approval rule

Before exposing any instrument in the selector, the registry must have a provider catalog record and confirmed product identity. Do not infer support for `XAUUSD`, a market index, a Forex pair, an OTC symbol, or a Quotex asset from a similar text ticker. In particular:

- provider symbol equality is not instrument equality;
- a spot metal, futures contract, ETF, and CFD have different price formation;
- an equity index, index ETF, and index CFD are different instruments;
- centralized crypto Spot is not a broker OTC quote;
- a broker's “OTC” label may represent a broker-specific product rather than exchange-traded over-the-counter securities.

The current registry supports only the implemented Binance Spot assets, with Quotex mapping status `UNVERIFIED`.
