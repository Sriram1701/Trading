'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const observerApi = require('../public/chart_observer.js');
const extractorApi = require('../public/local_chart_extractor.js');
const engineApi = require('../public/local_technical_engine.js');
const validatorApi = require('../public/final_signal_validator.js');
const monitorApi = require('../public/live_screen_monitor.js');

/**
 * Creates a synthetic full Quotex browser tab frame matching real Quotex UI geometry:
 * - Top header (y: 0 - 7%): Asset tabs, balance, green Deposit button
 * - Left toolbar (x: 0 - 5%): Navigation icons
 * - Right trade panel (x: 85% - 100%): Amount, Timer, Green UP button, Red DOWN button
 * - Bottom oscillator panel (y: 80% - 100%): RSI 14 curve
 * - Central chart area (x: 6% - 84%, y: 7% - 78%): Dark theme canvas with real candlesticks & wicks
 */
function createQuotexTabFrame(width = 640, height = 360, options = {}) {
    const data = new Uint8ClampedArray(width * height * 4);
    // Quotex dark background: #0c1017 (r: 12, g: 16, b: 23)
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 12;
        data[i + 1] = 16;
        data[i + 2] = 23;
        data[i + 3] = 255;
    }

    // 1. TOP HEADER (y: 0 - 24): includes green Deposit button at x: 550-620
    const depositStartX = Math.floor(width * 0.86);
    const depositEndX = Math.floor(width * 0.98);
    const headerHeight = Math.floor(height * 0.06);
    for (let y = 4; y < headerHeight - 2; y += 1) {
        for (let x = depositStartX; x < depositEndX; x += 1) {
            const off = (y * width + x) * 4;
            data[off] = 0;       // r
            data[off + 1] = 190; // bright green Deposit button
            data[off + 2] = 110; // b
        }
    }

    // 2. RIGHT TRADE EXECUTION PANEL (x: 85% - 100%):
    // Green UP button (y: 45% - 55%) and Red DOWN button (y: 60% - 70%)
    const upBtnTop = Math.floor(height * 0.45);
    const upBtnBot = Math.floor(height * 0.55);
    const downBtnTop = Math.floor(height * 0.60);
    const downBtnBot = Math.floor(height * 0.70);
    const panelLeft = Math.floor(width * 0.86);
    const panelRight = Math.floor(width * 0.98);

    for (let y = upBtnTop; y < upBtnBot; y += 1) {
        for (let x = panelLeft; x < panelRight; x += 1) {
            const off = (y * width + x) * 4;
            data[off] = 0;
            data[off + 1] = 185; // Green UP button
            data[off + 2] = 100;
        }
    }
    for (let y = downBtnTop; y < downBtnBot; y += 1) {
        for (let x = panelLeft; x < panelRight; x += 1) {
            const off = (y * width + x) * 4;
            data[off] = 230; // Red DOWN button
            data[off + 1] = 45;
            data[off + 2] = 55;
        }
    }

    // 3. BOTTOM OSCILLATOR PANEL (y: 80% - 95%):
    // RSI curve in cyan/purple
    const oscTop = Math.floor(height * 0.82);
    const oscBot = Math.floor(height * 0.94);
    for (let x = Math.floor(width * 0.08); x < Math.floor(width * 0.82); x += 2) {
        const curveY = Math.floor(oscTop + (oscBot - oscTop) * 0.6 + Math.sin(x / 20) * 10);
        for (let dy = -1; dy <= 1; dy += 1) {
            const y = curveY + dy;
            if (y >= oscTop && y < oscBot) {
                const off = (y * width + x) * 4;
                data[off] = 180;     // purple/cyan oscillator line
                data[off + 1] = 140;
                data[off + 2] = 240;
            }
        }
    }

    // 4. CENTRAL CANDLESTICK CHART AREA:
    // Draw 6 distinct candlesticks with real bodies and wicks
    // Candle layout: columns in [x: 80, 130, 180, 230, 280, 330]
    const candleConfigs = options.candles || [
        { cx: 80,  wickTop: 60,  bodyTop: 80,  bodyBot: 140, wickBot: 160, isGreen: true },
        { cx: 130, wickTop: 70,  bodyTop: 90,  bodyBot: 150, wickBot: 170, isGreen: false },
        { cx: 180, wickTop: 65,  bodyTop: 75,  bodyBot: 135, wickBot: 155, isGreen: true },
        { cx: 230, wickTop: 50,  bodyTop: 60,  bodyBot: 120, wickBot: 140, isGreen: true },
        { cx: 280, wickTop: 55,  bodyTop: 70,  bodyBot: 130, wickBot: 150, isGreen: false },
        { cx: 330, wickTop: 45,  bodyTop: 55,  bodyBot: 110, wickBot: 130, isGreen: true }
    ];

    candleConfigs.forEach(c => {
        const rVal = c.isGreen ? 18 : 235;
        const gVal = c.isGreen ? 195 : 45;
        const bVal = c.isGreen ? 95 : 55;

        // Draw upper & lower wicks (1-2 px wide)
        for (let y = c.wickTop; y <= c.wickBot; y += 1) {
            for (let dx = -1; dx <= 0; dx += 1) {
                const off = (y * width + (c.cx + dx)) * 4;
                data[off] = rVal;
                data[off + 1] = gVal;
                data[off + 2] = bVal;
            }
        }
        // Draw solid candle body (6 px wide)
        for (let y = c.bodyTop; y <= c.bodyBot; y += 1) {
            for (let dx = -3; dx <= 2; dx += 1) {
                const off = (y * width + (c.cx + dx)) * 4;
                data[off] = rVal;
                data[off + 1] = gVal;
                data[off + 2] = bVal;
            }
        }
    });

    // 5. Active current price line / beacon at rightmost candle
    if (options.priceLineY) {
        const py = options.priceLineY;
        const plStartX = Math.floor(width * 0.50);
        const plEndX = Math.floor(width * 0.83);
        for (let x = plStartX; x < plEndX; x += 1) {
            const off = (py * width + x) * 4;
            data[off] = 255;
            data[off + 1] = 255;
            data[off + 2] = 120; // yellow price line
        }
    }

    return { width, height, data };
}

