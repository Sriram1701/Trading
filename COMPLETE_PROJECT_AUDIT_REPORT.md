# Complete Project Audit Report

**Project:** QX Broker AI Trading Signal Assistant  
**Audit date:** 2026-11-15  
**Scope:** Repository source, documentation, configuration, and available local file inventory. No source code was modified. No live trades, broker access, credential use, or external market-data requests were made.

## Executive summary

This repository contains several independent prototypes, not one integrated QX Broker assistant:

1. A browser dashboard that captures a user-selected screen or camera stream and uses coarse color/pixel heuristics to propose CALL/PUT alerts.
2. A Python CAD/JPY data/feature/model pipeline that can train a Random Forest or XGBoost model, plus a separate Yahoo Finance polling/Telegram script.
3. A TradingView Pine Script strategy.
4. An optional PyAutoGUI screen clicker capable of interacting with a broker page.

There is **no verified QX market-data/API integration**, no evidence that external CAD/JPY data matches a QX instrument (especially OTC), and no 5-minute, 15-minute, or 1-hour confirmation in the dashboard or Python pipeline. The UI’s advertised “90%,” “99%,” and “100%” values are not validated accuracy measures. The browser’s confidence is a hand-set score; the Python model’s predicted probabilities are not calibrated.

The most serious finding is a **direction-mapping defect in the optional clicker path**: the browser sends `CALL`/`PUT`, while the Python clicker recognizes only `UP` as its up-button case. Thus, if the auto-clicker is running, both browser signal types resolve to the Python down button. The clicker also listens on all network interfaces with permissive CORS and no authentication. **Do not run it against a live account.**

The Python data preparation defaults to `auto` and silently substitutes seeded random synthetic bars when real-data retrieval fails. The output does not mark its provenance, so synthetic data can be mistaken for market history and subsequently used for model training.

Safe checks: `node --check` passed for both JavaScript files; Python AST parsing passed for all four Python files. No tests, datasets, trained model artifact, or actual backtest results are present in tracked project files. The virtualenv Python executable was blocked by application-control policy; the system Python has none of the project’s Python dependencies installed. No claim about predictive performance can be made from this audit.

**Overall conclusion:** the UI and prototypes can demonstrate screen capture, heuristic signals, notifications, and model-training code paths, but the current signal engine is not reliable enough for live or demo trading decisions. First disable the clicker and fix direction/data integrity; remove uncalibrated confidence and recovery staking claims before continuing.

---

## 1. Project overview

### What it is

The documentation describes a CAD/JPY 1-minute prediction workflow using TradingView, Python indicators, a classifier, and Telegram alerts ([README.md:1-101](README.md)). A separate browser UI is branded as a “Quotex AI Pro Copilot” and is implemented under `screen_watcher/`.

### Primary objective as implemented

- Visually sample a user-selected screen or camera feed in the browser and emit CALL/PUT alerts based on image-pixel heuristics ([app.js:333-398](screen_watcher/public/app.js), [app.js:452-676](screen_watcher/public/app.js)).
- Separately, prepare 1-minute CAD/JPY features, train a binary next-close-direction classifier, and optionally poll Yahoo Finance for alerts ([step2_data_prep.py:33-281](step2_data_prep.py), [step3_train_model.py:50-235](step3_train_model.py), [step4_live_telegram_bot.py:193-326](step4_live_telegram_bot.py)).
- Separately, show a TradingView strategy with entries, stops, take-profits, and alerts ([cad_jpy_1m_strategy.pine:1-133](cad_jpy_1m_strategy.pine)).
- Optionally automate mouse clicks using a Python HTTP server and PyAutoGUI ([auto_trader.py:53-127](screen_watcher/auto_trader.py)).

These are not wired into a common data, decision, or audit trail. The browser dashboard does not call the Python ML bot or read its model. The static Node server does not run analysis. The Pine strategy is independent of both.

### Feature status at a glance

| Capability | Status | Evidence / limitation |
|---|---|---|
| Static dashboard | Implemented | Node serves static files on port 3000 ([server.js:22-56](screen_watcher/server.js)). |
| User-selected screen/camera capture | Implemented, browser-dependent | Uses `getDisplayMedia`/`getUserMedia`; screen pixels are not sent to a QX API ([app.js:333-398](screen_watcher/public/app.js)). |
| Pixel-based chart heuristics | Implemented experimentally | Uses color counts and fixed screen regions; it does not reconstruct trustworthy OHLC candles ([app.js:452-676](screen_watcher/public/app.js)). |
| Browser UP/DOWN alerts | Implemented experimentally | Scores and thresholds are manually defined in JavaScript ([app.js:780-964](screen_watcher/public/app.js)). |
| Browser chart display | Only a captured video/screen | No market-data chart renderer or asset feed is present. |
| Python indicators and ML training | Implemented as scripts, unexecuted in this audit | Requires external packages and input data; default data path can become synthetic ([step2_data_prep.py:250-281](step2_data_prep.py)). |
| Python live polling and Telegram alert | Implemented separately, unverified | Polls yfinance; no QX feed or browser dashboard connection ([step4_live_telegram_bot.py:193-326](step4_live_telegram_bot.py)). |
| Telegram browser alerts | Implemented, credential handling is unsafe | Token is stored in browser `localStorage` and sent directly to Telegram ([app.js:1514-1595](screen_watcher/public/app.js)). |
| Broker order execution | Experimental and unsafe | Optional PyAutoGUI clicker has direction mismatch, no authentication, and is not an official integration ([app.js:1072-1078](screen_watcher/public/app.js), [auto_trader.py:53-108](screen_watcher/auto_trader.py)). |
| Multi-timeframe confirmation | Not implemented | Dashboard locks to 1-minute and Python features are 1-minute only. |
| Historical binary-options backtest | Not implemented | No payout-aware backtest, trade ledger, or performance report exists. Pine’s chart strategy is not a QX binary-options backtest. |
| SQLite, Streamlit, Plotly, WebSocket feed | Not implemented | Not used in tracked source or declared in [requirements.txt](requirements.txt). |

## 2. Complete file structure and architecture

### Tracked project files

```text
.
|-- .env.example
|-- .gitignore
|-- README.md
|-- cad_jpy_1m_strategy.pine
|-- requirements.txt
|-- step2_data_prep.py
|-- step3_train_model.py
|-- step4_live_telegram_bot.py
`-- screen_watcher
    |-- auto_trader.py
    |-- install_clicker.bat
    |-- run_auto_trader.bat
    |-- server.js
    `-- public
        |-- app.js
        |-- index.html
        `-- styles.css
