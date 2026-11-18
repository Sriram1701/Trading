# CAD/JPY Research Prototype (Unvalidated)

This repository contains experimental CAD/JPY data-preparation, model-training, TradingView-rule, and notification prototypes. None has established predictive accuracy, and no output is a verified trading signal or recommendation. External Forex prices may differ from any broker's instruments, including OTC quotes. Do not use this prototype for live trading.

The browser Signal Desk is a compact, manual screenshot-analysis companion. It does not integrate with a broker or place orders. Its UP/DOWN/WAIT result is an unvalidated visual impression from the local Ollama vision model, not a verified trading signal. The experimental tabular model elsewhere in this repository does not accept images.

---

## 🚀 Quick Start Guide

### Step 1: TradingView Setup (Pine Script v5)
1. Open [TradingView](https://www.tradingview.com/) and open the **CADJPY** 1-Minute chart (`1m`).
2. Open the **Pine Editor** tab at the bottom of the screen.
3. Copy and paste the complete code from [`cad_jpy_1m_strategy.pine`](cad_jpy_1m_strategy.pine).
4. Click **Add to Chart**.
5. The script displays experimental, unvalidated rule markers only. They are not verified predictions or recommendations. Its visual outputs include:
   - 🔹 **Cyan Line**: 9 EMA (Fast)
   - 🔸 **Orange Line**: 21 EMA (Slow)
   - 🟢 **Green Line**: Dynamic Support Level
   - 🔴 **Red Line**: Dynamic Resistance Level
   - ⬆️ **Green Arrows**: BUY Signals (with background highlight)
   - ⬇️ **Red Arrows**: SELL Signals (with background highlight)

Do not use these experimental markers for live trading; no strategy validation has been completed.

---

### Step 2: Historical Data Collection & Feature Engineering
Fetches 1-minute historical OHLCV data for CAD/JPY, calculates RSI(14), EMA(9), EMA(21), MACD, Bollinger Bands, ATR, and exports clean features to CSV.

```bash
# Run with default settings (downloads last 7 days of 1-min CAD/JPY data):
uv run python step2_data_prep.py

# Or with custom options:
uv run python step2_data_prep.py --source yfinance --symbol CADJPY=X --period 7d --output cad_jpy_1m_features.csv
```

The `synthetic` source is for clearly labeled demonstrations only; the normal
training loader rejects it. A failed real-data request stops the pipeline.
Validation also rejects duplicate or out-of-order timestamps, invalid OHLC
values, and non-contiguous one-minute rows. Forex session gaps may therefore
require an explicitly selected contiguous segment before training.

---

### Step 3: Train Machine Learning Model (Random Forest / XGBoost)
Trains a Machine Learning classifier to predict whether the **next 1-minute candle** will close UP (1) or DOWN (0) with an 80/20 chronological split, confusion matrix, precision/recall, and feature importance.

```bash
# Train XGBoost Model:
uv run python step3_train_model.py --data cad_jpy_1m_features.csv --model-type xgboost --output cad_jpy_model.joblib

# Train Random Forest Model:
uv run python step3_train_model.py --data cad_jpy_1m_features.csv --model-type random_forest --output cad_jpy_model.joblib
```

---

### Step 4: Experimental data monitor and Telegram notifications
The script can request data and send notifications, but its source, timing, instrument equivalence, model outputs, and predictive performance are not independently validated. Its model probability is not calibrated confidence or accuracy. Notifications are informational only; they must not be interpreted as trade instructions. The browser screen-watcher has no Telegram or broker connection.

#### 1. Setup Telegram Credentials:
Copy `.env.example` to `.env` and fill in your Bot Token & Chat ID:
```ini
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
PROBABILITY_THRESHOLD=0.80
```

#### 2. Test Telegram Connection:
```bash
uv run python step4_live_telegram_bot.py --test-alert
```

#### 3. Run Live Bot:
```bash
uv run python step4_live_telegram_bot.py --model cad_jpy_model.joblib --threshold 0.80
```

#### 4. Run Dry-Run (Console Testing without Telegram):
```bash
uv run python step4_live_telegram_bot.py --dry-run
```

---

## Screenshot-only Signal Desk

Run the local Node server from the repository root:

```powershell
node screen_watcher\server.js
```

Open `http://127.0.0.1:3000`, then click **Upload Screenshot** or drag a chart image onto the upload panel. Selection/drop starts analysis automatically; no local path or separate command is required. The browser previews the image locally and posts it to the loopback Node server, which sends the Base64 image only to `http://localhost:11434/api/chat` using Ollama's `images` array and `qwen3-vl:4b`. The primary page does not use screen sharing, continuous monitoring, external AI, or a separate market-data API.

Start Ollama locally and ensure `qwen3-vl:4b` is installed. The app checks Ollama and the model's reported vision capability and explains when Ollama is offline or the model is missing. No API credentials, paid service, or external image transmission is used. Uploaded images are held in memory for the request and are not saved by this app.

The model is asked to visually describe EMA 9/21, Bollinger Bands (20, 2), RSI 14 (70/30), MACD 12/26/9, candle direction/price action, trend, and support/resistance. Unreadable observations must be `null`; unclear or conflicting evidence must produce `WAIT`. The backend also forces WAIT unless both readable candle evidence and readable indicator/trend/level context are returned. Visible image pixels are not verified OHLC or market data. Any UP/DOWN result is an unvalidated model impression, may be wrong, and must not be interpreted as a proven recommendation. Bottom directional controls remain disabled; no broker actions are automated.

Sound is opt-in and requires a user gesture to enable browser audio. Desktop notifications are separately opt-in and request browser permission when enabled. Duplicate analysis IDs are suppressed; WAIT is silent. The existing screen-monitor module remains only as unused legacy code and is not loaded by the primary UI.

Run the relevant checks:

```powershell
python -m unittest discover -s tests -v
node --test screen_watcher\tests\*.test.js
```

The Node tests include mocked upload, Ollama request, invalid-image, and WAIT-fallback integration tests. The opt-in real local Ollama test (`$env:RUN_OLLAMA_INTEGRATION='1'; node --test screen_watcher\tests\vision_provider.test.js`) sends a generated solid-color image (not a chart) and is slow on CPU; it verifies image input but does not validate chart interpretation.

---

## 📁 Project Structure

```
├── qx_market/                    # Provider registry, candle quality, SQLite, API, analysis
├── run_data_api.py               # Loopback-only FastAPI launcher
├── screen_watcher/               # Screenshot-only Signal Desk with local Ollama vision analysis
├── tests/                        # Python data-integrity and market-architecture tests
├── step2_data_prep.py            # Historical data preparation
├── step3_train_model.py          # Experimental model training
├── step4_live_telegram_bot.py    # Experimental data monitor/notifications
├── requirements.txt              # Python package dependencies
└── README.md                     # Setup and safety notes
```

---

## 🇮🇳 தமிழ் விளக்கம் (Tamil Summary)

- **படி 1 (Step 1)**: `cad_jpy_1m_strategy.pine` ஒரு பரிசோதனை, சரிபார்க்கப்படாத விதி-அடிப்படையிலான ஸ்கிரிப்ட். அதன் அம்புக்குறிகள் கணிப்புகள் அல்ல; நேரடி வர்த்தகத்தில் பயன்படுத்த வேண்டாம்.
- **படி 2 (Step 2)**: `step2_data_prep.py` ஸ்கிரிப்ட் CAD/JPY 1-நிமிட டேட்டாவை எடுத்து RSI, EMA, MACD, Bollinger Bands இண்டிகேட்டர்களைக் கணக்கிட்டு `cad_jpy_1m_features.csv` ஃபைலாகச் சேமிக்கும்.
- **படி 3 (Step 3)**: `step3_train_model.py` ஸ்கிரிப்ட் அடுத்த 1-நிமிட கேண்டில் UP அல்லது DOWN ஆகுமா என்பதை கணிக்க AI மாடலை (XGBoost / Random Forest) ட்ரெயின் செய்து `cad_jpy_model.joblib` ஃபைலாகச் சேமிக்கும்.
- **படி 4 (Step 4)**: `step4_live_telegram_bot.py` ஒரு பரிசோதனை தரவு/அறிவிப்பு ஸ்கிரிப்ட். அதன் தரவு, நேரம், மாடல் வெளியீடு அல்லது கணிப்பு செயல்திறன் சரிபார்க்கப்படவில்லை. எந்த சதவீதமும் துல்லியமாகவோ உறுதிப்படுத்தப்பட்ட நம்பகத்தன்மையாகவோ கருதப்படக்கூடாது.
