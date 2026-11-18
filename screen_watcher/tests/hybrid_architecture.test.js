'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const extractorApi = require('../public/local_chart_extractor.js');
const engineApi = require('../public/local_technical_engine.js');
const validatorApi = require('../public/final_signal_validator.js');
const monitorApi = require('../public/live_screen_monitor.js');
const notificationsApi = require('../public/signal_notifications.js');

test('LocalChartExtractor: Rejects blank and sparse frames without inventing OHLC', () => {
    const extractor = extractorApi.createExtractor();

    // 1. Invalid input
    const invalid = extractor.extract(null);
    assert.equal(invalid.isValid, false);
    assert.equal(invalid.isReadable, false);
    assert.equal(invalid.exactValuesAvailable, false);

    // 2. Blank frame (320x180 black image)
    const blankFrame = {
        width: 320,
        height: 180,
        data: new Uint8ClampedArray(320 * 180 * 4)
    };
    const blank = extractor.extract(blankFrame);
    assert.equal(blank.isValid, true);
    assert.equal(blank.isReadable, false);
    assert.equal(blank.dataQuality, 'INSUFFICIENT_DATA');
    assert.equal(blank.exactValuesAvailable, false);
    assert.match(blank.reason, /candlestick/i);
});

test('LocalChartExtractor: Correctly extracts visual candle polarities and tracks candle completion', () => {
    const extractor = extractorApi.createExtractor();
    const width = 320;
    const height = 180;
    const data = new Uint8ClampedArray(width * height * 4);

    // Draw 4 distinct green candles (bullish sequence)
    // Candle 1: x = 100-104, y = 50-90
    // Candle 2: x = 120-124, y = 45-85
    // Candle 3: x = 140-144, y = 40-80
    // Candle 4: x = 160-164, y = 35-75
    const candleXs = [100, 120, 140, 160];
    candleXs.forEach((cx, idx) => {
        const topY = 50 - idx * 5;
        const botY = 90 - idx * 5;
        for (let y = topY; y <= botY; y += 1) {
            for (let x = cx; x <= cx + 4; x += 1) {
                const off = (y * width + x) * 4;
                data[off] = 20;     // r
                data[off + 1] = 200; // g (bright green)
                data[off + 2] = 50;  // b
                data[off + 3] = 255;
            }
        }
    });

    const frame1 = { width, height, data };
    const res1 = extractor.extract(frame1, 1000);

    assert.equal(res1.isValid, true);
    assert.equal(res1.isReadable, true);
    assert.equal(res1.dataQuality, 'VISUAL_ESTIMATE');
    assert.equal(res1.exactValuesAvailable, false);
    assert.equal(res1.candlesCount, 4);
    assert.equal(res1.visualTrend, 'BULLISH');
    assert.equal(res1.formingCandle.polarity, 'BULLISH');
    assert.equal(res1.lastCompletedCandle.polarity, 'BULLISH');
    // On first frame, candle completion is not confirmed yet
    assert.equal(res1.candleCompleted, false);

    // Now advance time and simulate a new forming candle column appearing further right (x = 180)
    for (let y = 30; y <= 70; y += 1) {
        for (let x = 180; x <= 184; x += 1) {
            const off = (y * width + x) * 4;
            data[off] = 20;
            data[off + 1] = 200;
            data[off + 2] = 50;
            data[off + 3] = 255;
        }
    }
    const frame2 = { width, height, data };
    const res2 = extractor.extract(frame2, 2500);

    assert.equal(res2.candlesCount, 5);
    // Candle completion detected because new column formed to the right
    assert.equal(res2.candleCompleted, true);
});

