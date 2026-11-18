'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const monitorApi = require('../public/live_screen_monitor.js');
const notificationsApi = require('../public/signal_notifications.js');

class FakeElement {
    constructor(id) {
        this.id = id;
        this.textContent = '';
        this.value = id === 'frameIntervalSelect' ? '1500' : '';
        this.disabled = false;
        this.hidden = id === 'livePreviewContainer';
        this.dataset = {};
        this.listeners = {};
        this.children = [];
    }

    addEventListener(name, callback) {
        this.listeners[name] = callback;
    }

    append(...items) {
        this.children.push(...items);
    }

    appendChild(item) {
        this.children.push(item);
    }

    replaceChildren(...items) {
        this.children = items;
    }
}

function createWorkflowHarness({
    mockOllamaResponse = null,
    mockFetchError = null,
    observeFrame = null
} = {}) {
    const spoken = [];
    const sounds = [];
    const timers = new Map();
    let timerId = 0;
    let time = 1700000000000;
    let frameCaptures = 0;
    let highResCaptures = 0;

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
    elements.connectLiveScreenBtn = elements.connectButton;
    elements.startMonitoringBtn = elements.startButton;
    elements.stopMonitoringBtn = elements.stopButton;
    elements.frameIntervalSelect = elements.intervalSelect;
    elements.liveConnectionStatus = elements.connectionStatus;
    elements.chartObservationStatus = elements.observationStatus;
    elements.marketDataStatus = elements.signalStatus;

    const track = {
        readyState: 'live',
        muted: false,
        listeners: {},
        addEventListener(name, cb) { this.listeners[name] = cb; },
        stop() { this.readyState = 'ended'; }
    };
    const stream = {
        getVideoTracks: () => [track],
        getTracks: () => [track]
    };
    const video = {
        readyState: 2,
        videoWidth: 1280,
        videoHeight: 720,
        srcObject: null,
        paused: false,
        async play() { this.paused = false; },
        pause() { this.paused = true; }
    };
    const preview = { hidden: true };
    const documentRef = {
        visibilityState: 'visible',
        listeners: {},
        addEventListener(name, cb) { this.listeners[name] = cb; },
        createElement(tag) { return new FakeElement(tag); }
    };

    const notificationController = notificationsApi.createController({
        onWait: reason => {
            elements.signalDirection.textContent = 'WAIT';
            elements.signalDirection.dataset.direction = 'WAIT';
            elements.marketDataStatus.textContent = reason;
        },
        onLiveAnalysis: analysis => {
            elements.signalDirection.textContent = analysis.direction;
            elements.signalDirection.dataset.direction = analysis.direction;
            elements.marketDataStatus.textContent = analysis.explanation;
        },
        playSound: (dir, id) => { sounds.push({ dir, id }); },
        speakSignal: dir => { spoken.push(dir === 'UP' ? 'UP SIGNAL' : 'DOWN SIGNAL'); },
        cooldownMs: 60000
    });

    const fetchCalls = [];
    const fetchImpl = async (url, options) => {
        fetchCalls.push({ url, options });
        if (url === '/api/vision-status') {
            return {
                ok: true,
                json: async () => ({
                    configured: true,
                    model: 'qwen3-vl:4b',
                    message: 'Ollama is available.'
                })
            };
        }
        if (url === '/api/analyze-frame') {
            if (mockFetchError) throw mockFetchError;
            return {
                ok: true,
                status: 200,
                json: async () => mockOllamaResponse || {
                    id: 'mock-1',
                    direction: 'WAIT',
                    explanation: 'Chart consolidating.',
                    observations: { candles: null },
                    uncertainties: []
                }
            };
        }
        throw new Error(`Unexpected URL: ${url}`);
    };

    const monitor = monitorApi.createMonitor({
        mediaDevices: {
            async getDisplayMedia() { return stream; }
        },
        video,
        preview,
        elements,
        captureFrame: () => {
            frameCaptures += 1;
            return { width: 320, height: 180, data: new Uint8ClampedArray(320 * 180 * 4) };
        },
        captureHighResFrame: () => {
            highResCaptures += 1;
            return 'data:image/jpeg;base64,mockHighResFrame';
        },
        observeFrame: observeFrame || (() => ({
            chartVisibleCandidate: true,
            readable: true,
            visualQuality: 'GOOD',
            coloredColumns: 15,
            chartRegionCandidate: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
            frameDifference: 0.05,
            unchangedForMs: 0,
            possibleLayoutChange: false
        })),
        resetObserver() {},
        clearFrameCanvas() {},
        documentRef,
        windowRef: { notificationController, addEventListener() {} },
        fetchImpl,
        notificationController,
        now: () => time,
        setIntervalFn: (cb, interval) => {
            timerId += 1;
            timers.set(timerId, { cb, interval, cleared: false });
            return timerId;
        },
        clearIntervalFn: id => {
            if (timers.has(id)) timers.get(id).cleared = true;
        },
        logger: { warn() {}, error() {} }
    });

    return {
        monitor, elements, video, preview, track, stream, timers,
        fetchCalls, spoken, sounds,
        getFrameCaptures: () => frameCaptures,
        getHighResCaptures: () => highResCaptures,
        advanceTime: ms => { time += ms; },
        setMockResponse: resp => { mockOllamaResponse = resp; },
        setMockError: err => { mockFetchError = err; }
    };
}