```

The repository also contains `.venv/`, `.git/`, and `__pycache__/` locally. These are environment, version-control, and generated artifacts—not tracked application source. The project inventory found no tracked CSV dataset, trained `.joblib` model, test suite, `package.json`, database, or browser recording. `.gitignore` excludes the virtual environment, Python caches, `.env`, Node dependencies, and local clicker calibration (`coords.json`) ([.gitignore:1-19](.gitignore)).

| File | Purpose, connections, dependencies, and operational status |
|---|---|
| [README.md](README.md) | Advertises TradingView, Python feature preparation/training, and Telegram. Its commands reference the three Python steps; it does not document the separate screen_watcher dashboard or clicker. Claims “confidence”/“accuracy” thresholds without evaluation evidence ([README.md:1-101](README.md)). |
| [requirements.txt](requirements.txt) | Declares yfinance, pandas, numpy, scikit-learn, xgboost, joblib, requests, and python-dotenv. No test, UI, database, charting, WebSocket, or broker API dependencies ([requirements.txt:1-8](requirements.txt)). |
| [.env.example](.env.example) | Placeholder Telegram token/chat ID, symbol, and threshold. No real secret was found in the tracked project files. Actual secret-bearing `.env` was not present in the tracked file list ([.env.example:1-10](.env.example)). |
| [cad_jpy_1m_strategy.pine](cad_jpy_1m_strategy.pine) | Standalone Pine v5 TradingView strategy using EMA, ADX, RSI, Bollinger Bands, ATR, simulated entries/exits, and alert conditions. No connection to QX is implemented ([cad_jpy_1m_strategy.pine:1-133](cad_jpy_1m_strategy.pine)). |
| [step2_data_prep.py](step2_data_prep.py) | Fetches yfinance or optional MT5 bars, generates synthetic bars, derives indicators/candle geometry, writes CSV. It is the only explicit data-preparation module ([step2_data_prep.py:33-281](step2_data_prep.py)). |
| [step3_train_model.py](step3_train_model.py) | Builds target, numeric features, chronological 80/20 split, scaler, Random Forest/XGBoost (or Gradient Boosting fallback), metrics, and `joblib` bundle ([step3_train_model.py:50-235](step3_train_model.py)). |
| [step4_live_telegram_bot.py](step4_live_telegram_bot.py) | Loads the bundle, polls yfinance 1-minute bars, computes matching features, emits threshold alerts to console/Telegram. It is independent of the dashboard and broker ([step4_live_telegram_bot.py:108-328](step4_live_telegram_bot.py)). |
| [screen_watcher/server.js](screen_watcher/server.js) | Small Node HTTP static-file server on port 3000. No analysis, broker API, authentication, or data feed ([server.js:1-62](screen_watcher/server.js)). |
| [screen_watcher/public/index.html](screen_watcher/public/index.html) | Single dashboard page: stream controls, HUD, diagnostics, confluence panel, payout/recovery calculator, settings, log, and guide modal. Several labels overstate actual analysis ([index.html:1-599](screen_watcher/public/index.html)). |
| [screen_watcher/public/app.js](screen_watcher/public/app.js) | Main browser logic: capture, pixel sampling, heuristic indicators/patterns, score thresholds, notifications, manual outcomes, Telegram, and local clicker request ([app.js:1-1595](screen_watcher/public/app.js)). |
| [screen_watcher/public/styles.css](screen_watcher/public/styles.css) | Dark responsive dashboard presentation, layout, cards, and modal styling. No analytical logic ([styles.css:1-1825](screen_watcher/public/styles.css)). |
| [screen_watcher/auto_trader.py](screen_watcher/auto_trader.py) | Optional unauthenticated HTTP listener and PyAutoGUI automation of configured screen coordinates. Not an approved broker integration ([auto_trader.py:1-129](screen_watcher/auto_trader.py)). |
| [screen_watcher/install_clicker.bat](screen_watcher/install_clicker.bat) | Installs PyAutoGUI through pip. It does not configure a broker integration ([install_clicker.bat:1-19](screen_watcher/install_clicker.bat)). |
| [screen_watcher/run_auto_trader.bat](screen_watcher/run_auto_trader.bat) | Starts `auto_trader.py`; it can initiate screen-click automation if configured ([run_auto_trader.bat:1-7](screen_watcher/run_auto_trader.bat)). |

### Architecture actually present

```text
Browser screen/camera -> HTML video -> Canvas pixel sampling
                                      -> hand-written JS score
                                      -> browser / Telegram alert
                                      -> localhost:3001 clicker (optional)

yfinance or MT5 -> step2 indicators -> CSV -> step3 classifier -> joblib
                                                              |
yfinance polling -> step4 features -> joblib prediction -> Telegram

TradingView chart -> independent Pine strategy / TradingView alerts
```

The first flow is not connected to the second or third. No shared event schema, signal database, evaluation service, verified market feed, or reconciliation between a screen signal and an actual order exists.

## 3. Signal generation engine

### Browser dashboard flow

1. A user starts screen share or a camera. The browser draws each video frame to a canvas every 200 ms ([app.js:333-398](screen_watcher/public/app.js), [app.js:452-476](screen_watcher/public/app.js)).
2. A fixed or user-positioned region of interest (ROI) is sampled. The code counts red and green pixels and tracks some colors/y-coordinates ([app.js:477-552](screen_watcher/public/app.js)).
3. A heuristic RSI number is inferred from pixels in a presumed lower sub-window, otherwise it defaults to 50 or coarse 84/16 values ([app.js:553-570](screen_watcher/public/app.js)).
4. Apparent Bollinger status is inferred from whether active-candle pixels occupy the top/bottom 20% of the ROI, not from actual band lines. “EMA flow” is inferred from detecting yellow pixels and overall green/red pixel ratios ([app.js:590-620](screen_watcher/public/app.js)).
5. Candle labels are based on aggregate pixel ratios and counts. They do not reconstruct individual candle OHLC or compare genuine consecutive candle bodies ([app.js:721-778](screen_watcher/public/app.js)).
6. `evaluatePillars` assigns a hand-authored numeric score, requires at least four of a maximum of five counted pillars and a minimum score of 90, then emits CALL or PUT if directional checks pass ([app.js:780-964](screen_watcher/public/app.js)).
7. Three consecutive 200 ms frames confirm the same candidate. This is roughly 0.4 seconds of repeated screen sampling, not confirmation across three market candles.
8. A signal updates the HUD, notification/toast/audio, in-memory history, and optional Telegram. If its score is at least 95, it POSTs the direction to the local clicker ([app.js:1031-1078](screen_watcher/public/app.js)).

Pseudocode of the implemented logic:

```text
for every captured frame (~5 times/second):
    sample colored pixels in ROI
    estimate RSI and band location from screen geometry
    estimate EMA direction from yellow-pixel presence + green/red candle ratio
    assign CALL/PUT points from:
        trend proxy, unconditional "volatility" points,
        band position, estimated RSI, pattern/green-red ratio
    confidence = clamp(hand-authored points + pillar bonus, 50, 100)
    if noisy-name/OTC-trap check passes
       and score >= max(90, slider)
       and direction wins by score
       and >= 4 counted pillars
       and extra directional condition:
           after 3 repeated frames, alert CALL or PUT once in the minute
    otherwise reset HUD to WAIT
