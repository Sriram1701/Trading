# 📈 CAD/JPY 1-Minute AI Trading System (Pine Script v5 & Python Machine Learning)

A complete automated algorithmic trading framework for CAD/JPY on a 1-Minute timeframe, featuring:
1. **Pine Script v5 TradingView Strategy** (EMA 9/21 Crossover + RSI + Support/Resistance Confluence)
2. **Historical Data Pipeline & Feature Engineering** (yfinance / MetaTrader 5 + Technical Indicators)
3. **Machine Learning Model Training** (Random Forest / XGBoost next-candle direction predictor)
4. **Live Market Monitor & Automated Telegram Alert Bot** (Real-time 1m polling + High-Confidence >80% alerts)

---

## 🚀 Quick Start Guide

### Step 1: TradingView Setup (Pine Script v5)
1. Open [TradingView](https://www.tradingview.com/) and open the **CADJPY** 1-Minute chart (`1m`).
2. Open the **Pine Editor** tab at the bottom of the screen.
3. Copy and paste the complete code from [`cad_jpy_1m_strategy.pine`](cad_jpy_1m_strategy.pine).
4. Click **Add to Chart**.
5. You will see:
   - 🔹 **Cyan Line**: 9 EMA (Fast)
   - 🔸 **Orange Line**: 21 EMA (Slow)
   - 🟢 **Green Line**: Dynamic Support Level
   - 🔴 **Red Line**: Dynamic Resistance Level
   - ⬆️ **Green Arrows**: BUY Signals (with background highlight)
   - ⬇️ **Red Arrows**: SELL Signals (with background highlight)

---

### Step 2: Historical Data Collection & Feature Engineering
Fetches 1-minute historical OHLCV data for CAD/JPY, calculates RSI(14), EMA(9), EMA(21), MACD, Bollinger Bands, ATR, and exports clean features to CSV.

```bash
# Run with default settings (downloads last 7 days of 1-min CAD/JPY data):
uv run python step2_data_prep.py

# Or with custom options:
uv run python step2_data_prep.py --source yfinance --symbol CADJPY=X --period 7d --output cad_jpy_1m_features.csv
```

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

### Step 4: Live Data & Automated Telegram Alert Bot
Continuously monitors live 1-minute CAD/JPY candle updates every 60 seconds, computes features on the fly, feeds them into the trained `joblib` model, and dispatches an instant Telegram notification when prediction confidence exceeds 80%.

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

## 📁 Project Structure

```
├── cad_jpy_1m_strategy.pine      # Step 1: TradingView Pine Script v5 Strategy
├── step2_data_prep.py            # Step 2: Data Collection & Indicator Calculation
├── step3_train_model.py          # Step 3: ML Model Training (XGBoost / Random Forest)
├── step4_live_telegram_bot.py    # Step 4: Real-Time Live Monitor & Telegram Alert Bot
├── requirements.txt              # Python package dependencies
├── .env.example                  # Telegram & Bot configuration template
└── README.md                     # Documentation & Usage Guide
```

---

## 🇮🇳 தமிழ் விளக்கம் (Tamil Summary)

- **படி 1 (Step 1)**: `cad_jpy_1m_strategy.pine` ஃபைலை TradingView Pine Editor-ல் பேஸ்ட் செய்து Chart-ல் சேர்க்கவும். EMA 9/21 Crossover, RSI 30/70, Support/Resistance ஆகியவற்றின் அடிப்படையில் Buy / Sell அம்புக்குறிகள் காட்டப்படும்.
- **படி 2 (Step 2)**: `step2_data_prep.py` ஸ்கிரிப்ட் CAD/JPY 1-நிமிட டேட்டாவை எடுத்து RSI, EMA, MACD, Bollinger Bands இண்டிகேட்டர்களைக் கணக்கிட்டு `cad_jpy_1m_features.csv` ஃபைலாகச் சேமிக்கும்.
- **படி 3 (Step 3)**: `step3_train_model.py` ஸ்கிரிப்ட் அடுத்த 1-நிமிட கேண்டில் UP அல்லது DOWN ஆகுமா என்பதை கணிக்க AI மாடலை (XGBoost / Random Forest) ட்ரெயின் செய்து `cad_jpy_model.joblib` ஃபைலாகச் சேமிக்கும்.
- **படி 4 (Step 4)**: `step4_live_telegram_bot.py` ஸ்கிரிப்ட் ஒவ்வொரு 60 வினாடிக்கும் லைவ் மார்க்கெட் டேட்டாவை அனலைஸ் செய்து, 80%-க்கும் அதிகமான துல்லியத்தில் (Probability > 80%) சிக்னல் வரும்போது உங்கள் டெலிகிராம் ஆப்பிற்கு தானாக Alert அனுப்பும்.