test('Step 1: Connect Quotex tab requests display media, shows preview, and enables Start button', async () => {
    const harness = createWorkflowHarness();

    const connected = await harness.monitor.connect();
    assert.equal(connected, true);
    assert.equal(harness.video.srcObject, harness.stream);
    assert.equal(harness.preview.hidden, false);
    assert.equal(harness.elements.connectLiveScreenBtn.disabled, true);
    assert.equal(harness.elements.startMonitoringBtn.disabled, false);
    assert.equal(harness.elements.stopMonitoringBtn.disabled, true);
    assert.equal(harness.elements.liveConnectionStatus.textContent, 'Connected — local preview');
});

test('Step 2 & 3: Start continuous monitoring analyzes chart frames with local Ollama', async () => {
    const harness = createWorkflowHarness({
        mockOllamaResponse: {
            id: 'sig-up-1',
            direction: 'UP',
            explanation: 'Multi-factor bullish confirmation: EMA 9 crossed above EMA 21, bounce off lower Bollinger Band, completed hammer candle.',
            observations: {
                ema9: 'Above EMA 21 (Golden Cross)',
                ema21: 'Rising slope',
                bollingerBands: 'Bounced off lower band',
                rsi14: '38 rising from oversold',
                macd: 'Bullish histogram expanding',
                candles: 'Completed bullish hammer candle',
                trend: 'Uptrend resuming',
                supportResistance: 'Supported at 1.0820'
            },
            uncertainties: []
        }
    });

    await harness.monitor.connect();
    const started = harness.monitor.startMonitoring();
    assert.equal(started, true);
    assert.equal(harness.elements.startMonitoringBtn.disabled, true);
    assert.equal(harness.elements.stopMonitoringBtn.disabled, false);

    // Allow async frame analysis to complete
    await new Promise(r => setImmediate(r));

    assert.equal(harness.elements.signalDirection.textContent, 'UP');
    assert.equal(harness.elements.signalDirection.dataset.direction, 'UP');
    assert.match(harness.elements.marketDataStatus.textContent, /Multi-factor bullish/);
    assert.ok(harness.elements.indicatorObservations.children.length >= 8);
    assert.deepEqual(harness.spoken, ['UP SIGNAL']);
    assert.equal(harness.sounds.length, 1);
    assert.equal(harness.sounds[0].dir, 'UP');
});

test('Step 4: Verify WAIT behavior during unclear market conditions (no directional voice or audio)', async () => {
    const harness = createWorkflowHarness({
        mockOllamaResponse: {
            id: 'sig-wait-1',
            direction: 'WAIT',
            explanation: 'Indicators conflict: price above EMA 9 but RSI overbought at 72, candles consolidating sideways.',
            observations: {
                ema9: 'Flat',
                ema21: 'Flat',
                candles: 'Doji / consolidation'
            },
            uncertainties: ['Momentum is weak; no breakout confirmation.']
        }
    });

    await harness.monitor.connect();
    harness.monitor.startMonitoring();
    await new Promise(r => setImmediate(r));

    assert.equal(harness.elements.signalDirection.textContent, 'WAIT');
    assert.match(harness.elements.marketDataStatus.textContent, /Indicators conflict/);
    // WAIT must NOT trigger directional voice alerts or sounds
    assert.deepEqual(harness.spoken, []);
    assert.deepEqual(harness.sounds, []);
});