```

### Specific logic defects / gaps

- The “volatility” pillar is always counted and adds 10 points to both directions; it does not calculate volatility ([app.js:806-813](screen_watcher/public/app.js)).
- The counter is `max(callPillars, putPillars)` while the UI says `/6`, but only five score pillars are counted. The sixth “timing” display does not gate signal generation ([app.js:853-864](screen_watcher/public/app.js)); timing only influences a pre-alert ([app.js:857-862](screen_watcher/public/app.js)).
- A doji pattern is returned as `⚖️ Consolidation Doji`, but the noise check compares it to `Consolidation Doji` without the prefix, so that comparison never matches ([app.js:774](screen_watcher/public/app.js), [app.js:883](screen_watcher/public/app.js)).
- Strategy mode is read but never used to choose logic. `sniperModeToggle`, `tradeLockToggle`, and the cooldown are not consulted in the decision path ([app.js:91-100](screen_watcher/public/app.js), [app.js:780-887](screen_watcher/public/app.js)).
- No validation rejects stale, obscured, unrelated, low-resolution, mis-colored, partial, or wrong-instrument screens. No quote, asset name, market timestamp, actual expiry setting, or entry price is read.
- `WAIT` is the fallback when the heuristic score does not pass, but it does not implement the requested data-freshness/integrity checks or risk-based no-trade filters.
- The generated browser `confidence` is an arbitrary weighted score, not a probability.

### Python model flow

`step2_data_prep.py` downloads or fabricates OHLCV bars, calculates features, and writes CSV. `step3_train_model.py` labels each row `UP` only if the next close is strictly higher than the current close; equal closes are treated as `DOWN` ([step3_train_model.py:50-70](step3_train_model.py)). It excludes raw timestamp/OHLCV from model inputs and uses remaining numeric features.

It splits rows chronologically 80/20 and fits `StandardScaler` on the training partition only ([step3_train_model.py:75-103](step3_train_model.py)). It trains XGBoost by default, falls back to Gradient Boosting if XGBoost import fails, or trains Random Forest if selected ([step3_train_model.py:106-143](step3_train_model.py)). The evaluation reports in-sample training and one holdout’s classification metrics, then persists a bundle ([step3_train_model.py:145-201](step3_train_model.py), [step3_train_model.py:204-235](step3_train_model.py)).

The browser does not use this model. The Python bot separately reloads the serialized model, polls yfinance, computes the latest row’s features, and alerts when its raw class probability exceeds a configured threshold ([step4_live_telegram_bot.py:228-326](step4_live_telegram_bot.py)).

### Pine Script flow

The TradingView script computes EMA 9/21/200, ADX, RSI, Bollinger Bands, and ATR; buys/sells on trend + ADX + EMA crossover + RSI + band-touch conditions ([cad_jpy_1m_strategy.pine:42-84](cad_jpy_1m_strategy.pine)). It plots “90%+” labels and simulates long/short entries with ATR stops and reward targets ([cad_jpy_1m_strategy.pine:100-133](cad_jpy_1m_strategy.pine)). It does not enforce a one-minute chart or model fixed-expiry binary payouts.

## 4. AI model audit

| Item | Finding |
|---|---|
| Model architecture | Supervised tabular classifier: XGBoost (default), Random Forest (optional), or GradientBoosting fallback. No neural network or learned computer vision is used. |
| Inputs | Numeric engineered columns except timestamp, OHLCV, and target. Includes EMA/ADX/RSI/MACD/Bollinger/ATR, candle ratios, returns, volume ratio, and cross flags ([step2_data_prep.py:151-249](step2_data_prep.py)). |
| Target | Next 1-minute close direction relative to current close; tie goes to class 0 ([step3_train_model.py:61-65](step3_train_model.py)). |
| Training source | CSV from `step2_data_prep.py`; default `auto` may generate seeded synthetic bars and save them in the same schema with no provenance column ([step2_data_prep.py:252-281](step2_data_prep.py)). |
| Validation/testing | One chronological 80/20 split. No separate tuning/validation partition, rolling/walk-forward test, gap/purge, or independent multi-period test ([step3_train_model.py:75-103](step3_train_model.py)). |
| Horizon | Next candle close, not necessarily a QX 1-minute expiry outcome. |
| Loading | `joblib.load(model_path)`; no model signature/schema/version or provenance verification ([step4_live_telegram_bot.py:228-239](step4_live_telegram_bot.py)). Treat model files as trusted local artifacts; joblib/pickle formats are unsafe for untrusted files. |
| Retraining | Manual CLI invocation only. No automatic retraining, monitoring, model registry, or rollback. |
| Calibration | No calibration method or calibration metrics. `predict_proba` output is displayed as “confidence” and thresholded directly ([step4_live_telegram_bot.py:274-290](step4_live_telegram_bot.py)). |

The Python code is genuinely designed to train a model; this does not prove a model was trained successfully or that it predicts profitably. No trained model or dataset was found in the tracked files. The browser signal engine is not an ML model. Its notification-test button explicitly uses a fixed sample `99` score and “Bullish Rejection Hammer” pattern ([app.js:298-308](screen_watcher/public/app.js)); this is demonstration content, not a market prediction.

No direct future target column is included among the selected features in the visible training code, and scaling is fitted on training data only. I found no direct look-ahead leak in those steps. However, the source may be synthetic; the split is one holdout; train metrics are in-sample; there is no payout/cost-aware evaluation; and the live sample may be an incomplete current candle. Therefore the output does not establish predictive edge.

## 5. Data source audit

### Sources and status

| Source | Used for | Quality / limitations |
|---|---|---|
| Yahoo Finance via `yfinance` | Historical CADJPY feature CSV and separate live polling (`CADJPY=X` by default) | Third-party FX series, not verified QX quotes or OTC prices. May be delayed, rate-limited, unavailable, or have different session/price construction. The code does not test freshness or match the symbol to a QX instrument. |
| MetaTrader 5 optional | Historical M1 bars only | Requires an installed/connected terminal and broker symbol. No proof that the MT5 broker prices match QX. `mt5.initialize()` failure returns `None`; fallback then can become synthetic ([step2_data_prep.py:79-106](step2_data_prep.py)). Not listed in `requirements.txt`. |
| Synthetic generator | Fallback or explicit `--source synthetic` | Seeded random walk / regime values, random wicks and volume, with timestamps based on current time ([step2_data_prep.py:108-149](step2_data_prep.py)). Not market data. |
| Screen/camera pixels | Browser dashboard | User-selected visual input only; no direct price feed, timestamp, asset identity, or OHLC. Image is sampled locally rather than sent to a broker API. |
| TradingView chart | Pine strategy when manually added to TradingView | No code in the repository connects this script to QX data or verifies chart symbol/timeframe. |

### Synthetic fallback paths (important)

- `--source yfinance`: on any exception, logs a warning and substitutes synthetic data ([step2_data_prep.py:262-267](step2_data_prep.py)).
- `--source auto` (the default): on yfinance failure, substitutes synthetic data ([step2_data_prep.py:270-275](step2_data_prep.py)).
- `--source mt5`: if MT5 is missing, initialization fails, or no rates are returned, `raw_df` remains `None`; the common fallback generates synthetic data ([step2_data_prep.py:85-99](step2_data_prep.py), [step2_data_prep.py:277-279](step2_data_prep.py)).
- Explicit `--source synthetic` intentionally generates random sample data ([step2_data_prep.py:268-269](step2_data_prep.py)).

The CSV does not carry a source/provenance flag, synthetic marker, or live/historical distinction. This is a critical data-integrity defect because the standard training path cannot reliably distinguish fabricated rows from market records.

### Time/candle integrity

- The yfinance paths strip timezone metadata from timestamps rather than retaining a normalized UTC timestamp ([step2_data_prep.py:67-69](step2_data_prep.py), [step4_live_telegram_bot.py:216-218](step4_live_telegram_bot.py)).
- No general validation checks ordering, duplicate timestamps, missing minute bars, OHLC invariants, null/NaN/inf values, quote freshness, or market-session gaps before features/model inference.
- The live bot takes `featured_df.iloc[-1]`, despite a comment saying “second-to-last or last,” so the selected latest bar may be incomplete ([step4_live_telegram_bot.py:260-268](step4_live_telegram_bot.py)).
- Polling sleeps for 60 seconds after completing each fetch/inference iteration; this is not synchronized to candle boundaries and can be late by request/runtime duration. The default live feed is not a WebSocket ([step4_live_telegram_bot.py:325-326](step4_live_telegram_bot.py)).
- The historical fetch timeout uses a `ThreadPoolExecutor` context manager around `future.result(timeout=...)`; context-manager shutdown can wait for a still-running worker, so the apparent timeout may not bound total function time ([step2_data_prep.py:35-55](step2_data_prep.py)).

## 6. Signal accuracy audit

| Display/claim | Actual source | Classification |
|---|---|---|
| Pine “BUY 90%+” / “SELL 90%+” | Literal plot and alert strings, not measured performance ([cad_jpy_1m_strategy.pine:100-101](cad_jpy_1m_strategy.pine), [cad_jpy_1m_strategy.pine:132-133](cad_jpy_1m_strategy.pine)) | Unverified claim |
| Dashboard “90–100%,” “99%,” “100% sure” | Static HTML copy/title/guide ([index.html:6-9](screen_watcher/public/index.html), [index.html:167-170](screen_watcher/public/index.html), [index.html:558-559](screen_watcher/public/index.html)) | Unverified claim |
| Dashboard confidence | Hand-authored point additions, clamp, and threshold ([app.js:787-879](screen_watcher/public/app.js)) | Not a calibrated probability |
| Initial win rate | Literal `100%`; `updateWinRate()` returns to 100% when there are no outcomes ([index.html:34](screen_watcher/public/index.html), [app.js:1238-1252](screen_watcher/public/app.js)) | Hardcoded/default display |
| Test notification | Fixed 99 score, pattern, and sample direction ([app.js:298-308](screen_watcher/public/app.js)) | Demonstration only |
| Python alert probability | `predict_proba` from classifier; no calibration or sufficient out-of-sample results ([step4_live_telegram_bot.py:274-290](step4_live_telegram_bot.py)) | Unverified model output, not accuracy |
| Session wins/losses | User-entered manually in memory; no broker settlement link, no persistent record ([app.js:1166-1238](screen_watcher/public/app.js)) | Not independently verified |

The manual outcome UI is also disconnected: `startActiveTradeLifecycle()` is defined, but no call to it exists in the source; `triggerTradeExecution()` creates a history item but does not start the lifecycle. Therefore `activeTrade` remains unset through the normal signal path, and the win/loss buttons return without recording outcomes ([app.js:1031-1083](screen_watcher/public/app.js), [app.js:1166-1199](screen_watcher/public/app.js)). The shown win rate cannot become a reliable measured rate through ordinary signal operation.

There is no outcome ledger, entry-price capture, expiry settlement, payout-aware win/loss, historical outcome join, or immutable record. The clear-history control deletes visible rows and resets the counters ([app.js:1272-1282](screen_watcher/public/app.js)). Consequently no valid accuracy, expected value, drawdown, or asset/session comparison can be reported.

## 7. One-minute trading logic

- **1-minute candles:** The Python pipeline fetches M1 bars. The browser assumes a 60-second cycle using the computer’s local clock, but it does not identify actual market candle boundaries. Pine can be added to any chart timeframe.
- **5m / 15m / 1h confirmation:** Not implemented in the browser, Python features, model, or Pine strategy. The dashboard expiry selector is disabled and only offers 1m ([index.html:94-96](screen_watcher/public/index.html)); the app’s timeframe dictionary has only `1m` ([app.js:137-151](screen_watcher/public/app.js)).
- **Indicator configuration differs from the requested set:** Python and Pine calculate EMA 9/21/200, while the browser UI advertises EMA 9/21/50 and only detects colored pixels. EMA 20 and EMA 50 are not implemented as numerical features in the Python pipeline. Python calculates RSI 14, MACD (12/26/9), Bollinger (20/2), ATR 14, and ADX 14; VWAP and pivot points are absent ([step2_data_prep.py:151-249](step2_data_prep.py), [cad_jpy_1m_strategy.pine:9-56](cad_jpy_1m_strategy.pine), [index.html:270-291](screen_watcher/public/index.html)).
- **Trend/sideways/volatility:** Python computes ADX but the browser’s “volatility” pillar is unconditional. No robust sideways classifier, regime model, spread/liquidity/news filter, or economic calendar is present.
- **Support/resistance, pivots, VWAP:** The browser has a “round number S/R” label but treats band extremes or many gray pixels as “near” a round level ([app.js:624-628](screen_watcher/public/app.js)). Python and Pine do not implement requested pivot/VWAP analysis. Pine’s Bollinger touch is not true support/resistance.
- **Momentum and candle patterns:** Python calculates candle geometry features but does not implement all named patterns. The browser patterns are screen heuristics, not OHLC-based detection. Pine does not use named candlestick patterns.
- **Payout/execution:** Browser UI assumes a payout input but no historical payout schedule or execution price is used in signals. There is no spread/slippage/latency/entry-window evaluation. A one-minute polling loop or screenshot alert can arrive after the intended candle opening.
- **WAIT:** Browser resets to WAIT when heuristic signal filters fail. It does not WAIT on stale/missing/inconsistent market data because there is no market data validation. Python emits no alert below threshold, but does not create an explicit, recorded WAIT analysis.

For short horizons, price direction is noisy and highly sensitive to quote source, incomplete bars, spread, payout, and seconds of execution delay. A one-minute chart pattern alone does not demonstrate positive expected value.

## 8. QX / Quotex integration audit

**Verified integration status: no official QX integration was found.**

- No QX API client, official WebSocket, authenticated quote adapter, supported integration documentation, or QX asset catalogue is present in the repository.
- The browser can capture a user-selected tab/screen or camera using standard browser media APIs. That is a local visual-input prototype, not proof of accurate chart recognition or an official QX data integration ([app.js:333-398](screen_watcher/public/app.js)).
- There is no screenshot-file upload or recording-analysis pipeline. Frames are sampled in memory; no recording is saved or reviewed.
- Asset selection is absent from the dashboard. The independent Python bot has a configurable symbol, defaulting to Yahoo Finance `CADJPY=X`; this does not verify a QX symbol or OTC price match ([step4_live_telegram_bot.py:338-356](step4_live_telegram_bot.py)).
- The expiry option is fixed to 1 minute; no QX expiry is read or confirmed. Notifications do not prove that the broker accepted or executed an order.
- The optional PyAutoGUI code is coordinate-based UI automation, not an API. It should not be used as a substitute for permitted, officially supported integration. The README’s use of the Quotex name does not establish broker compatibility.

The plain HTTP server prints a Wi-Fi/LAN URL ([server.js:56-61](screen_watcher/server.js)); browser screen/camera APIs generally require a secure context except localhost. The mobile-camera workflow may therefore fail when opened over an ordinary HTTP LAN address, depending on browser/platform.

## 9. Frontend and user interface audit

### Dashboard areas

- **Header:** Branding, session win rate, signal count, W/L counts, status badge, local clock, and 1-minute countdown. The UI can say “live” based on capture state, not market-feed status ([index.html:18-61](screen_watcher/public/index.html), [app.js:229-277](screen_watcher/public/app.js)).
- **Capture toolbar:** Screen/camera selector, start/stop, set/reset chart box, expiry, strategy dropdown. Capture and stop work subject to permission; ROI positioning works for moving the box but handles do not implement resizing. Expiry is locked. Strategy options are decorative because the selected strategy is never used in decision logic ([index.html:69-115](screen_watcher/public/index.html), [app.js:333-429](screen_watcher/public/app.js), [app.js:1287-1355](screen_watcher/public/app.js)).
- **Diagnostics:** Shows candle, Bollinger, EMA, and RSI states. These are heuristic detections. In particular, RSI can be marked detected simply because its default estimate is between 25 and 75, even if no RSI pixels are seen ([app.js:1396-1435](screen_watcher/public/app.js)).
- **Video/ROI viewport:** Displays the captured stream. The ROI box is a DOM overlay. The analysis overlay is drawn to `roiCanvas`, but CSS sets `#roiCanvas` and `#processingCanvas` to `display:none`, so the canvas overlays are hidden ([styles.css:512-514](screen_watcher/public/styles.css), [app.js:677-720](screen_watcher/public/app.js)).
- **Signal HUD:** Displays direction, expiry, pattern, and confidence. Confidence is synthetic scoring, not probability. Initial/default WAIT is appropriate visually, but labels such as “100% sure” are misleading ([index.html:220-252](screen_watcher/public/index.html)).
- **Six-pillar panel:** Trend, squeeze, level, RSI, pattern, timing. Timing is not actually a decision pillar and volatility is not measured; score counts only five pillars ([index.html:300-366](screen_watcher/public/index.html), [app.js:794-864](screen_watcher/public/app.js)).
- **Money-management panel:** Shows base bet, payout, and three recovery steps. It explicitly implements Martingale-like bet escalation after losses, contrary to conservative risk management ([index.html:380-415](screen_watcher/public/index.html), [app.js:1438-1512](screen_watcher/public/app.js)).
- **Settings:** Voice/chime, notifications, Telegram, OTC filter, round-number filter, confidence slider, cooldown, sniper mode, and trade lock. Voice/chime/notification, OTC proxy, and pixel-based round-number proxy are used. Sniper/trade-lock toggles do not affect signal generation; cooldown is not checked in the scan loop; strategy selector is unused. Slider only affects a fixed minimum threshold and cannot lower the signal floor below 90 ([app.js:780-887](screen_watcher/public/app.js)).
- **Signal history:** Browser-created in-memory entries, cleared by a control; does not persist across reload or record market prices/outcomes. The manual W/L workflow is unreachable because lifecycle startup is not called ([app.js:1031-1083](screen_watcher/public/app.js), [app.js:1166-1282](screen_watcher/public/app.js)).
- **Notifications:** Browser toast and OS notification, audio and speech, and optional Telegram. The test button intentionally emits a fabricated sample 99% signal. These are notification features, not evidence of signal accuracy ([app.js:285-312](screen_watcher/public/app.js)).
- **Setup guide modal:** Instructional text about adding indicators, not machine-verified setup. It makes an unsupported 99% accuracy claim ([index.html:550-599](screen_watcher/public/index.html)).

