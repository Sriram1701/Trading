from __future__ import annotations

from datetime import datetime, timezone
from statistics import mean, pstdev
from typing import Any


def _ema_series(values: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    if len(values) < period:
        return result
    value = mean(values[:period])
    result[period - 1] = value
    multiplier = 2 / (period + 1)
    for index in range(period, len(values)):
        value = values[index] * multiplier + value * (1 - multiplier)
        result[index] = value
    return result


def _rsi(closes: list[float], period: int = 14) -> float | None:
    if len(closes) <= period:
        return None
    changes = [closes[index] - closes[index - 1] for index in range(1, len(closes))]
    gains = [max(change, 0.0) for change in changes]
    losses = [max(-change, 0.0) for change in changes]
    average_gain = mean(gains[:period])
    average_loss = mean(losses[:period])
    for index in range(period, len(changes)):
        average_gain = ((period - 1) * average_gain + gains[index]) / period
        average_loss = ((period - 1) * average_loss + losses[index]) / period
    if average_loss == 0:
        return 100.0 if average_gain > 0 else 50.0
    return 100 - 100 / (1 + average_gain / average_loss)


def _atr(bars: list[dict[str, Any]], period: int = 14) -> float | None:
    if len(bars) < period:
        return None
    true_ranges = []
    for index, bar in enumerate(bars):
        high, low = float(bar["high"]), float(bar["low"])
        previous_close = float(bars[index - 1]["close"]) if index else float(bar["close"])
        true_ranges.append(max(high - low, abs(high - previous_close), abs(low - previous_close)))
    value = mean(true_ranges[:period])
    for current in true_ranges[period:]:
        value = ((period - 1) * value + current) / period
    return value


def _adx(bars: list[dict[str, Any]], period: int = 14) -> float | None:
    if len(bars) < 2 * period:
        return None
    true_ranges = []
    positive_dm = []
    negative_dm = []
    for index in range(1, len(bars)):
        current, previous = bars[index], bars[index - 1]
        up_move = float(current["high"]) - float(previous["high"])
        down_move = float(previous["low"]) - float(current["low"])
        true_ranges.append(max(
            float(current["high"]) - float(current["low"]),
            abs(float(current["high"]) - float(previous["close"])),
            abs(float(current["low"]) - float(previous["close"])),
        ))
        positive_dm.append(up_move if up_move > down_move and up_move > 0 else 0.0)
        negative_dm.append(down_move if down_move > up_move and down_move > 0 else 0.0)
    smoothed_tr = sum(true_ranges[:period])
    smoothed_positive = sum(positive_dm[:period])
    smoothed_negative = sum(negative_dm[:period])
    dx_values = []
    for index in range(period - 1, len(true_ranges)):
        if index >= period:
            smoothed_tr = smoothed_tr - smoothed_tr / period + true_ranges[index]
            smoothed_positive = smoothed_positive - smoothed_positive / period + positive_dm[index]
            smoothed_negative = smoothed_negative - smoothed_negative / period + negative_dm[index]
        if smoothed_tr == 0:
            dx_values.append(0.0)
            continue
        positive_di = 100 * smoothed_positive / smoothed_tr
        negative_di = 100 * smoothed_negative / smoothed_tr
        denominator = positive_di + negative_di
        dx_values.append(0.0 if denominator == 0 else 100 * abs(positive_di - negative_di) / denominator)
    if len(dx_values) < period:
        return None
    adx = mean(dx_values[:period])
    for current in dx_values[period:]:
        adx = ((period - 1) * adx + current) / period
    return adx


def _macd(closes: list[float]) -> dict[str, float | None]:
    fast = _ema_series(closes, 12)
    slow = _ema_series(closes, 26)
    macd_values = [
        fast[index] - slow[index]
        for index in range(len(closes))
        if fast[index] is not None and slow[index] is not None
    ]
    if len(macd_values) < 9:
        return {"line": None, "signal": None, "histogram": None}
    signal_series = _ema_series(macd_values, 9)
    line = macd_values[-1]
    signal = signal_series[-1]
    if signal is None:
        return {"line": None, "signal": None, "histogram": None}
    return {"line": line, "signal": signal, "histogram": line - signal}


def _patterns(bars: list[dict[str, Any]]) -> list[str]:
    if not bars:
        return []
    current = bars[-1]
    open_price, high, low, close = (
        float(current[key]) for key in ("open", "high", "low", "close")
    )
    candle_range = high - low
    if candle_range <= 0:
        return []
    body = abs(close - open_price)
    upper_wick = high - max(open_price, close)
    lower_wick = min(open_price, close) - low
    names = []
    if body / candle_range <= 0.1:
        names.append("DOJI")
    if body / candle_range >= 0.7:
        names.append("STRONG_MOMENTUM_CANDLE")
    if body > 0 and lower_wick >= body * 2 and upper_wick <= body * 0.6:
        names.append("HAMMER_OR_BULLISH_PIN_BAR")
    if body > 0 and upper_wick >= body * 2 and lower_wick <= body * 0.6:
        names.append("SHOOTING_STAR_OR_BEARISH_PIN_BAR")
    if len(bars) >= 2:
        previous = bars[-2]
        previous_open, previous_close = float(previous["open"]), float(previous["close"])
        previous_bearish = previous_close < previous_open
        previous_bullish = previous_close > previous_open
        if previous_bearish and close > open_price and open_price <= previous_close and close >= previous_open:
            names.append("BULLISH_ENGULFING")
        if previous_bullish and close < open_price and open_price >= previous_close and close <= previous_open:
            names.append("BEARISH_ENGULFING")
    if len(bars) >= 3:
        first, middle = bars[-3], bars[-2]
        first_open, first_close = float(first["open"]), float(first["close"])
        middle_open, middle_close = float(middle["open"]), float(middle["close"])
        midpoint = (first_open + first_close) / 2
        middle_body = abs(middle_close - middle_open)
        first_body = abs(first_close - first_open)
        if first_close < first_open and middle_body < first_body * 0.5 and close > open_price and close > midpoint:
            names.append("MORNING_STAR_CANDIDATE")
        if first_close > first_open and middle_body < first_body * 0.5 and close < open_price and close < midpoint:
            names.append("EVENING_STAR_CANDIDATE")
    return names


def analyze_candles(
    candles: list[dict[str, Any]] | tuple[dict[str, Any], ...],
    *,
    market_type: str,
    data_quality_status: str,
    decision_code: str,
) -> dict[str, Any]:
    """Return descriptive indicators; directional decisions remain disabled."""
    diagnostics = []
    if market_type != "REGULAR":
        return {
            "decision": "WAIT",
            "decision_code": "OTC_DATA_UNVERIFIED",
            "market_condition": "UNVERIFIED",
            "indicators": {},
            "candlestick_patterns": [],
            "diagnostics": ["No verified OTC OHLC feed is configured."],
        }
    if data_quality_status != "QUALITY_PASSED":
        return {
            "decision": "WAIT",
            "decision_code": decision_code,
            "market_condition": "UNAVAILABLE",
            "indicators": {},
            "candlestick_patterns": [],
            "diagnostics": ["Indicators were not calculated because data did not pass quality checks."],
        }
    bars = list(candles)
    if not bars:
        return {
            "decision": "WAIT",
            "decision_code": "NO_COMPLETED_CANDLES",
            "market_condition": "UNAVAILABLE",
            "indicators": {},
            "candlestick_patterns": [],
            "diagnostics": ["No completed candles were available for analysis."],
        }
    closes = [float(bar["close"]) for bar in bars]
    indicators: dict[str, Any] = {}
    for period in (9, 20, 50):
        series = _ema_series(closes, period)
        indicators[f"ema_{period}"] = series[-1]
    indicators["rsi_14"] = _rsi(closes)
    indicators["macd_12_26_9"] = _macd(closes)
    if len(closes) >= 20:
        window = closes[-20:]
        average = mean(window)
        deviation = 2 * pstdev(window)
        indicators["bollinger_20_2"] = {
            "lower": average - deviation,
            "middle": average,
            "upper": average + deviation,
        }
    else:
        indicators["bollinger_20_2"] = None
    indicators["atr_14"] = _atr(bars)
    indicators["adx_14"] = _adx(bars)
    if bars:
        day = datetime.fromisoformat(bars[-1]["timestamp"].replace("Z", "+00:00")).astimezone(timezone.utc).date()
        session_bars = [
            bar for bar in bars
            if datetime.fromisoformat(bar["timestamp"].replace("Z", "+00:00")).astimezone(timezone.utc).date() == day
        ]
        volume_sum = sum(float(bar["volume"]) for bar in session_bars)
        indicators["vwap_utc_day"] = (
            sum(
                ((float(bar["high"]) + float(bar["low"]) + float(bar["close"])) / 3)
                * float(bar["volume"])
                for bar in session_bars
            ) / volume_sum
            if volume_sum > 0 else None
        )
        lookback = bars[-50:]
        indicators["support_resistance_50"] = {
            "support": min(float(bar["low"]) for bar in lookback),
            "resistance": max(float(bar["high"]) for bar in lookback),
        }
        previous = bars[-2] if len(bars) >= 2 else None
        indicators["previous_bar_pivots"] = None if previous is None else {
            "pivot": (float(previous["high"]) + float(previous["low"]) + float(previous["close"])) / 3,
            "r1": 2 * ((float(previous["high"]) + float(previous["low"]) + float(previous["close"])) / 3) - float(previous["low"]),
            "s1": 2 * ((float(previous["high"]) + float(previous["low"]) + float(previous["close"])) / 3) - float(previous["high"]),
        }
    else:
        indicators["vwap_utc_day"] = None
        indicators["support_resistance_50"] = None
        indicators["previous_bar_pivots"] = None

    ema_values = (indicators["ema_9"], indicators["ema_20"], indicators["ema_50"])
    if any(value is None for value in ema_values):
        indicators["ema_alignment"] = "UNAVAILABLE"
    elif ema_values[0] > ema_values[1] > ema_values[2]:
        indicators["ema_alignment"] = "BULLISH"
    elif ema_values[0] < ema_values[1] < ema_values[2]:
        indicators["ema_alignment"] = "BEARISH"
    else:
        indicators["ema_alignment"] = "MIXED"

    required = ("ema_9", "ema_20", "ema_50", "rsi_14", "macd_12_26_9", "bollinger_20_2", "atr_14", "adx_14")
    unavailable = [name for name in required if indicators[name] is None]
    if unavailable:
        diagnostics.append(f"INSUFFICIENT_HISTORY: unavailable indicators: {', '.join(unavailable)}.")
        condition = "INSUFFICIENT_HISTORY"
        result_code = "INSUFFICIENT_HISTORY"
    else:
        adx = indicators["adx_14"]
        condition = "TRENDING" if adx >= 25 else "RANGING" if adx <= 20 else "TRANSITIONAL"
        result_code = "ANALYSIS_NOT_VALIDATED"
        diagnostics.append("Indicators are descriptive and have not been validated as a directional strategy.")
    if indicators["vwap_utc_day"] is None:
        diagnostics.append("VWAP_UNAVAILABLE: no positive volume was reported for the current UTC day.")
    return {
        "decision": "WAIT",
        "decision_code": result_code,
        "market_condition": condition,
        "indicators": indicators,
        "candlestick_patterns": _patterns(bars),
        "diagnostics": diagnostics,
    }