test('Step 5: Verify DOWN voice alert spoken and falling tone played on valid bearish signal', async () => {
    const harness = createWorkflowHarness({
        mockOllamaResponse: {
            id: 'sig-down-1',
            direction: 'DOWN',
            explanation: 'Multi-factor bearish confirmation: rejection at upper Bollinger Band, EMA 9 below EMA 21, bearish engulfing completed candle.',
            observations: {
                ema9: 'Below EMA 21',
                bollingerBands: 'Rejected at upper band',
                rsi14: '65 turning down',
                candles: 'Bearish engulfing completed candle',
                trend: 'Downtrend continuation'
            },
            uncertainties: []
        }
    });

    await harness.monitor.connect();
    harness.monitor.startMonitoring();
    await new Promise(r => setImmediate(r));

    assert.equal(harness.elements.signalDirection.textContent, 'DOWN');
    assert.equal(harness.elements.signalDirection.dataset.direction, 'DOWN');
    assert.deepEqual(harness.spoken, ['DOWN SIGNAL']);
    assert.equal(harness.sounds.length, 1);
    assert.equal(harness.sounds[0].dir, 'DOWN');
});

test('Step 6: Verify duplicate alerts are prevented within cooldown period', async () => {
    const harness = createWorkflowHarness({
        mockOllamaResponse: {
            id: 'sig-up-1',
            direction: 'UP',
            explanation: 'Bullish bounce.',
            observations: { candles: 'Bullish', ema9: 'Above' },
            uncertainties: []
        }
    });

    await harness.monitor.connect();
    harness.monitor.startMonitoring();
    await new Promise(r => setImmediate(r));

    assert.deepEqual(harness.spoken, ['UP SIGNAL']);
    assert.equal(harness.sounds.length, 1);

    // Next frame 1.5s later returns same UP signal
    harness.advanceTime(1500);
    harness.setMockResponse({
        id: 'sig-up-2',
        direction: 'UP',
        explanation: 'Still bullish.',
        observations: { candles: 'Bullish', ema9: 'Above' },
        uncertainties: []
    });

    const timer = [...harness.timers.values()][0];
    timer.cb();
    await new Promise(r => setImmediate(r));

    // Duplicate UP signal within 60s cooldown must NOT announce again
    assert.deepEqual(harness.spoken, ['UP SIGNAL']);
    assert.equal(harness.sounds.length, 1);

    // After cooldown expires (61s later) on a genuinely new signal:
    harness.advanceTime(61000);
    harness.setMockResponse({
        id: 'sig-up-3',
        direction: 'UP',
        explanation: 'New candle bullish confirmation.',
        observations: { candles: 'Bullish', ema9: 'Above' },
        uncertainties: []
    });
    timer.cb();
    await new Promise(r => setImmediate(r));

    assert.deepEqual(harness.spoken, ['UP SIGNAL', 'UP SIGNAL']);
    assert.equal(harness.sounds.length, 2);
});

test('Step 7: Verify STOP MONITORING terminates capture loop', async () => {
    const harness = createWorkflowHarness();

    await harness.monitor.connect();
    harness.monitor.startMonitoring();
    const timer = [...harness.timers.values()][0];
    assert.equal(timer.cleared, false);

    harness.monitor.stopMonitoring('User stopped monitoring.');
    assert.equal(timer.cleared, true);
    assert.equal(harness.monitor.getState().monitoring, false);
    assert.equal(harness.elements.startMonitoringBtn.disabled, false);
    assert.equal(harness.elements.stopMonitoringBtn.disabled, true);
    assert.match(harness.elements.monitoringStatus.textContent, /User stopped monitoring/);
});

test('Step 8: Verify Ollama failure is handled gracefully without crashing', async () => {
    const harness = createWorkflowHarness({
        mockFetchError: new Error('Failed to fetch: Connection refused at localhost:11434')
    });

    await harness.monitor.connect();
    harness.monitor.startMonitoring();
    await new Promise(r => setImmediate(r));

    // Gracefully caught, status displays message, signal stays WAIT
    assert.equal(harness.elements.signalDirection.textContent, 'WAIT');
    assert.match(harness.elements.marketDataStatus.textContent, /Ollama is unreachable/);
    assert.deepEqual(harness.spoken, []);
    assert.deepEqual(harness.sounds, []);
});