### UI integration/security details

Telegram token and chat ID are stored in browser `localStorage`, then included in direct client-side requests to Telegram ([app.js:1514-1565](screen_watcher/public/app.js)). This exposes the token to scripts/extensions with page access and browser-profile access; it is not appropriate for a shared or untrusted deployment. The token must not be placed in screenshots or the audit report.

## 10. Bugs and security issues

| Finding | Evidence | Severity |
|---|---|---|
| CALL/PUT direction contract mismatch: browser sends `CALL`/`PUT`; Python selects UP button only when direction equals `UP`, so either value selects `down_btn` ([app.js:1072-1078](screen_watcher/public/app.js), [auto_trader.py:94-105](screen_watcher/auto_trader.py)). | High / critical for execution |
| Optional auto-trader accepts unauthenticated POSTs, sends wildcard CORS, binds to all interfaces, and clicks screen coordinates ([auto_trader.py:53-62](screen_watcher/auto_trader.py), [auto_trader.py:94-108](screen_watcher/auto_trader.py), [auto_trader.py:127-128](screen_watcher/auto_trader.py)). | Critical |
| Synthetic data silently enters the same CSV/training path as market data ([step2_data_prep.py:262-281](step2_data_prep.py)). | Critical |
| Browser score labels arbitrary points as confidence and clamps to at least 50 and at most 100; strategy display asserts 90/99/100 claims ([app.js:869-879](screen_watcher/public/app.js), [index.html:167-170](screen_watcher/public/index.html)). | High |
| Pixel-based RSI/band/EMA/pattern calculations do not identify actual OHLC or indicator values ([app.js:477-676](screen_watcher/public/app.js), [app.js:721-778](screen_watcher/public/app.js)). | High |
| Signal outcome workflow does not start; win/loss buttons and “AI learning” cannot record normal signal results ([app.js:1031-1083](screen_watcher/public/app.js), [app.js:1166-1209](screen_watcher/public/app.js)). | High |
| Martingale/recovery staking actively recommends increasing exposure after loss; no daily loss cap or account-risk enforcement ([app.js:1438-1508](screen_watcher/public/app.js)). | High |
| Browser Telegram bot token persists in localStorage and is passed in URL path to Telegram API ([app.js:1534-1565](screen_watcher/public/app.js)). | High |
| Static server binds all interfaces and joins request path to public root without an explicit canonical-root containment check ([server.js:22-28](screen_watcher/server.js), [server.js:56](screen_watcher/server.js)). Review/replace with a hardened static server before LAN exposure. | Medium/High |
| `startActiveTradeLifecycle` is not called; trade lock and cooldown controls are ineffective. The `strategyMode`, `sniperModeToggle`, and `tradeLockToggle` are unused in decisions ([app.js:780-887](screen_watcher/public/app.js), [app.js:1031-1083](screen_watcher/public/app.js)). | High |
| Doji “noise” comparison does not match the emoji-prefixed returned label ([app.js:774](screen_watcher/public/app.js), [app.js:883](screen_watcher/public/app.js)). | Medium |
| Live bot uses latest row without closed-candle/freshness verification and only deduplicates alert timestamps ([step4_live_telegram_bot.py:260-326](step4_live_telegram_bot.py)). | High |
| App chart overlays are not visible because both canvas elements are hidden in CSS ([styles.css:440-443](screen_watcher/public/styles.css)). | Medium |
| ROI corner handles have no resize logic; they only prevent the drag handler from starting ([index.html:146-154](screen_watcher/public/index.html), [app.js:1310-1355](screen_watcher/public/app.js)). | Low/Medium |
| Python model artifact loading uses joblib/pickle without validation; do not load untrusted model files ([step4_live_telegram_bot.py:228-239](step4_live_telegram_bot.py)). | Medium |
| No actual committed credentials were found; `.env.example` contains placeholders and `.env` is ignored. Do not commit credentials ([.env.example:1-10](.env.example), [.gitignore:1-8](.gitignore)). | Informational |