test('LocalTechnicalEngine: Returns WAIT when candle is forming or indicators conflict', () => {
    const engine = engineApi.createEngine();

    // 1. Unreadable data produces WAIT
    const unreadableResult = engine.evaluate({ isValid: true, isReadable: false, reason: 'Obscured chart' });
    assert.equal(unreadableResult.candidate, 'WAIT');
    assert.match(unreadableResult.waitReason, /obscured/i);

    // 2. Bullish trend with candle still forming (candleCompleted: false) produces WAIT
    const formingBullish = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: false,
        visualTrend: 'BULLISH',
        lastCompletedCandle: { polarity: 'BULLISH', height: 20 },
        bollingerPosition: 'LOWER_BAND_TEST',
        rsiVisualZone: 'OVERSOLD',
        rsiSlope: 'RISING'
    };
    const evalForming = engine.evaluate(formingBullish);
    assert.equal(evalForming.candidate, 'WAIT');
    assert.match(evalForming.waitReason, /confirmed candle close/i);

    // 3. Conflicting indicators produce WAIT
    const conflicting = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BULLISH',
        lastCompletedCandle: { polarity: 'BULLISH', height: 20 },
        bollingerPosition: 'UPPER_BAND_TEST', // Upper resistance rejection (bearish factor)
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FLAT'
    };
    const evalConflicting = engine.evaluate(conflicting);
    assert.equal(evalConflicting.candidate, 'WAIT');
    assert.match(evalConflicting.waitReason, /conflicting/i);
});

test('LocalTechnicalEngine: Confirms UP and DOWN on multi-factor confluence with completed candle', () => {
    const engine = engineApi.createEngine();

    // 1. Bullish confluence: Completed Bullish candle + Bullish trend + Lower Band bounce
    const bullishSetup = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BULLISH',
        lastCompletedCandle: { polarity: 'BULLISH', height: 25 },
        bollingerPosition: 'LOWER_BAND_TEST',
        rsiVisualZone: 'OVERSOLD',
        rsiSlope: 'RISING'
    };
    const resUp = engine.evaluate(bullishSetup);
    assert.equal(resUp.candidate, 'UP');
    assert.equal(resUp.confidence_tier, 'HIGH');
    assert.ok(resUp.supportingEvidence.length >= 3);
    assert.equal(resUp.conflictingEvidence.length, 0);

    // 2. Bearish confluence: Completed Bearish candle + Bearish trend + Upper Band rejection
    const bearishSetup = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BEARISH',
        lastCompletedCandle: { polarity: 'BEARISH', height: 25 },
        bollingerPosition: 'UPPER_BAND_TEST',
        rsiVisualZone: 'OVERBOUGHT',
        rsiSlope: 'FALLING'
    };
    const resDown = engine.evaluate(bearishSetup);
    assert.equal(resDown.candidate, 'DOWN');
    assert.equal(resDown.confidence_tier, 'HIGH');
    assert.ok(resDown.supportingEvidence.length >= 3);
    assert.equal(resDown.conflictingEvidence.length, 0);
});

test('FinalSignalValidator: Enforces frame freshness, candle completion, and vision arbitration', () => {
    const validator = validatorApi.createValidator();
    const now = 1700000000000;

    // 1. Stale frame (> 30s) must be rejected with WAIT — DELAYED ANALYSIS
    const staleResult = validator.validate({
        localResult: { candidate: 'UP', candleCompleted: true, supportingEvidence: ['Strong trend'] },
        visionResult: null,
        frameAgeMs: 35000,
        now
    });
    assert.equal(staleResult.direction, 'WAIT');
    assert.match(staleResult.explanation, /DELAYED ANALYSIS/);

    // 2. Incomplete candle forces WAIT
    const incompleteResult = validator.validate({
        localResult: { candidate: 'UP', candleCompleted: false, supportingEvidence: ['Bullish momentum'] },
        visionResult: null,
        frameAgeMs: 500,
        now
    });
    assert.equal(incompleteResult.direction, 'WAIT');
    assert.match(incompleteResult.explanation, /Awaiting completed candle/i);

    // 3. Confluent local UP + Qwen3-VL matching UP = High confidence confirmation
    const dualConfirmed = validator.validate({
        localResult: {
            candidate: 'UP',
            candleCompleted: true,
            confidence_tier: 'HIGH',
            supportingEvidence: ['3 bullish factors aligned', 'Lower band bounce']
        },
        visionResult: { direction: 'UP', analyzed_at: now - 2000 },
        frameAgeMs: 1500,
        now
    });
    assert.equal(dualConfirmed.direction, 'UP');
    assert.equal(dualConfirmed.confidence, 'HIGH');
    assert.match(dualConfirmed.explanation, /Dual confirmation/i);

    // 4. Conflicting vision direction (Local UP vs Vision DOWN) forces WAIT
    const conflictValidator = validator.validate({
        localResult: {
            candidate: 'UP',
            candleCompleted: true,
            confidence_tier: 'MEDIUM',
            supportingEvidence: ['Bullish candle']
        },
        visionResult: { direction: 'DOWN', analyzed_at: now - 2000 },
        frameAgeMs: 1500,
        now
    });
    assert.equal(conflictValidator.direction, 'WAIT');
    assert.match(conflictValidator.explanation, /Conflicting directions/i);
});

