# Candle Data Quality Rules

`CandleQualityGate` is a fail-closed gate. A rejected batch yields WAIT and an empty candle list; it is not silently repaired or filled with fabricated prices.

## Validation rules

1. **Non-empty and known source:** the batch must contain candles from a configured provider.
2. **Asset and market identity:** every candle must match the discovered asset ID, its `REGULAR` market type, the provider, and a single timeframe.
3. **Provider/asset availability:** the provider must be recognized and the discovered asset must be `TRADING`.
4. **Completion and provenance:** every candle must be marked complete and provider-received or already quality-passed.
5. **Timestamp ordering:** timestamps must be unique and strictly increasing.
6. **No gaps:** consecutive timestamps must be exactly one configured interval apart. No session calendar or weekend-gap exemption is currently implemented.
7. **Alignment:** candle open timestamps must align to the timeframe boundary.
8. **Freshness:** candle timestamps and close timestamps cannot be in the future; the latest close cannot be older than two timeframe intervals.
9. **Interval bounds:** the candle close timestamp cannot precede its open timestamp or extend beyond one timeframe interval; retrieval timestamps cannot be in the future.
10. **OHLCV:** prices and volume must be finite; prices must be positive; volume must not be negative; high/low must contain open, close, and low/high respectively.
11. **Extreme discontinuity:** inter-candle close moves or open gaps above the configured 20% threshold are rejected.

Passing candles are copied with verification status `QUALITY_PASSED`; original source and retrieval timestamp remain attached.

## Interpretation limits

- The 20% discontinuity threshold is a defensive anomaly filter, not an investment or volatility rule.
- The two-interval freshness threshold is an engineering default, not a proof of real-time execution suitability.
- Exact contiguity can reject otherwise valid bars if an upstream provider omits data or the instrument is not continuously traded.
- Quality passing establishes only that the defined structural checks passed. It does not establish accurate broker mapping, future-price predictability, or suitability for a trade.
- No candle is synthesized, interpolated, or forward-filled.

Tests cover duplicate, missing, stale, future, incomplete, and malformed OHLC cases. See `tests/test_market_architecture.py`.
