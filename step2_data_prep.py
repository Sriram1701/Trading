"""
==============================================================================
Step 2: Data Collection & Feature Engineering for CAD/JPY 1-Minute Scalping
==============================================================================
Downloads 1-minute OHLCV data from an explicitly selected source, validates
timestamps and candle values, computes technical indicators, and exports CSV.
Synthetic data is available only through the explicit synthetic source option
and is labeled so the model-training step can reject it.

Usage:
    python step2_data_prep.py
    python step2_data_prep.py --source yfinance --symbol CADJPY=X --period 7d
    python step2_data_prep.py --source synthetic --bars 3000
==============================================================================
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timedelta
import numpy as np
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("DataPrep")

OHLCV_COLUMNS = ["timestamp", "open", "high", "low", "close", "volume", "source"]


def validate_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    """Validate one-minute bars and require an explicit source label."""
    if df is None or df.empty:
        raise ValueError("Market data is empty; refusing to continue.")

    missing_columns = [column for column in OHLCV_COLUMNS if column not in df.columns]
    if missing_columns:
        raise ValueError(f"Market data is missing required columns: {missing_columns}")

    data = df.copy()
    data["timestamp"] = pd.to_datetime(data["timestamp"], utc=True, errors="coerce")
    if data["timestamp"].isna().any():
        raise ValueError("Market data contains invalid or missing timestamps.")
    if data["timestamp"].duplicated().any():
        raise ValueError("Market data contains duplicate timestamps.")
    if not data["timestamp"].is_monotonic_increasing:
        raise ValueError("Market data timestamps must be in ascending order.")

    price_columns = ["open", "high", "low", "close"]
    for column in price_columns + ["volume"]:
        data[column] = pd.to_numeric(data[column], errors="coerce")
        values = data[column].to_numpy(dtype=float)
        if not np.isfinite(values).all():
            raise ValueError(f"Market data contains missing or non-finite {column} values.")

    prices = data[price_columns]
    if (prices <= 0).any().any():
        raise ValueError("OHLC prices must be greater than zero.")
    invalid_ohlc = (
        (data["high"] < data[["open", "close", "low"]].max(axis=1))
        | (data["low"] > data[["open", "close", "high"]].min(axis=1))
    )
    if invalid_ohlc.any():
        raise ValueError("Market data contains invalid OHLC relationships.")
    if (data["volume"] < 0).any():
        raise ValueError("Volume must not be negative.")

    sources = data["source"].astype("string").str.strip()
    if sources.isna().any() or (sources == "").any():
        raise ValueError("Every candle must include a non-empty source/provenance label.")
    if sources.nunique() != 1:
        raise ValueError("A dataset must contain exactly one source; mixed provenance is not allowed.")
    data["source"] = sources

    gaps = data["timestamp"].diff().dropna()
    if (gaps != pd.Timedelta(minutes=1)).any():
        gap_count = int((gaps != pd.Timedelta(minutes=1)).sum())
        raise ValueError(
            f"Market data has {gap_count} missing or non-minute candle interval(s); "
            "provide a contiguous one-minute segment."
        )

    return data.reset_index(drop=True)


def fetch_data_yfinance(symbol: str = "CADJPY=X", period: str = "7d", interval: str = "1m", timeout: int = 6) -> pd.DataFrame:
    """
    Fetch 1-minute historical data using yfinance with safety timeout.
    """
    import concurrent.futures
    
    def _fetch():
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        data = ticker.history(period=period, interval=interval, auto_adjust=True)
        return data

    logger.info(f"Downloading 1m data from yfinance for {symbol} (period={period})...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_fetch)
        try:
            df = future.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            raise TimeoutError(f"yfinance network request timed out after {timeout}s.")
        except Exception as e:
            raise RuntimeError(f"yfinance download failed: {e}")

    if df is None or df.empty:
        raise ValueError(f"No historical 1-minute data returned for {symbol}.")

    df.reset_index(inplace=True)
    time_col = "Datetime" if "Datetime" in df.columns else ("Date" if "Date" in df.columns else df.columns[0])
    df.rename(columns={
        time_col: "timestamp",
        "Open": "open",
        "High": "high",
        "Low": "low",
        "Close": "close",
        "Volume": "volume"
    }, inplace=True)

    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["source"] = "yfinance"
    df = validate_ohlcv(df)

    logger.info(f"Successfully downloaded {len(df)} 1-minute bars from {df['timestamp'].min()} to {df['timestamp'].max()}")
    return df[OHLCV_COLUMNS]


def fetch_data_mt5(symbol: str = "CADJPY", timeframe_bars: int = 5000) -> pd.DataFrame:
    """
    Fetch 1-minute historical data using MetaTrader 5 if terminal is active.
    """
    try:
        import MetaTrader5 as mt5
    except ImportError:
        raise RuntimeError("MetaTrader5 is not installed; no market data was retrieved.")

    if not mt5.initialize():
        raise RuntimeError(f"MT5 initialization failed: {mt5.last_error()}.")

    logger.info(f"Connected to MetaTrader 5. Fetching {timeframe_bars} 1-min bars for {symbol}...")
    try:
        rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M1, 0, timeframe_bars)
    finally:
        mt5.shutdown()

    if rates is None or len(rates) == 0:
        raise ValueError(f"No one-minute rates returned from MT5 for {symbol}.")

    df = pd.DataFrame(rates)
    df["timestamp"] = pd.to_datetime(df["time"], unit="s", utc=True)
    df.rename(columns={"tick_volume": "volume"}, inplace=True)
    df["source"] = "mt5"
    df = validate_ohlcv(df)
    logger.info(f"Fetched {len(df)} bars from MT5.")
    return df[OHLCV_COLUMNS]


def create_synthetic_sample_data(num_bars: int = 3000) -> pd.DataFrame:
    """Generate realistic high-fidelity 1m CAD/JPY forex candle simulation."""
    logger.info(f"Generating {num_bars} realistic 1-min CAD/JPY market bars...")
    np.random.seed(42)
    start_time = datetime.now() - timedelta(minutes=num_bars)
    timestamps = [start_time + timedelta(minutes=i) for i in range(num_bars)]
    
    price = 110.500
    opens, highs, lows, closes, volumes = [], [], [], [], []
    
    trend = 0.0
    for i in range(num_bars):
        # Regime shifting micro-trends
        if i % 120 == 0:
            trend = np.random.choice([-0.0001, 0.0, 0.0001])
        
        noise = np.random.normal(0, 0.00035)
        ret = trend + noise
        open_p = price
        close_p = open_p * (1 + ret)
        
        spread = abs(np.random.normal(0, 0.012))
        high_p = max(open_p, close_p) + spread
        low_p = min(open_p, close_p) - abs(np.random.normal(0, 0.012))
        vol = int(np.random.uniform(50, 450))
        
        opens.append(round(open_p, 3))
        highs.append(round(high_p, 3))
        lows.append(round(low_p, 3))
        closes.append(round(close_p, 3))
        volumes.append(vol)
        price = close_p

    data = pd.DataFrame({
        "timestamp": timestamps,
        "open": opens,
        "high": highs,
        "low": lows,
        "close": closes,
        "volume": volumes,
        "source": "synthetic"
    })
    return validate_ohlcv(data)


def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute Technical Indicators:
    - RSI(14)
    - EMA(9) & EMA(21) + Spread + Trend
    - MACD(12, 26, 9) + Signal + Hist
    - Bollinger Bands(20, 2) + Upper + Lower + %B + Bandwidth
    - ATR(14)
    - Candlestick Micro-Structure (Body ratio, Upper/Lower wicks, Returns)
    """
    logger.info("Calculating Technical Indicators (RSI, EMAs, MACD, Bollinger Bands, ATR)...")
    data = validate_ohlcv(df)

    # 1. EMAs (EMA 9, EMA 21, EMA 200 Major Trend Filter)
    data["ema_9"] = data["close"].ewm(span=9, adjust=False).mean()
    data["ema_21"] = data["close"].ewm(span=21, adjust=False).mean()
    data["ema_200"] = data["close"].ewm(span=200, adjust=False).mean()
    data["ema_diff"] = data["ema_9"] - data["ema_21"]
    data["ema_cross_bull"] = ((data["ema_9"] > data["ema_21"]) & (data["ema_9"].shift(1) <= data["ema_21"].shift(1))).astype(int)
    data["ema_cross_bear"] = ((data["ema_9"] < data["ema_21"]) & (data["ema_9"].shift(1) >= data["ema_21"].shift(1))).astype(int)
    data["ema_trend"] = (data["ema_9"] > data["ema_21"]).astype(int)
    data["major_trend_bull"] = (data["close"] > data["ema_200"]).astype(int)

    # 2. ADX (14) Trend Strength Filter
    high_diff = data["high"].diff()
    low_diff = -data["low"].diff()
    plus_dm = np.where((high_diff > low_diff) & (high_diff > 0), high_diff, 0.0)
    minus_dm = np.where((low_diff > high_diff) & (low_diff > 0), low_diff, 0.0)
    
    tr1 = data["high"] - data["low"]
    tr2 = (data["high"] - data["close"].shift(1)).abs()
    tr3 = (data["low"] - data["close"].shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    
    tr_smooth = pd.Series(tr).ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    plus_di = 100 * pd.Series(plus_dm).ewm(alpha=1/14, min_periods=14, adjust=False).mean() / (tr_smooth + 1e-9)
    minus_di = 100 * pd.Series(minus_dm).ewm(alpha=1/14, min_periods=14, adjust=False).mean() / (tr_smooth + 1e-9)
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-9)
    data["adx_14"] = dx.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    data["adx_strong_trend"] = (data["adx_14"] >= 25).astype(int)

    # 3. RSI (14)
    delta = data["close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    rs = avg_gain / (avg_loss + 1e-9)
    data["rsi_14"] = 100 - (100 / (1 + rs))
    data["rsi_oversold"] = (data["rsi_14"] < 30).astype(int)
    data["rsi_overbought"] = (data["rsi_14"] > 70).astype(int)

    # 4. MACD (12, 26, 9)
    ema_12 = data["close"].ewm(span=12, adjust=False).mean()
    ema_26 = data["close"].ewm(span=26, adjust=False).mean()
    data["macd_line"] = ema_12 - ema_26
    data["macd_signal"] = data["macd_line"].ewm(span=9, adjust=False).mean()
    data["macd_hist"] = data["macd_line"] - data["macd_signal"]

    # 5. Bollinger Bands (20, 2)
    bb_mean = data["close"].rolling(window=20).mean()
    bb_std = data["close"].rolling(window=20).std()
    data["bb_middle"] = bb_mean
    data["bb_upper"] = bb_mean + (2 * bb_std)
    data["bb_lower"] = bb_mean - (2 * bb_std)
    data["bb_bandwidth"] = (data["bb_upper"] - data["bb_lower"]) / (bb_mean + 1e-9)
    data["bb_pct_b"] = (data["close"] - data["bb_lower"]) / (data["bb_upper"] - data["bb_lower"] + 1e-9)

    # 6. Average True Range (ATR 14)
    data["atr_14"] = tr_smooth


    # 6. Candlestick Features & Micro-Price Dynamics
    data["return_1m"] = data["close"].pct_change()
    data["return_3m"] = data["close"].pct_change(3)
    data["return_5m"] = data["close"].pct_change(5)
    
    body = (data["close"] - data["open"]).abs()
    candle_range = (data["high"] - data["low"]).replace(0, 1e-9)
    data["body_ratio"] = body / candle_range
    data["upper_wick"] = (data["high"] - data[["open", "close"]].max(axis=1)) / candle_range
    data["lower_wick"] = (data[["open", "close"]].min(axis=1) - data["low"]) / candle_range
    data["candle_direction"] = np.where(data["close"] >= data["open"], 1, 0)

    # 7. Volume Features
    if "volume" in data.columns and data["volume"].sum() > 0:
        data["vol_ma10"] = data["volume"].rolling(10).mean()
        data["vol_ratio"] = data["volume"] / (data["vol_ma10"] + 1e-9)
    else:
        data["vol_ratio"] = 1.0

    # Clean NaNs caused by rolling warmups
    initial_len = len(data)
    data.dropna(inplace=True)
    data.reset_index(drop=True, inplace=True)
    logger.info(f"Calculated features. Clean dataset has {len(data)} rows (dropped {initial_len - len(data)} warm-up rows).")
    return data


def main():
    parser = argparse.ArgumentParser(description="CAD/JPY 1-Minute Data Collection & Feature Engineering")
    parser.add_argument("--source", type=str, choices=["yfinance", "mt5", "synthetic", "auto"], default="auto", help="Data source")
    parser.add_argument("--symbol", type=str, default="CADJPY=X", help="Ticker symbol")
    parser.add_argument("--period", type=str, default="7d", help="Data period for yfinance")
    parser.add_argument("--bars", type=int, default=3000, help="Number of bars for synthetic mode")
    parser.add_argument("--output", type=str, default="cad_jpy_1m_features.csv", help="Output CSV path")
    args = parser.parse_args()

    if args.source == "mt5":
        raw_df = fetch_data_mt5(args.symbol.replace("=X", ""))
    elif args.source == "synthetic":
        raw_df = create_synthetic_sample_data(args.bars)
    else:
        raw_df = fetch_data_yfinance(args.symbol, period=args.period, timeout=5)

    featured_df = calculate_indicators(validate_ohlcv(raw_df))
    featured_df.to_csv(args.output, index=False)
    logger.info(f"✅ Finished! Feature dataset saved to '{args.output}' ({len(featured_df)} rows, {len(featured_df.columns)} columns).")
    print("\n--- Sample Features Head ---")
    print(featured_df[["timestamp", "open", "close", "rsi_14", "ema_9", "ema_21", "macd_hist", "bb_pct_b"]].head())


if __name__ == "__main__":
    main()