test('Step 9: Detect stale chart frames and reject outdated analysis results', async () => {
    let callCount = 0;
    const harness = createWorkflowHarness();

    // Custom fetch simulating slow inference (e.g. 35s latency exceeding MAX_STALENESS_MS)
    const originalFetch = harness.monitor;
    await harness.monitor.connect();

    // Trigger analysis where clock advances 35 seconds before response returns
    harness.setMockResponse({
        id: 'stale-up-1',
        direction: 'UP',
        explanation: 'Bullish bounce, but frame took 35 seconds to analyze.',
        observations: { candles: 'Bullish hammer', ema9: 'Above' },
        uncertainties: []
    });

    // Start monitoring
    harness.monitor.startMonitoring();

    // Advance time by 35 seconds to simulate CPU latency
    harness.advanceTime(35000);
    await new Promise(r => setImmediate(r));

    // Stale frame must be rejected: direction forced to WAIT, never announce UP
    assert.equal(harness.elements.signalDirection.textContent, 'WAIT');
    assert.match(harness.elements.marketDataStatus.textContent, /DELAYED ANALYSIS/);
    assert.match(harness.elements.frameFreshness.textContent, /STALE/);
    assert.match(harness.elements.aiProcessingStatus.textContent, /DELAYED ANALYSIS/);
    // Voice alert must NEVER speak UP for a stale frame
    assert.deepEqual(harness.spoken, []);
    assert.deepEqual(harness.sounds, []);
});

test('Step 10: Server-side concurrency prevention rejects overlapping Ollama requests with HTTP 429', async t => {
    const { createServer } = require('../server.js');
    let slowResolver;
    const slowVisionService = {
        async getStatus() { return { configured: true, model: 'qwen3-vl:4b' }; },
        async analyzeScreenshot() {
            return new Promise(resolve => { slowResolver = resolve; });
        }
    };
    const server = createServer(slowVisionService);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(() => new Promise(r => server.close(r)));

    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    const solidPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    // First request starts in-flight
    const req1 = fetch(`${origin}/api/analyze-frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: `data:image/png;base64,${solidPngBase64}` })
    });

    // Give server a tick to set isAnalyzingOllama = true
    await new Promise(r => setTimeout(r, 15));

    // Second overlapping request should immediately receive HTTP 429
    const req2Response = await fetch(`${origin}/api/analyze-frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: `data:image/png;base64,${solidPngBase64}` })
    });

    assert.equal(req2Response.status, 429);
    const body2 = await req2Response.json();
    assert.equal(body2.busy, true);
    assert.match(body2.error, /Concurrent requests are prevented/);

    // Complete the first request
    slowResolver({
        id: 'done-1',
        direction: 'WAIT',
        explanation: 'Completed.'
    });
    const req1Response = await req1;
    assert.equal(req1Response.status, 200);
});

test('Step 11: Real-time telemetry readouts are updated with actual latency and freshness', async () => {
    const harness = createWorkflowHarness({
        mockOllamaResponse: {
            id: 'fresh-up',
            direction: 'UP',
            explanation: 'Multi-factor bullish confirmation: EMA 9 > EMA 21, bounce off lower BB, completed hammer.',
            observations: { candles: 'Completed hammer', ema9: 'Above EMA 21', bollingerBands: 'Lower bounce' },
            uncertainties: []
        }
    });

    await harness.monitor.connect();
    harness.monitor.startMonitoring();

    // Advance 5 seconds (well within 30s freshness threshold)
    harness.advanceTime(5000);
    await new Promise(r => setImmediate(r));

    assert.notEqual(harness.elements.analysisStartTime.textContent, '--:--:--');
    assert.notEqual(harness.elements.analysisCompleteTime.textContent, '--:--:--');
    assert.match(harness.elements.inferenceLatency.textContent, /s$/);
    assert.match(harness.elements.frameFreshness.textContent, /Fresh/);
    assert.match(harness.elements.aiProcessingStatus.textContent, /Ready/);
    assert.equal(harness.elements.signalDirection.textContent, 'UP');
});