No deliberate security test or exploit attempt was performed. These findings are source-level safety observations, not proof of exploitability in a deployed environment.

## 11. Testing and performance

### Existing tests

No unit, integration, browser, model, or backtest test files are tracked. There is no configured test runner or package manifest.

### Safe checks performed

- `node --check screen_watcher/public/app.js`: passed.
- `node --check screen_watcher/server.js`: passed.
- Python `ast.parse` on `step2_data_prep.py`, `step3_train_model.py`, `step4_live_telegram_bot.py`, and `screen_watcher/auto_trader.py`: passed.
- A system Python dependency probe found no numpy, pandas, scikit-learn, xgboost, yfinance, joblib, requests, dotenv, MetaTrader5, or PyAutoGUI installed. The repository virtualenv interpreter was blocked by system application-control policy. Therefore no Python imports, training, data fetch, or model inference were executed.
- No local server, screen capture, Telegram, broker, clicker, live data request, or trading execution was run.

### Performance and validation evidence

No benchmark, browser-run test, dataset-level data validation, measured latency, calibration report, walk-forward result, real historical backtest, or demo outcome report was found. Pine’s `strategy()` can be evaluated inside TradingView’s emulator, but no results are present; its commission/slippage assumptions do not model QX fixed-payout outcomes ([cad_jpy_1m_strategy.pine:2](cad_jpy_1m_strategy.pine)).