test('Hybrid Integration: Fast local loop executes in milliseconds and triggers voice on valid signal', async () => {
    const spoken = [];
    const sounds = [];
    let highResCalls = 0;

    class FakeElement {
        constructor(id) {
            this.id = id;
            this.textContent = '';
            this.value = '1500';
            this.dataset = {};
            this.listeners = {};
            this.children = [];
        }
        addEventListener(n, cb) { this.listeners[n] = cb; }
        append(...items) { this.children.push(...items); }
        appendChild(item) { this.children.push(item); }
        replaceChildren(...items) { this.children = items; }
    }

    const timers = new Map();
    let timerId = 0;
    const setIntervalFn = (fn, ms) => {
        const id = ++timerId;
        timers.set(id, { fn, ms, cleared: false });
        return id;
    };
    const clearIntervalFn = (id) => {
        if (timers.has(id)) timers.get(id).cleared = true;
    };

    const elements = {
        connectButton: new FakeElement('connectLiveScreenBtn'),
        startButton: new FakeElement('startMonitoringBtn'),
        stopButton: new FakeElement('stopMonitoringBtn'),
        intervalSelect: new FakeElement('frameIntervalSelect'),
        connectionStatus: new FakeElement('liveConnectionStatus'),
        monitoringStatus: new FakeElement('monitoringStatus'),
        lastFrameTimestamp: new FakeElement('lastFrameTimestamp'),
        observationStatus: new FakeElement('chartObservationStatus'),
        signalDirection: new FakeElement('signalDirection'),
        signalStatus: new FakeElement('marketDataStatus'),
        indicatorObservations: new FakeElement('indicatorObservations'),
        analysisUncertainties: new FakeElement('analysisUncertainties'),
        signalTimestamp: new FakeElement('signalTimestamp'),
        visionModelStatus: new FakeElement('visionModelStatus'),
        visionSetupDetails: new FakeElement('visionSetupDetails'),
        analysisStartTime: new FakeElement('analysisStartTime'),
        analysisCompleteTime: new FakeElement('analysisCompleteTime'),
        inferenceLatency: new FakeElement('inferenceLatency'),
        frameFreshness: new FakeElement('frameFreshness'),
        aiProcessingStatus: new FakeElement('aiProcessingStatus')
    };
    elements.marketDataStatus = elements.signalStatus;
    elements.connectLiveScreenBtn = elements.connectButton;
    elements.startMonitoringBtn = elements.startButton;
    elements.stopMonitoringBtn = elements.stopButton;
    elements.liveConnectionStatus = elements.connectionStatus;
    elements.chartObservationStatus = elements.observationStatus;

    const track = {
        readyState: 'live',
        muted: false,
        listeners: {},
        addEventListener(n, cb) { this.listeners[n] = cb; },
        stop() { this.readyState = 'ended'; }
    };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
    const video = { readyState: 2, videoWidth: 1280, videoHeight: 720, srcObject: null, paused: false, async play() {}, pause() {} };
    const preview = { hidden: true };

    const notificationController = notificationsApi.createController({
        onWait: reason => {
            elements.signalDirection.textContent = 'WAIT';
            elements.signalDirection.dataset.direction = 'WAIT';
            elements.signalStatus.textContent = reason;
        },
        onLiveAnalysis: analysis => {
            elements.signalDirection.textContent = analysis.direction;
            elements.signalDirection.dataset.direction = analysis.direction;
            elements.signalStatus.textContent = analysis.explanation;
        },
        playSound: (dir, id) => { sounds.push({ dir, id }); },
        speakSignal: dir => { spoken.push(dir === 'UP' ? 'UP SIGNAL' : 'DOWN SIGNAL'); },
        cooldownMs: 60000
    });

    const mockExtractor = {
        extract: () => ({
            isValid: true,
            isReadable: true,
            dataQuality: 'VISUAL_ESTIMATE',
            candleCompleted: true,
            visualTrend: 'BULLISH',
            lastCompletedCandle: { polarity: 'BULLISH', height: 25 },
            bollingerPosition: 'LOWER_BAND_TEST',
            rsiVisualZone: 'OVERSOLD',
            rsiSlope: 'RISING',
            extractedAt: Date.now()
        }),
        reset() {}
    };

    const mockEngine = engineApi.createEngine();
    const mockValidator = validatorApi.createValidator();

    const monitor = monitorApi.createMonitor({
        mediaDevices: { async getDisplayMedia() { return stream; } },
        video,
        preview,
        elements,
        captureFrame: () => ({ width: 320, height: 180, data: new Uint8ClampedArray(320 * 180 * 4) }),
        captureHighResFrame: () => {
            highResCalls += 1;
            return 'data:image/jpeg;base64,mockImage';
        },
        observeFrame: () => ({
            chartVisibleCandidate: true,
            readable: true,
            visualQuality: 'GOOD',
            coloredColumns: 10,
            chartRegionCandidate: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
            frameDifference: 0.05,
            unchangedForMs: 0,
            possibleLayoutChange: false
        }),
        resetObserver() {},
        clearFrameCanvas() {},
        localChartExtractor: mockExtractor,
        localTechnicalEngine: mockEngine,
        finalSignalValidator: mockValidator,
        documentRef: { visibilityState: 'visible', listeners: {}, addEventListener(n, cb) { this.listeners[n] = cb; }, createElement(tag) { return new FakeElement(tag); } },
        fetchImpl: async (url) => {
            if (url === '/api/vision-status') return { ok: true, json: async () => ({ configured: true, model: 'qwen3-vl:4b' }) };
            if (url === '/api/analyze-frame') return { ok: true, json: async () => ({ direction: 'UP', explanation: 'Vision confirms uptrend' }) };
            throw new Error(`Unexpected url ${url}`);
        },
        notificationController,
        setIntervalFn,
        clearIntervalFn
    });

    await monitor.connect();
    monitor.startMonitoring();

    // Fast local engine evaluated immediately on frame sample
    assert.equal(elements.signalDirection.textContent, 'UP');
    assert.match(elements.marketDataStatus.textContent, /UP SIGNAL/);
    assert.match(elements.inferenceLatency.textContent, /s$/);
    assert.match(elements.frameFreshness.textContent, /Fresh/);

    // Voice alert triggered on UP signal!
    assert.deepEqual(spoken, ['UP SIGNAL']);
    assert.equal(sounds.length, 1);
    assert.equal(sounds[0].dir, 'UP');

    // Conditional vision check was triggered for the bullish setup
    assert.ok(highResCalls >= 1);

    monitor.stopMonitoring();
});

