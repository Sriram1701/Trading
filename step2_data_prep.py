"""
==============================================================================
Step 2: Data Collection & Feature Engineering for CAD/JPY 1-Minute Scalping
==============================================================================
Downloads 1-minute historical OHLCV candle data for CAD/JPY via yfinance 
(or MetaTrader 5 / synthetic simulation fallback), computes core technical 
indicators (RSI, EMAs, MACD, Bollinger Bands, ATR, Candlestick geometry), 
and exports a clean CSV.

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

    if pd.api.types.is_datetime64tz_dtype(df["timestamp"]):
        df["timestamp"] = df["timestamp"].dt.tz_localize(None)

    logger.info(f"Successfully downloaded {len(df)} 1-minute bars from {df['timestamp'].min()} to {df['timestamp'].max()}")
    return df[["timestamp", "open", "high", "low", "close", "volume"]]


def fetch_data_mt5(symbol: str = "CADJPY", timeframe_bars: int = 5000) -> pd.DataFrame:
    """
    Fetch 1-minute historical data using MetaTrader 5 if terminal is active.
    """
    try:
        import MetaTrader5 as mt5
    except ImportError:
        logger.warning("MetaTrader5 library not installed.")
        return None

    if not mt5.initialize():
        logger.warning(f"MT5 initialization failed: {mt5.last_error()}.")
        return None

    logger.info(f"Connected to MetaTrader 5. Fetching {timeframe_bars} 1-min bars for {symbol}...")
    rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M1, 0, timeframe_bars)
    mt5.shutdown()

    if rates is None or len(rates) == 0:
        logger.warning(f"No rates returned from MT5 for {symbol}.")
        return None

    df = pd.DataFrame(rates)
    df["timestamp"] = pd.to_datetime(df["time"], unit="s")
    df.rename(columns={"tick_volume": "volume"}, inplace=True)
    logger.info(f"Fetched {len(df)} bars from MT5.")
    return df[["timestamp", "open", "high", "low", "close", "volume"]]


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

    return pd.DataFrame({
        "timestamp": timestamps,
        "open": opens,
        "high": highs,
        "low": lows,
        "close": closes,
        "volume": volumes
    })


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
    data = df.copy()

    # 1. EMAs
    data["ema_9"] = data["close"].ewm(span=9, adjust=False).mean()
    data["ema_21"] = data["close"].ewm(span=21, adjust=False).mean()
    data["ema_diff"] = data["ema_9"] - data["ema_21"]
    data["ema_cross_bull"] = ((data["ema_9"] > data["ema_21"]) & (data["ema_9"].shift(1) <= data["ema_21"].shift(1))).astype(int)
    data["ema_cross_bear"] = ((data["ema_9"] < data["ema_21"]) & (data["ema_9"].shift(1) >= data["ema_21"].shift(1))).astype(int)
    data["ema_trend"] = (data["ema_9"] > data["ema_21"]).astype(int)

    # 2. RSI (14)
    delta = data["close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    rs = avg_gain / (avg_loss + 1e-9)
    data["rsi_14"] = 100 - (100 / (1 + rs))
    data["rsi_oversold"] = (data["rsi_14"] < 30).astype(int)
    data["rsi_overbought"] = (data["rsi_14"] > 70).astype(int)

    # 3. MACD (12, 26, 9)
    ema_12 = data["close"].ewm(span=12, adjust=False).mean()
    ema_26 = data["close"].ewm(span=26, adjust=False).mean()
    data["macd_line"] = ema_12 - ema_26
    data["macd_signal"] = data["macd_line"].ewm(span=9, adjust=False).mean()
    data["macd_hist"] = data["macd_line"] - data["macd_signal"]

    # 4. Bollinger Bands (20, 2)
    bb_mean = data["close"].rolling(window=20).mean()
    bb_std = data["close"].rolling(window=20).std()
    data["bb_middle"] = bb_mean
    data["bb_upper"] = bb_mean + (2 * bb_std)
    data["bb_lower"] = bb_mean - (2 * bb_std)
    data["bb_bandwidth"] = (data["bb_upper"] - data["bb_lower"]) / (bb_mean + 1e-9)
    data["bb_pct_b"] = (data["close"] - data["bb_lower"]) / (data["bb_upper"] - data["bb_lower"] + 1e-9)

    # 5. Average True Range (ATR 14)
    high_low = data["high"] - data["low"]
    high_close = (data["high"] - data["close"].shift(1)).abs()
    low_close = (data["low"] - data["close"].shift(1)).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    data["atr_14"] = tr.rolling(window=14).mean()

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

    raw_df = None
    if args.source == "mt5":
        raw_df = fetch_data_mt5(args.symbol.replace("=X", ""))
    elif args.source == "yfinance":
        try:
            raw_df = fetch_data_yfinance(args.symbol, period=args.period)
        except Exception as e:
            logger.warning(f"yfinance fetch failed: {e}. Falling back to synthetic simulation...")
            raw_df = create_synthetic_sample_data(args.bars)
    elif args.source == "synthetic":
        raw_df = create_synthetic_sample_data(args.bars)
    else:  # auto
        try:
            raw_df = fetch_data_yfinance(args.symbol, period=args.period, timeout=5)
        except Exception as e:
            logger.info(f"Auto-fetch yfinance not reachable ({e}). Using high-fidelity synthetic market data.")
            raw_df = create_synthetic_sample_data(args.bars)

    if raw_df is None or raw_df.empty:
        logger.info("Generating fallback synthetic dataset...")
        raw_df = create_synthetic_sample_data(args.bars)

    featured_df = calculate_indicators(raw_df)
    featured_df.to_csv(args.output, index=False)
    logger.info(f"✅ Finished! Feature dataset saved to '{args.output}' ({len(featured_df)} rows, {len(featured_df.columns)} columns).")
    print("\n--- Sample Features Head ---")
    print(featured_df[["timestamp", "open", "close", "rsi_14", "ema_9", "ema_21", "macd_hist", "bb_pct_b"]].head())


if __name__ == "__main__":
    main()