test('QuotexRecognition: Central chart region is isolated from header and sidebars', () => {
    const observer = observerApi.createObserver();
    const frame = createQuotexTabFrame(640, 360);

    const observation = observer.observe(frame, 1000);

    assert.equal(observation.chartVisibleCandidate, true);
    assert.ok(observation.chartRegionCandidate !== null);
    // Chart area width must cover central area (~75-80%), NOT 0%
    assert.ok(observation.chartRegionCandidate.width >= 0.50);
    assert.ok(observation.chartRegionCandidate.height >= 0.40);
    // Visual quality on dark Quotex chart with 6 clear candles must be GOOD or MODERATE
    assert.notEqual(observation.visualQuality, 'UNCLEAR');
});

test('QuotexRecognition: Candle bodies and wicks are extracted with accurate visual geometry', () => {
    const extractor = extractorApi.createExtractor();
    const frame = createQuotexTabFrame(640, 360);

    const extracted = extractor.extract(frame, 1000);

    assert.equal(extracted.isValid, true);
    assert.equal(extracted.isReadable, true);
    assert.equal(extracted.dataQuality, 'VISUAL_ESTIMATE');
    // Must find all 6 candles inside central area without counting Deposit/Trade buttons
    assert.equal(extracted.candlesCount, 6);

    // Forming candle must have measured body and wicks
    assert.ok(extracted.formingCandle);
    assert.equal(extracted.formingCandle.polarity, 'BULLISH');
    assert.ok(extracted.formingCandle.body);
    assert.ok(extracted.formingCandle.body.height > 10);
    assert.ok(extracted.formingCandle.wicks);
    assert.ok(extracted.formingCandle.wicks.upper >= 0);
    assert.ok(extracted.formingCandle.wicks.lower >= 0);

    // Completed candle must have measured body and wicks
    assert.ok(extracted.lastCompletedCandle);
    assert.equal(extracted.lastCompletedCandle.polarity, 'BEARISH');
    assert.ok(extracted.lastCompletedCandle.body.height > 10);
});