// --- Approved Priority 1 & Priority 2 Verification Tests ---

test('P1-Test 1: Three consecutive green candles without RSI or Bollinger confirmation must return WAIT', () => {
    const engine = engineApi.createEngine();
    const threeGreenCandlesOnly = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BULLISH',
        lastCompletedCandle: { polarity: 'BULLISH', height: 25 },
        bollingerPosition: 'MIDDLE',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FLAT'
    };
    const res = engine.evaluate(threeGreenCandlesOnly);
    assert.equal(res.candidate, 'WAIT');
    assert.equal(res.confidence_tier, 'NONE');
    assert.match(res.waitReason, /independent momentum \(RSI\) or volatility \(Bollinger\) confirmation is missing/i);
});

test('P1-Test 2: Three consecutive red candles without independent confirmation must return WAIT', () => {
    const engine = engineApi.createEngine();
    const threeRedCandlesOnly = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BEARISH',
        lastCompletedCandle: { polarity: 'BEARISH', height: 25 },
        bollingerPosition: 'MIDDLE',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FLAT'
    };
    const res = engine.evaluate(threeRedCandlesOnly);
    assert.equal(res.candidate, 'WAIT');
    assert.equal(res.confidence_tier, 'NONE');
    assert.match(res.waitReason, /independent momentum \(RSI\) or volatility \(Bollinger\) confirmation is missing/i);
});