The browser does full-frame canvas readback repeatedly and scans a fixed sampling stride. Performance will vary with screen resolution and browser; no profiling or memory/performance test was run. It does not save frames, so there is no evidence trail for reproducing a pixel signal.

## 12. Prioritized complete problem list

| ID | Issue and evidence | Severity | Why it matters | Recommended resolution |
|---|---|---|---|---|
| AUD-01 | Unsafe unauthenticated click service: [auto_trader.py:53-62,94-108,127-128](screen_watcher/auto_trader.py) | Critical | Network callers can trigger real screen actions; no authorization, origin check, bounds, or dry-run guard. | Disable/remove from operational workflow; do not expose it. If future execution is authorized, use official broker APIs and manual confirmation, never coordinate clicking. |
| AUD-02 | Direction mapping sends CALL/PUT to DOWN branch: [app.js:1072-1078](screen_watcher/public/app.js), [auto_trader.py:94-105](screen_watcher/auto_trader.py) | Critical | An UP/CALL alert can click the wrong side. | Remove clicker; if a permitted execution adapter is later built, enforce a typed direction contract and test all directions in a mock. |
| AUD-03 | Unmarked synthetic fallback: [step2_data_prep.py:108-149,260-281](step2_data_prep.py) | Critical | Fake random candles can be mistaken for genuine price history and train an apparently valid model. | Fail closed on missing real data; explicitly tag source/provenance; prohibit synthetic input in training/backtests. |
| AUD-04 | Unsupported numeric accuracy and confidence claims: [app.js:869-879](screen_watcher/public/app.js), [index.html:34,167-170,558-559](screen_watcher/public/index.html), [cad_jpy_1m_strategy.pine:100-133](cad_jpy_1m_strategy.pine) | High | Misleads users about probability and risk. | Remove percentages until calibrated on adequate untouched out-of-sample data; display evidence and sample size. |
| AUD-05 | Pixel geometry is not market/indicator data: [app.js:452-778](screen_watcher/public/app.js) | High | False patterns and indicator states can produce wrong signals. | Base analysis on timestamped OHLC from a permitted feed; keep image recognition as optional, explicitly uncertain input. |
| AUD-06 | Outcome lifecycle disconnected: [app.js:1031-1083,1166-1282](screen_watcher/public/app.js) | High | Win rate, history outcomes, adaptive changes, and lock do not work as claimed. | Implement an immutable signal/outcome ledger and verify settlement source; remove adaptive tuning until validated. |
| AUD-07 | Martingale/recovery staking: [app.js:1438-1508](screen_watcher/public/app.js) | High | Escalates loss exposure and conflicts with capital protection. | Remove recovery steps; add fixed fractional exposure limits, daily stop, consecutive-loss stop, and explicit WAIT. |
| AUD-08 | Telegram token stored in browser: [app.js:1534-1565](screen_watcher/public/app.js) | High | Token theft can allow unauthorized bot use. | Keep tokens server-side in environment/secret storage; never render or persist them client-side. |
| AUD-09 | QX data/asset/expiry not identified; yfinance not broker matched: [step4_live_telegram_bot.py:193-226](step4_live_telegram_bot.py), [index.html:72-115](screen_watcher/public/index.html) | High | External price and binary payout may differ from QX/OTC. | Verify an official permitted feed and instrument mapping before any signal development. |
| AUD-10 | Latest candle may be incomplete/stale; no candle validation: [step4_live_telegram_bot.py:193-218,260-326](step4_live_telegram_bot.py) | High | A delayed or changing bar can invalidate the feature vector and entry timing. | Require closed bars, freshness bounds, monotonic timestamps, gap checks, and explicit WAIT on failure. |
| AUD-11 | No multi-timeframe analysis: [app.js:137-151](screen_watcher/public/app.js), [step2_data_prep.py:151-249](step2_data_prep.py) | High | Requested 5m/15m/1h context is absent. | Add synchronized, completed higher-timeframe bars only after the data adapter is verified. |
| AUD-12 | One holdout and uncalibrated probabilities: [step3_train_model.py:75-103,145-201](step3_train_model.py), [step4_live_telegram_bot.py:274-290](step4_live_telegram_bot.py) | High | Does not demonstrate robust expected value or trustworthy confidence. | Use chronological walk-forward/out-of-sample testing, payout-aware outcomes, calibration, baselines, costs, and confidence intervals. |
| AUD-13 | Static HTTP app/clicker listening on all interfaces: [server.js:56](screen_watcher/server.js), [auto_trader.py:127-128](screen_watcher/auto_trader.py) | High | LAN exposure expands access to UI and action surface; no secure deployment configuration. | Bind localhost by default; remove order endpoint; use HTTPS/authentication for any future service. |
| AUD-14 | Browser controls misrepresent/ignore behavior: [app.js:780-887](screen_watcher/public/app.js) | Medium | Strategy, trade lock, sniper, cooldown, and timing panel can imply safeguards that are not active. | Remove unused controls or implement and test the behavior; accurately label each status. |
| AUD-15 | Doji filter string mismatch: [app.js:774,883](screen_watcher/public/app.js) | Medium | Intended noisy-market rejection is bypassed for the returned doji label. | Use enum pattern types rather than display strings; add tests. |
| AUD-16 | Python data validation and timezone handling missing: [step2_data_prep.py:33-106](step2_data_prep.py), [step4_live_telegram_bot.py:193-226](step4_live_telegram_bot.py) | Medium | Corrupt, duplicate, or ambiguously timed candles can contaminate indicators. | Validate schemas, OHLC consistency, UTC timestamps, gaps, nulls, and freshness. |
| AUD-17 | No tests/datasets/model artifact in tracked tree; missing installed dependencies under system Python: [requirements.txt:1-8](requirements.txt) | Medium | Cannot reproduce or verify claims from the checked-in project. | Pin environment and add deterministic unit, integration, data-contract, and backtest tests. |
| AUD-18 | Disabled canvas overlays and non-resizable ROI handles: [styles.css:512-514](screen_watcher/public/styles.css), [app.js:1310-1355](screen_watcher/public/app.js) | Low/Medium | Diagnostics may be hard to inspect and ROI workflow differs from labels. | Fix only after core data/signal design; add UI tests. |
| AUD-19 | Pine `useAtrSl` input is declared but not consulted; ATR exits are still calculated and applied unconditionally ([cad_jpy_1m_strategy.pine:33-36,115-127](cad_jpy_1m_strategy.pine)). | Low/Medium | The UI control does not alter strategy behavior as its label implies. | Remove the unused input or make its effect explicit and test both settings. |

