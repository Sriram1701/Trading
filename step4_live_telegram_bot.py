"""
==============================================================================
Step 4: Real-Time 1-Minute CAD/JPY Market Monitor & Telegram Alert Bot
==============================================================================
Fetches real-time 1-minute market data for CAD/JPY every 60 seconds, calculates
the live indicator features, feeds them into the trained ML model, and sends
high-probability signals (>80% confidence) directly to Telegram.

Features:
- Configurable probability threshold (default 80% / 0.80)
- Smart deduplication (avoids repeated alerts for the same 1m bar)
- Rich HTML formatted Telegram alert messages
- Real-time indicator diagnostics (Price, RSI, EMA 9/21, MACD, Probabilities)
- Built-in --test-alert and --dry-run modes

Usage:
    # 1. Test Telegram Connection:
    uv run python step4_live_telegram_bot.py --test-alert

    # 2. Run Live Real-Time Bot:
    uv run python step4_live_telegram_bot.py --model cad_jpy_model.joblib --threshold 0.82

    # 3. Dry-Run Mode (Console only without Telegram dispatch):
    uv run python step4_live_telegram_bot.py --dry-run
==============================================================================
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
import joblib
import numpy as np
import pandas as pd
import requests

# Try loading .env file if python-dotenv is present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("TelegramBot")


def send_telegram_message(bot_token: str, chat_id: str, message: str) -> bool:
    """Sends HTML formatted message to Telegram Chat via Bot API."""
    if not bot_token or not chat_id or bot_token == "YOUR_TELEGRAM_BOT_TOKEN":
        logger.warning("Telegram Bot Token or Chat ID not configured. Message skipped.")
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        res_json = response.json()
        if response.status_code == 200 and res_json.get("ok"):
            logger.info("📲 Telegram alert sent successfully!")
            return True
        else:
            logger.error(f"Failed to send Telegram message: {res_json.get('description', response.text)}")
            return False
    except Exception as e:
        logger.error(f"Error sending Telegram notification: {e}")
        return False


def format_alert_message(symbol: str, signal_type: str, prob: float, price: float, rsi: float, ema9: float, ema21: float, macd_hist: float, bar_time: str) -> str:
    """Formats a sleek, high-visibility HTML message for Telegram."""
    emoji = "🚀 <b>STRONG BUY (UP)</b>" if signal_type == "UP" else "🔻 <b>STRONG SELL (DOWN)</b>"
    direction_badge = "🟢 CALL / BUY" if signal_type == "UP" else "🔴 PUT / SELL"
    
    msg = (
        f"⚡ <b>AI TRADING SIGNAL ALERT</b> ⚡\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📊 <b>Pair:</b> <code>{symbol}</code>\n"
        f"⏱ <b>Timeframe:</b> <code>1-Minute (Next Candle)</code>\n"
        f"🎯 <b>Signal:</b> {emoji}\n"
        f"📈 <b>Action:</b> <b>{direction_badge}</b>\n"
        f"🔥 <b>AI Confidence:</b> <code>{prob * 100:.1f}%</code>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"💵 <b>Current Price:</b> <code>{price:.3f}</code>\n"
        f"📊 <b>RSI (14):</b> <code>{rsi:.1f}</code>\n"
        f"📉 <b>EMA 9 / 21:</b> <code>{ema9:.3f} / {ema21:.3f}</code> ({'EMA9 > EMA21' if ema9 > ema21 else 'EMA9 < EMA21'})\n"
        f"🌊 <b>MACD Hist:</b> <code>{macd_hist:+.4f}</code>\n"
        f"⏰ <b>Candle Time:</b> <code>{bar_time}</code>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"🤖 <i>Automated CAD/JPY 1M AI Predictor</i>"
    )
    return msg


def compute_live_features(df: pd.DataFrame) -> pd.DataFrame:
    """Calculates all features identical to training pipeline on the latest stream."""
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

    # 3. MACD
    ema_12 = data["close"].ewm(span=12, adjust=False).mean()
    ema_26 = data["close"].ewm(span=26, adjust=False).mean()
    data["macd_line"] = ema_12 - ema_26
    data["macd_signal"] = data["macd_line"].ewm(span=9, adjust=False).mean()
    data["macd_hist"] = data["macd_line"] - data["macd_signal"]

    # 4. Bollinger Bands
    bb_mean = data["close"].rolling(window=20).mean()
    bb_std = data["close"].rolling(window=20).std()
    data["bb_middle"] = bb_mean
    data["bb_upper"] = bb_mean + (2 * bb_std)
    data["bb_lower"] = bb_mean - (2 * bb_std)
    data["bb_bandwidth"] = (data["bb_upper"] - data["bb_lower"]) / (bb_mean + 1e-9)
    data["bb_pct_b"] = (data["close"] - data["bb_lower"]) / (data["bb_upper"] - data["bb_lower"] + 1e-9)

    # 5. ATR (14)
    high_low = data["high"] - data["low"]
    high_close = (data["high"] - data["close"].shift(1)).abs()
    low_close = (data["low"] - data["close"].shift(1)).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    data["atr_14"] = tr.rolling(window=14).mean()

    # 6. Returns & Candle Body
    data["return_1m"] = data["close"].pct_change()
    data["return_3m"] = data["close"].pct_change(3)
    data["return_5m"] = data["close"].pct_change(5)
    
    body = (data["close"] - data["open"]).abs()
    candle_range = (data["high"] - data["low"]).replace(0, 1e-9)
    data["body_ratio"] = body / candle_range
    data["upper_wick"] = (data["high"] - data[["open", "close"]].max(axis=1)) / candle_range
    data["lower_wick"] = (data[["open", "close"]].min(axis=1) - data["low"]) / candle_range
    data["candle_direction"] = np.where(data["close"] >= data["open"], 1, 0)

    # 7. Volume
    if "volume" in data.columns and data["volume"].sum() > 0:
        data["vol_ma10"] = data["volume"].rolling(10).mean()
        data["vol_ratio"] = data["volume"] / (data["vol_ma10"] + 1e-9)
    else:
        data["vol_ratio"] = 1.0

    return data


def fetch_latest_bars(symbol: str = "CADJPY=X", bars: int = 100) -> pd.DataFrame:
    """Fetches recent 1m bars from yfinance."""
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        df = ticker.history(period="1d", interval="1m", auto_adjust=True)
        if df.empty:
            df = ticker.history(period="5d", interval="1m", auto_adjust=True)
        
        if df.empty:
            return None

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

        return df.tail(bars).reset_index(drop=True)
    except Exception as e:
        logger.error(f"Error fetching live data: {e}")
        return None


def run_bot(model_path: str, bot_token: str, chat_id: str, threshold: float, symbol: str, dry_run: bool, once: bool):
    """Main live trading alert loop."""
    if not os.path.exists(model_path):
        logger.error(f"Model file '{model_path}' not found. Please train model using step3_train_model.py first.")
        sys.exit(1)

    logger.info(f"Loading trained AI model from '{model_path}'...")
    bundle = joblib.load(model_path)
    model = bundle["model"]
    scaler = bundle["scaler"]
    feature_cols = bundle["feature_cols"]

    logger.info(f"Loaded {bundle.get('model_type', 'ML')} model with {len(feature_cols)} features.")
    logger.info(f"Starting Live Monitor for {symbol} | Alert Threshold: >= {threshold * 100:.0f}%")
    if dry_run:
        logger.info("⚠️ DRY-RUN MODE: Alerts will be logged to console without sending to Telegram.")

    last_alerted_bar_time = None

    while True:
        try:
            # 1. Fetch latest bars
            df = fetch_latest_bars(symbol, bars=80)
            if df is None or len(df) < 30:
                logger.warning("Waiting for sufficient live market bars...")
                if once:
                    break
                time.sleep(15)
                continue

            # 2. Compute features
            featured_df = compute_live_features(df)
            
            # Target the most recently completed candle (second-to-last or last)
            latest_row = featured_df.iloc[-1]
            bar_time = str(latest_row["timestamp"])
            current_price = float(latest_row["close"])
            rsi_val = float(latest_row["rsi_14"])
            ema9_val = float(latest_row["ema_9"])
            ema21_val = float(latest_row["ema_21"])
            macd_hist_val = float(latest_row["macd_hist"])

            # 3. Model Inference
            X_live = latest_row[feature_cols].values.reshape(1, -1)
            X_live_scaled = scaler.transform(X_live)

            # Predict probabilities: [Prob_Down(0), Prob_Up(1)]
            probs = model.predict_proba(X_live_scaled)[0]
            prob_down, prob_up = probs[0], probs[1]

            logger.info(
                f"[{bar_time}] Price: {current_price:.3f} | RSI: {rsi_val:.1f} | "
                f"EMA 9/21: {ema9_val:.3f}/{ema21_val:.3f} | Prob UP: {prob_up*100:.1f}% | Prob DOWN: {prob_down*100:.1f}%"
            )

            # 4. Check Probability Threshold
            signal = None
            signal_prob = 0.0

            if prob_up >= threshold:
                signal = "UP"
                signal_prob = prob_up
            elif prob_down >= threshold:
                signal = "DOWN"
                signal_prob = prob_down

            # 5. Dispatch Alert
            if signal and (bar_time != last_alerted_bar_time):
                alert_text = format_alert_message(
                    symbol=symbol,
                    signal_type=signal,
                    prob=signal_prob,
                    price=current_price,
                    rsi=rsi_val,
                    ema9=ema9_val,
                    ema21=ema21_val,
                    macd_hist=macd_hist_val,
                    bar_time=bar_time
                )

                print("\n" + "=" * 60)
                print(f"🚨 HIGH PROBABILITY SIGNAL DETECTED: {signal} ({signal_prob*100:.1f}%)")
                print("=" * 60)
                print(alert_text)
                print("=" * 60 + "\n")

                if not dry_run:
                    send_telegram_message(bot_token, chat_id, alert_text)

                last_alerted_bar_time = bar_time
            else:
                if signal is None:
                    logger.debug(f"Confidence below threshold {threshold*100:.0f}%. No alert dispatched.")

            if once:
                break

            # Sleep until next 1m candle (60s)
            time.sleep(60)

        except KeyboardInterrupt:
            logger.info("Stopping Telegram Bot. Goodbye!")
            break
        except Exception as e:
            logger.error(f"Error in bot loop: {e}", exc_info=True)
            if once:
                break
            time.sleep(30)


def main():
    parser = argparse.ArgumentParser(description="CAD/JPY Live Telegram Alert Bot")
    parser.add_argument("--model", type=str, default="cad_jpy_model.joblib", help="Path to trained joblib model")
    parser.add_argument("--threshold", type=float, default=float(os.getenv("PROBABILITY_THRESHOLD", "0.82")), help="Confidence threshold (e.g. 0.82 for 82%%)")
    parser.add_argument("--symbol", type=str, default=os.getenv("SYMBOL", "CADJPY=X"), help="Ticker symbol")
    parser.add_argument("--token", type=str, default=os.getenv("TELEGRAM_BOT_TOKEN", ""), help="Telegram Bot Token")
    parser.add_argument("--chat-id", type=str, default=os.getenv("TELEGRAM_CHAT_ID", ""), help="Telegram Chat ID")
    parser.add_argument("--dry-run", action="store_true", help="Run in dry-run mode (no Telegram API calls)")
    parser.add_argument("--once", action="store_true", help="Run single analysis pass and exit")
    parser.add_argument("--test-alert", action="store_true", help="Send a test message to verify Telegram setup")
    args = parser.parse_args()

    if args.test_alert:
        print("Sending Test Alert to Telegram...")
        test_msg = format_alert_message(
            symbol=args.symbol,
            signal_type="UP",
            prob=0.865,
            price=110.450,
            rsi=27.4,
            ema9=110.420,
            ema21=110.380,
            macd_hist=0.0125,
            bar_time=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        )
        success = send_telegram_message(args.token, args.chat_id, test_msg)
        if success:
            print("✅ Test message delivered successfully! Your Telegram Bot is ready.")
        else:
            print("❌ Failed to deliver test message. Check your TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.")
        return

    run_bot(
        model_path=args.model,
        bot_token=args.token,
        chat_id=args.chat_id,
        threshold=args.threshold,
        symbol=args.symbol,
        dry_run=args.dry_run,
        once=args.once
    )


if __name__ == "__main__":
    main()