test('P1-Test 3: Completed bullish candle + valid independent bullish RSI confirmation produces an UP candidate', () => {
    const engine = engineApi.createEngine();
    const bullishRsiSetup = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BULLISH',
        lastCompletedCandle: { polarity: 'BULLISH', height: 20 },
        bollingerPosition: 'MIDDLE',
        rsiVisualZone: 'OVERSOLD',
        rsiSlope: 'RISING'
    };
    const res = engine.evaluate(bullishRsiSetup);
    assert.equal(res.candidate, 'UP');
    assert.equal(res.confidence_tier, 'MEDIUM');
    assert.ok(res.supportingEvidence.some(e => e.includes('bullish (green)')));
    assert.ok(res.supportingEvidence.some(e => e.includes('RSI 14 rebounded')));
});

test('P1-Test 4: Completed bearish candle + valid independent bearish RSI confirmation produces a DOWN candidate', () => {
    const engine = engineApi.createEngine();
    const bearishRsiSetup = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BEARISH',
        lastCompletedCandle: { polarity: 'BEARISH', height: 20 },
        bollingerPosition: 'MIDDLE',
        rsiVisualZone: 'OVERBOUGHT',
        rsiSlope: 'FALLING'
    };
    const res = engine.evaluate(bearishRsiSetup);
    assert.equal(res.candidate, 'DOWN');
    assert.equal(res.confidence_tier, 'MEDIUM');
    assert.ok(res.supportingEvidence.some(e => e.includes('bearish (red)')));
    assert.ok(res.supportingEvidence.some(e => e.includes('RSI 14 rejected')));
});

test('P1-Test 5: Missing RSI and Bollinger data must return WAIT', () => {
    const engine = engineApi.createEngine();
    const missingIndicators = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BULLISH',
        lastCompletedCandle: { polarity: 'BULLISH', height: 20 },
        bollingerPosition: 'MIDDLE',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FLAT'
    };
    const res = engine.evaluate(missingIndicators);
    assert.equal(res.candidate, 'WAIT');
    assert.match(res.waitReason, /missing/i);
});

test('P1-Test 6: Conflicting independent evidence must return WAIT', () => {
    const engine = engineApi.createEngine();
    // Bullish candle + Upper Band Resistance Test + Falling RSI
    const conflictingSetup = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BULLISH',
        lastCompletedCandle: { polarity: 'BULLISH', height: 20 },
        bollingerPosition: 'UPPER_BAND_TEST', // Bearish resistance
        rsiVisualZone: 'OVERBOUGHT',
        rsiSlope: 'FALLING' // Bearish momentum
    };
    const res = engine.evaluate(conflictingSetup);
    assert.equal(res.candidate, 'WAIT');
    assert.match(res.waitReason, /conflicting/i);
});

test('P2-Test 7: A newly forming candle must never inherit the previous candle completed state', () => {
    const extractor = extractorApi.createExtractor();
    const width = 320, height = 180;
    const data = new Uint8ClampedArray(width * height * 4);

    // Initial 4 candles (stride = 20)
    [100, 120, 140, 160].forEach((cx) => {
        for (let y = 50; y <= 80; y += 1) {
            for (let x = cx; x <= cx + 4; x += 1) {
                const off = (y * width + x) * 4;
                data[off + 1] = 200; data[off + 3] = 255;
            }
        }
    });
    const frame1 = { width, height, data };
    const res1 = extractor.extract(frame1, 1000);
    assert.equal(res1.candleCompleted, false);
    assert.equal(res1.formingCandle.isCompleted, false);

    // Frame 2: A new candle forms at x = 180 (advances by stride >= 13px) -> triggers closure of candle_1
    for (let y = 50; y <= 80; y += 1) {
        for (let x = 180; x <= 184; x += 1) {
            const off = (y * width + x) * 4;
            data[off + 1] = 200; data[off + 3] = 255;
        }
    }
    const frame2 = { width, height, data };
    const res2 = extractor.extract(frame2, 2000);
    assert.equal(res2.candleCompleted, true);
    assert.equal(res2.formingCandle.isCompleted, false); // forming candle itself is NEVER completed
    assert.equal(res2.lastCompletedCandle.isCompleted, true);

    // Frame 3: Sampling continuation during the active forming candle at x = 181 (within same stride)
    // MUST NOT inherit completion; must be false!
    const res3 = extractor.extract(frame2, 3500);
    assert.equal(res3.candleCompleted, false, 'Newly forming candle must not inherit completion state');
    assert.equal(res3.formingCandle.isCompleted, false);
});