## 13. Recommended development architecture

Do not begin with image recognition or auto-execution. Build a fail-closed, research-first system:

```text
Permitted source adapter
    -> timestamped normalized OHLCV + provenance + freshness/data-quality checks
    -> canonical candle store (SQLite for local research; UTC, source, instrument)
    -> indicator and completed-timeframe feature service
    -> explicit UP / DOWN / WAIT rules (WAIT default)
    -> signal record (inputs, reasons, source, analysis time, evaluation horizon)
    -> backtest/evaluation service (chronological, payout/cost-aware)
    -> Streamlit dashboard + Plotly visualization
```

### Technology proposal

- **Python, Pandas, NumPy:** data contracts, indicator calculations, rule engine, and reproducible research. Keep calculation functions pure and unit-testable.
- **Indicators:** implement or use a maintained library only after verifying formulas against fixtures. Include EMA 9/20/50, RSI, MACD, Bollinger, ATR, ADX, VWAP only where meaningful, support/resistance and pivots. Avoid treating correlated indicators as independent confirmations.
- **Data source:** first establish an official, permitted market-data integration and exact instrument equivalence. If QX does not expose a permitted feed, show “unavailable / WAIT”; do not substitute Yahoo spot FX for OTC prices.
- **SQLite:** store immutable raw bars, metadata/provenance, analyses, signals, and outcomes. Never overwrite actual outcomes; corrections should be append-only and traceable.
- **Streamlit + Plotly:** responsive research dashboard for chart, asset selector, timeframes, data freshness, indicator values, WAIT reason, and audit history. Remove client-held broker or Telegram secrets.
- **Backtesting:** event-driven chronological simulation using only completed bars; next-bar execution timing; expiry settlement; actual payout/return schedule, costs, ties, stale-data/no-trade cases; asset/session slices; drawdown and consecutive losses; walk-forward holdout kept untouched until final evaluation.
- **ML (optional, later):** establish a baseline and out-of-sample edge first. Only show probability after calibration, sufficiently large independent sample, and ongoing drift checks. Never use confidence thresholds as a substitute for a calibrated model.
- **Risk guard:** demo-only initially, fixed small exposure, daily loss and consecutive-loss limits, no Martingale, no automatic order execution, and a hard WAIT path for any data-quality failure or insufficient evidence.
- **Image recognition:** keep optional and separate. Require OCR/geometry validation against known chart layouts, measure uncertainty, and never let a pixel-only estimate override missing or conflicting price data.