test('QuotexRecognition: Price line movement registers as frame change and resets unchanged timer', () => {
    const observer = observerApi.createObserver();
    // Frame at t=1000 with price line at y=90
    const frame1 = createQuotexTabFrame(640, 360, { priceLineY: 90 });
    observer.observe(frame1, 1000);

    // Frame at t=5000 with price line moved to y=88 (2px price tick)
    const frame2 = createQuotexTabFrame(640, 360, { priceLineY: 88 });
    const obs2 = observer.observe(frame2, 5000);

    // Must register difference and NOT trigger frozen frame
    assert.ok(obs2.frameDifference > 0);
    assert.equal(obs2.unchangedForMs, 0);
});

test('QuotexRecognition: UI buttons outside chart are strictly excluded from candle count', () => {
    const extractor = extractorApi.createExtractor();

    // Create frame with ONLY header and trade panel buttons, but zero candlesticks in central area
    const frameNoCandles = createQuotexTabFrame(640, 360, { candles: [] });
    const extracted = extractor.extract(frameNoCandles, 1000);

    // Must report insufficient data rather than treating UP/DOWN buttons as giant candles
    assert.equal(extracted.isReadable, false);
    assert.equal(extracted.dataQuality, 'INSUFFICIENT_DATA');
    assert.match(extracted.reason, /No clear candlestick patterns/);
});

test('QuotexRecognition: LiveScreenMonitor describes chart coverage without 0%, 0% contradiction', async () => {
    const frame = createQuotexTabFrame(640, 360);
    let capturedNotes = '';

    const fakeElements = {
        observationStatus: { set textContent(val) { capturedNotes = val; }, get textContent() { return capturedNotes; } },
        monitoringStatus: { textContent: '' },
        signalDirection: { textContent: '', dataset: {} },
        signalStatus: { textContent: '' },
        indicatorObservations: { replaceChildren() {} },
        analysisUncertainties: { textContent: '' },
        signalTimestamp: { textContent: '' },
        analysisStartTime: { textContent: '' },
        analysisCompleteTime: { textContent: '' },
        inferenceLatency: { textContent: '' },
        frameFreshness: { textContent: '' },
        aiProcessingStatus: { textContent: '' }
    };

    const track = { readyState: 'live', muted: false, addEventListener() {}, stop() {} };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
    const video = { readyState: 2, videoWidth: 640, videoHeight: 360, srcObject: null, play: async () => {}, pause: () => {} };
    const preview = { hidden: true };

    const observer = observerApi.createObserver();
    const extractor = extractorApi.createExtractor();
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();

    const monitor = monitorApi.createMonitor({
        mediaDevices: { async getDisplayMedia() { return stream; } },
        video,
        preview,
        elements: fakeElements,
        captureFrame: () => frame,
        observeFrame: (f, t) => observer.observe(f, t),
        resetObserver() {},
        clearFrameCanvas() {},
        localChartExtractor: extractor,
        localTechnicalEngine: engine,
        finalSignalValidator: validator
    });

    await monitor.connect();
    monitor.startMonitoring();

    // The observation status must NOT say "0%, 0% of frame"
    assert.doesNotMatch(capturedNotes, /0%, 0% of frame/);
    assert.match(capturedNotes, /Chart area approx \d+%×\d+/);
    assert.doesNotMatch(capturedNotes, /Possible frozen frame/);

    monitor.stopMonitoring();
});