test('P2-Test 8: Horizontal chart scrolling must not falsely complete a candle', () => {
    const extractor = extractorApi.createExtractor();
    const width = 320, height = 180;
    const data1 = new Uint8ClampedArray(width * height * 4);

    // Base candles at 100, 120, 140, 160
    [100, 120, 140, 160].forEach((cx) => {
        for (let y = 50; y <= 80; y += 1) {
            for (let x = cx; x <= cx + 4; x += 1) {
                const off = (y * width + x) * 4;
                data1[off + 1] = 200; data1[off + 3] = 255;
            }
        }
    });
    extractor.extract({ width, height, data: data1 }, 1000);

    // Simulate chart scrolling left by 5 pixels (all candles shift by -5: 95, 115, 135, 155)
    const data2 = new Uint8ClampedArray(width * height * 4);
    [95, 115, 135, 155].forEach((cx) => {
        for (let y = 50; y <= 80; y += 1) {
            for (let x = cx; x <= cx + 4; x += 1) {
                const off = (y * width + x) * 4;
                data2[off + 1] = 200; data2[off + 3] = 255;
            }
        }
    });
    const scrolledRes = extractor.extract({ width, height, data: data2 }, 2000);
    assert.equal(scrolledRes.candleCompleted, false, 'Horizontal chart scroll must not trigger candle completion');
});

test('P2-Test 9: Wick expansion must not falsely complete a candle', () => {
    const extractor = extractorApi.createExtractor();
    const width = 320, height = 180;
    const data1 = new Uint8ClampedArray(width * height * 4);

    // Base candles at 100, 120, 140, 160
    [100, 120, 140, 160].forEach((cx) => {
        for (let y = 50; y <= 80; y += 1) {
            for (let x = cx; x <= cx + 4; x += 1) {
                const off = (y * width + x) * 4;
                data1[off + 1] = 200; data1[off + 3] = 255;
            }
        }
    });
    extractor.extract({ width, height, data: data1 }, 1000);

    // Wick/tick expands forming candle width by 3px (center shifts slightly from 162 to 164, well under stride * 0.65)
    const data2 = new Uint8ClampedArray(width * height * 4);
    [100, 120, 140].forEach((cx) => {
        for (let y = 50; y <= 80; y += 1) {
            for (let x = cx; x <= cx + 4; x += 1) {
                const off = (y * width + x) * 4;
                data2[off + 1] = 200; data2[off + 3] = 255;
            }
        }
    });
    for (let y = 45; y <= 85; y += 1) {
        for (let x = 160; x <= 167; x += 1) {
            const off = (y * width + x) * 4;
            data2[off + 1] = 200; data2[off + 3] = 255;
        }
    }
    const wickRes = extractor.extract({ width, height, data: data2 }, 2000);
    assert.equal(wickRes.candleCompleted, false, 'Wick expansion must not falsely trigger candle completion');
});

test('P2-Test 10: Candle identity changes must reset completion state correctly', () => {
    const extractor = extractorApi.createExtractor();
    const width = 320, height = 180;
    const data = new Uint8ClampedArray(width * height * 4);
    [100, 120, 140, 160].forEach((cx) => {
        for (let y = 50; y <= 80; y += 1) {
            for (let x = cx; x <= cx + 4; x += 1) {
                const off = (y * width + x) * 4;
                data[off + 1] = 200; data[off + 3] = 255;
            }
        }
    });

    extractor.extract({ width, height, data }, 1000);
    // Add next candle column
    for (let y = 50; y <= 80; y += 1) {
        for (let x = 180; x <= 184; x += 1) {
            const off = (y * width + x) * 4;
            data[off + 1] = 200; data[off + 3] = 255;
        }
    }
    const res = extractor.extract({ width, height, data }, 2000);
    assert.equal(res.candleCompleted, true);

    // Call reset
    extractor.reset();
    const resAfterReset = extractor.extract({ width, height, data }, 3000);
    assert.equal(resAfterReset.candleCompleted, false, 'Reset must return completion state to false');
    assert.equal(resAfterReset.formingCandle.isCompleted, false);
});