## 14. Final project status

1. **Completed:** Static browser dashboard; basic screen/camera stream capture; experimental pixel heuristics; browser/Telegram notifications; Python feature-generation, model-training, and yfinance polling scripts; standalone Pine strategy; optional clicker code.
2. **Partially completed:** Indicator calculations and classifier training are coded, but no real dataset/model/training run or quality evidence is present. Browser signal history UI is present but outcome recording is disconnected.
3. **Not implemented:** Official QX data integration, verified asset mapping, multi-timeframe analysis, robust candle construction from broker data, payout-aware backtest, calibrated confidence, SQLite persistence, signal/outcome evaluation, requested risk controls, and a reliable market-data dashboard.
4. **Broken or unsafe:** Direction mismatch in the clicker path; unprotected auto-click service; unmarked synthetic fallback; fabricated confidence; Martingale recommendations; disconnected outcome lifecycle; hidden canvas analysis overlays; unused settings.
5. **Simulated/unverified:** Synthetic OHLCV and volume; screen-derived RSI/Bollinger/EMA/pattern indications; “90%/99%/100%” claims; test notification signal; assumed 93% payout.
6. **Genuinely functional at code level:** Static page serving; browser API capture request; pixel processing; heuristic score and notifications; Python functions/scripts designed to fetch/process/train/predict; TradingView script syntax/logic as standalone. Actual runtime behavior beyond static checks was not tested due unavailable Python dependencies and browser/broker context.
7. **Can the current application be trusted?** No, not for trading decisions or accuracy claims.
8. **Suitable for demo testing?** Only for non-trading UI/software demonstrations after disabling the clicker and ignoring signal/confidence and money-management advice. It is not a validated signal engine for demo performance conclusions.
9. **Fix first:** Disable/remove click automation, correct the feed/provenance path and fail closed, remove fake scores and Martingale, then build closed-bar data validation and reproducible payout-aware backtesting before reconsidering signals.

No screenshots, recordings, or QX integration documentation were provided during this audit. Therefore actual QX UI restrictions, supported assets, chart options, and integration permission remain unverified.

## 15. Development roadmap

| Phase | Required files / changes | Dependencies | Expected outcome | Acceptance criteria |
|---|---|---|---|---|
| 1. Fix data integrity | `step2_data_prep.py`, `step4_live_telegram_bot.py`; remove implicit synthetic fallback from production path; source metadata; UTC and strict validators | Confirmed permitted data source; pandas/numpy | Real, traceable candles or explicit unavailable state | Failed, stale, synthetic, duplicate, malformed, or incomplete data yields an error/WAIT; provenance persists per row. |
| 2. Remove misleading accuracy displays | `index.html`, `app.js`, `cad_jpy_1m_strategy.pine`, `README.md` | None | UI/docs state what is measured and unmeasured | No uncalibrated “90/99/100%” claim; no 100% empty-sample default; tests cover zero-outcome display. |
| 3. Fix signal generation | Extract browser/Python rules to testable Python module; remove coordinate clicker workflow; explicit `UP`, `DOWN`, `WAIT` | Valid OHLC feed, pytest | Deterministic, reviewable conservative decision logic | Unit tests demonstrate all three outputs; missing/inconsistent data always WAIT; no unsupported confidence. |
| 4. Implement multi-timeframe analysis | New aggregation/features module; dashboard status/selection | UTC 1m bars with verified closed times | Completed 1m entry plus 5m/15m/1h context | Candle aggregation has alignment fixtures; current/incomplete HTF candle is not treated as closed. |
| 5. Implement proper backtesting | New backtest module/CLI; per-asset/session result tables | Historical source and documented payout schedule | Chronological binary-expiry outcomes | No future data; costs/payout/ties/expiry modeled; trade counts, EV, drawdown, streaks and baseline tested. |
| 6. Validate out of sample | Training/evaluation module and report output | Enough independent history per instrument | Evidence-based performance estimate and calibrated probabilities, if justified | Walk-forward folds, untouched holdout, class/baseline comparisons, calibration, confidence intervals; no tuning on final test. |
| 7. Permitted live monitoring | Data adapter, background collector, freshness status; keep broker orders disabled | Official/authorized API or licensed feed | Reliable quotes and dashboard updates | Source/asset match documented; timestamps/freshness checked; disconnect switches engine to WAIT and logs reason. |
| 8. Build WAIT-based engine | Shared rules module and dashboard | Valid data and tested features | Explainable UP/DOWN/WAIT with reasons and risk warnings | WAIT on insufficient evidence, conflicting timeframes, volatility extremes, nearby barriers, stale data, and outside session rules. |
| 9. Extensive demo testing | Test suite, SQLite ledger, Streamlit/Plotly dashboard, demo protocol | All prior phases; no live credentials | Reproducible demo evaluation and immutable signal/outcome records | Pre-registered criteria; every signal records price/time/source/horizon/reasons/outcome; no Martingale; stop rules demonstrated; results do not imply future returns. |

**No phase should add automatic broker execution.** If the official platform explicitly permits integration in the future, it should be separately reviewed and require user-controlled confirmation and strict risk limits.

---

## Plain-language final answer

**What exactly have we built so far?** A collection of prototypes: a screen-watching dashboard with pixel-based CALL/PUT scoring, a separate Python CAD/JPY ML workflow, a separate TradingView strategy, and an optional mouse-click automation tool.

**How does it work and generate signals?** The dashboard samples screen colors and estimates indicator/pattern states from pixel positions, adds hand-written points, and triggers an alert after repeated frames if a score crosses a fixed threshold. The Python pipeline instead calculates indicators from Yahoo/MT5/synthetic OHLCV, trains a next-candle classifier, and separately sends Telegram alerts from Yahoo polling. These engines are disconnected.

**What must be fixed before further development?** Disable the clicker; fix the direction mismatch; prevent synthetic data from being treated as real; verify a permitted QX-matching data source; remove unsupported accuracy/confidence claims and Martingale; and create validated closed-candle data, an immutable outcome ledger, and payout-aware chronological backtests. Until then, the signal engine is not suitable for trading use.