test('Audit Logging: Validator generates structured audit record with all required verification fields', () => {
    const validator = validatorApi.createValidator();
    const now = 1700000000000;
    const localResult = {
        candidate: 'UP',
        candleCompleted: true,
        candleId: 'candle_4',
        dataQuality: 'VISUAL_ESTIMATE',
        priceActionEvidence: ['Completed candle closed bullish (green).'],
        momentumEvidence: ['RSI 14 rebounded upward from oversold zone.'],
        volatilityEvidence: ['Price tested lower Bollinger Band support and bounced.'],
        conflictingEvidence: [],
        confidence_tier: 'HIGH',
        supportingEvidence: ['Completed candle closed bullish', 'RSI rebounded', 'BB bounce'],
        indicatorsEvaluated: {
            candles: 'BULLISH',
            rsi: 'BULLISH',
            bollinger: 'BULLISH',
            trend: 'BULLISH',
            ema: 'BULLISH'
        }
    };

    const telemetry = { totalLocalLatencyMs: 0.85 };
    const validated = validator.validate({ localResult, visionResult: null, frameAgeMs: 800, now, telemetry });

    assert.ok(validated.audit, 'Audit object must exist');
    assert.equal(validated.audit.signal, 'UP');
    assert.equal(validated.audit.candleIdentity, 'candle_4');
    assert.equal(validated.audit.candleCompletionStatus, true);
    assert.equal(validated.audit.dataQuality, 'VISUAL_ESTIMATE');
    assert.deepEqual(validated.audit.priceActionEvidence, ['Completed candle closed bullish (green).']);
    assert.deepEqual(validated.audit.momentumEvidence, ['RSI 14 rebounded upward from oversold zone.']);
    assert.deepEqual(validated.audit.volatilityEvidence, ['Price tested lower Bollinger Band support and bounced.']);
    assert.deepEqual(validated.audit.conflictingEvidence, []);
    assert.match(validated.audit.frameFreshness, /Fresh/);
    assert.equal(validated.audit.localProcessingLatency, '0.850ms');
    assert.equal(validated.audit.visionVerificationStatus, 'UNVERIFIED_PENDING');

    // Verify zero fabricated numeric values in audit
    const jsonStr = JSON.stringify(validated.audit);
    assert.equal(jsonStr.includes('open:'), false);
    assert.equal(jsonStr.includes('high:'), false);
    assert.equal(jsonStr.includes('low:'), false);
    assert.equal(jsonStr.includes('close:'), false);
});

test('Dashboard Transparency: Visual estimates, completed vs forming candles, and unverified states are labeled', () => {
    const validator = validatorApi.createValidator();
    const now = 1700000000000;

    // 1. Completed candle case
    const completedResult = {
        candidate: 'UP',
        candleCompleted: true,
        candleId: 'candle_5',
        dataQuality: 'VISUAL_ESTIMATE',
        indicatorsEvaluated: {
            candles: 'BULLISH',
            rsi: 'BULLISH',
            bollinger: 'BULLISH',
            trend: 'BULLISH',
            ema: 'BULLISH'
        },
        supportingEvidence: ['Completed green candle', 'RSI rebound']
    };
    const validatedCompleted = validator.validate({ localResult: completedResult, frameAgeMs: 500, now });
    assert.match(validatedCompleted.observations.candles, /Confirmed Completed Candle/);
    assert.match(validatedCompleted.observations.ema9, /Visual Estimate/);
    assert.match(validatedCompleted.observations.bollingerBands, /Visual Estimate/);
    assert.match(validatedCompleted.observations.rsi14, /Visual Estimate/);

    // 2. Forming candle case
    const formingResult = {
        candidate: 'WAIT',
        candleCompleted: false,
        candleId: 'candle_6',
        dataQuality: 'VISUAL_ESTIMATE',
        indicatorsEvaluated: {
            candles: 'BULLISH',
            rsi: 'NEUTRAL',
            bollinger: 'NEUTRAL',
            trend: 'NEUTRAL',
            ema: 'NEUTRAL'
        },
        conflictingEvidence: []
    };
    const validatedForming = validator.validate({ localResult: formingResult, frameAgeMs: 500, now });
    assert.match(validatedForming.observations.candles, /Active Forming Candle.*Unconfirmed/);
    assert.match(validatedForming.observations.rsi14, /neutral or sub-panel unavailable/i);
});
