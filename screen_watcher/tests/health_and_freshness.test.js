'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createVisionService, MODEL, OLLAMA_URL } = require('../vision_provider.js');
const monitorApi = require('../public/live_screen_monitor.js');
const notificationsApi = require('../public/signal_notifications.js');

class FakeElement {
    constructor(id) {
        this.id = id;
        this.textContent = '';
        this.value = id === 'frameIntervalSelect' ? '1500' : '';
        this.disabled = false;
        this.hidden = false;
        this.className = 'telemetry-val';
        this.dataset = {};
        this.listeners = {};
        this.children = [];
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.children.push(item); }
    replaceChildren(...items) { this.children = items; }
}

function createHarness() {
    let nowTime = 1700000000000;
    const spoken = [];
    const sounds = [];
    const timers = new Map();
    let timerId = 0;

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
        aiProcessingStatus: new FakeElement('aiProcessingStatus'),
        visionInferenceLatency: new FakeElement('visionInferenceLatency'),
        localEngineLatency: new FakeElement('localEngineLatency'),
        frameCaptureLatency: new FakeElement('frameCaptureLatency'),
        localExtractionLatency: new FakeElement('localExtractionLatency'),
        technicalEngineLatency: new FakeElement('technicalEngineLatency'),
        finalValidationLatency: new FakeElement('finalValidationLatency')
    };
    elements.connectLiveScreenBtn = elements.connectButton;
    elements.startMonitoringBtn = elements.startButton;
    elements.stopMonitoringBtn = elements.stopButton;
    elements.marketDataStatus = elements.signalStatus;
    elements.liveConnectionStatus = elements.connectionStatus;
    elements.chartObservationStatus = elements.observationStatus;

    const track = {
        readyState: 'live',
        muted: false,
        listeners: {},
        addEventListener(n, cb) { this.listeners[n] = cb; },
        emit(n) { if (this.listeners[n]) this.listeners[n](); },
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

    return {
        elements, video, preview, track, stream, spoken, sounds, timers,
        now: () => nowTime,
        advanceTime: ms => { nowTime += ms; },
        notificationController,
        setIntervalFn: (fn, ms) => {
            const id = ++timerId;
            timers.set(id, { fn, ms, cleared: false });
            return id;
        },
        clearIntervalFn: id => {
            if (timers.has(id)) timers.get(id).cleared = true;
        }
    };
}

// 1. OLLAMA UNAVAILABLE
test('HealthCheck: Ollama unavailable reports offline and does not mark service configured', async () => {
    const service = createVisionService({
        fetchImpl: async () => {
            throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
        }
    });
    const status = await service.getStatus();
    assert.equal(status.configured, false);
    assert.match(status.message, /Ollama is not responding/);
    assert.match(status.message, /screenshots are processed locally only/);
});

// 2. OLLAMA HEALTH-CHECK TIMEOUT
test('HealthCheck: Ollama health-check timeout is caught gracefully', async () => {
    const service = createVisionService({
        fetchImpl: async () => {
            const err = new Error('The operation was aborted');
            err.name = 'TimeoutError';
            throw err;
        }
    });
    const status = await service.getStatus();
    assert.equal(status.configured, false);
    assert.match(status.message, /Ollama is not responding/);
});

// 3. MODEL MISSING
test('HealthCheck: Model missing in Ollama returns clear instruction to pull model', async () => {
    const service = createVisionService({
        fetchImpl: async () => ({ status: 404, ok: false })
    });
    const status = await service.getStatus();
    assert.equal(status.configured, false);
    assert.ok(status.message.includes(MODEL));
    assert.match(status.message, /not available/);
});

// 4. OLLAMA RECOVERY AFTER TEMPORARY FAILURE (ENDPOINT FALLBACK / RETRY)
test('HealthCheck: Ollama recovery after temporary failure on primary endpoint', async () => {
    let attempts = 0;
    const service = createVisionService({
        fetchImpl: async url => {
            attempts += 1;
            if (attempts === 1) {
                throw new Error('Connection refused on 127.0.0.1');
            }
            return {
                ok: true,
                status: 200,
                async json() {
                    return { capabilities: ['vision', 'completion'] };
                }
            };
        }
    });
    const status = await service.getStatus();
    assert.equal(status.configured, true);
    assert.equal(attempts, 2);
    assert.match(status.message, /reports image\/vision capability/);
});

// 5. SCREEN SHARING DISCONNECTED STATUS
test('LiveScreen: Disconnecting screen sharing cleanly sets Disconnected and Screen disconnected states', async () => {
    const harness = createHarness();
    const monitor = monitorApi.createMonitor({
        mediaDevices: { async getDisplayMedia() { return harness.stream; } },
        video: harness.video,
        preview: harness.preview,
        elements: harness.elements,
        now: harness.now,
        setIntervalFn: harness.setIntervalFn,
        clearIntervalFn: harness.clearIntervalFn
    });

    await monitor.connect();
    assert.equal(harness.elements.connectionStatus.textContent, 'Connected — local preview');
    assert.equal(harness.elements.frameFreshness.textContent, 'Screen connected');

    monitor.disconnect('User closed tab');
    assert.equal(harness.elements.connectionStatus.textContent, 'Disconnected');
    assert.equal(harness.elements.frameFreshness.textContent, 'Screen disconnected');
    assert.equal(harness.elements.aiProcessingStatus.textContent, 'Idle');
    assert.equal(harness.video.srcObject, null);
});

// 6. NO FRAMES RECEIVED STATUS
test('LiveScreen: When stream produces no frame, reports No frames received without crashing', async () => {
    const harness = createHarness();
    const monitor = monitorApi.createMonitor({
        mediaDevices: { async getDisplayMedia() { return harness.stream; } },
        video: harness.video,
        preview: harness.preview,
        elements: harness.elements,
        captureFrame: () => null, // No frame available from video element
        now: harness.now,
        setIntervalFn: harness.setIntervalFn,
        clearIntervalFn: harness.clearIntervalFn
    });

    await monitor.connect();
    monitor.startMonitoring();

    assert.equal(harness.elements.frameFreshness.textContent, 'No frames received');
    assert.equal(harness.elements.aiProcessingStatus.textContent, 'Analysis waiting');
    assert.match(harness.elements.monitoringStatus.textContent, /Waiting for the first shared video frame/);
});

// 7. STALE FRAMES STATUS & REJECTION
test('LiveScreen: Frame older than 30s is flagged as STALE and forces WAIT', async () => {
    const harness = createHarness();
    let clock = 1700000000000;
    const monitor = monitorApi.createMonitor({
        mediaDevices: { async getDisplayMedia() { return harness.stream; } },
        video: harness.video,
        preview: harness.preview,
        elements: harness.elements,
        captureFrame: () => ({ width: 320, height: 180, data: new Uint8ClampedArray(320 * 180 * 4) }),
        captureHighResFrame: () => 'data:image/jpeg;base64,mockHighResFrame',
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
        now: () => clock,
        setIntervalFn: harness.setIntervalFn,
        clearIntervalFn: harness.clearIntervalFn,
        fetchImpl: async url => {
            if (url === '/api/vision-status') return { ok: true, json: async () => ({ configured: true }) };
            if (url === '/api/analyze-frame') {
                clock += 35000; // Simulate 35s latency
                return {
                    ok: true,
                    json: async () => ({
                        direction: 'UP',
                        explanation: 'Delayed vision result'
                    })
                };
            }
            throw new Error(`Unexpected url ${url}`);
        }
    });

    await monitor.connect();
    monitor.startMonitoring();
    await new Promise(r => setImmediate(r));

    assert.match(harness.elements.frameFreshness.textContent, /STALE/);
    assert.equal(harness.elements.signalDirection.textContent, 'WAIT');
    assert.match(harness.elements.signalStatus.textContent, /DELAYED ANALYSIS/);
    // Voice alerts must NEVER trigger on stale frames
    assert.deepEqual(harness.spoken, []);
});

// 8. FRESH FRAME RECOVERY
test('LiveScreen: Stale state recovers to Fresh once a recent frame arrives', async () => {
    const harness = createHarness();
    let clock = 1700000000000;
    let slowAnalysis = true;
    const monitor = monitorApi.createMonitor({
        mediaDevices: { async getDisplayMedia() { return harness.stream; } },
        video: harness.video,
        preview: harness.preview,
        elements: harness.elements,
        captureFrame: () => ({ width: 320, height: 180, data: new Uint8ClampedArray(320 * 180 * 4) }),
        captureHighResFrame: () => 'data:image/jpeg;base64,mockHighResFrame',
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
        now: () => clock,
        setIntervalFn: harness.setIntervalFn,
        clearIntervalFn: harness.clearIntervalFn,
        fetchImpl: async url => {
            if (url === '/api/vision-status') return { ok: true, json: async () => ({ configured: true }) };
            if (url === '/api/analyze-frame') {
                if (slowAnalysis) {
                    clock += 35000;
                } else {
                    clock += 200;
                }
                return {
                    ok: true,
                    json: async () => ({
                        direction: 'UP',
                        explanation: 'Vision result'
                    })
                };
            }
            throw new Error(`Unexpected url ${url}`);
        }
    });

    await monitor.connect();
    monitor.startMonitoring();
    await new Promise(r => setImmediate(r));
    assert.match(harness.elements.frameFreshness.textContent, /STALE/);

    // Now a new frame arrives quickly (< 30s)
    slowAnalysis = false;
    clock += 1500;
    monitor.sampleFrame();
    await new Promise(r => setImmediate(r));

    assert.match(harness.elements.frameFreshness.textContent, /Fresh/);
});

// 9. ACCURATE TIMING MEASUREMENTS SEPARATED
test('Timing: Accurately separates local extraction, engine, validation, and Qwen vision latency', async () => {
    const harness = createHarness();
    const mockExtractor = {
        extract: () => ({
            isValid: true,
            isReadable: true,
            dataQuality: 'VISUAL_ESTIMATE',
            candleCompleted: false, // Incomplete candle -> returns WAIT
            visualTrend: 'NEUTRAL',
            lastCompletedCandle: null
        }),
        reset() {}
    };

    const engineApi = require('../public/local_technical_engine.js');
    const validatorApi = require('../public/final_signal_validator.js');

    const monitor = monitorApi.createMonitor({
        mediaDevices: { async getDisplayMedia() { return harness.stream; } },
        video: harness.video,
        preview: harness.preview,
        elements: harness.elements,
        captureFrame: () => ({ width: 320, height: 180, data: new Uint8ClampedArray(320 * 180 * 4) }),
        captureHighResFrame: () => 'data:image/jpeg;base64,mockHighResFrame',
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
        localChartExtractor: mockExtractor,
        localTechnicalEngine: engineApi.createEngine(),
        finalSignalValidator: validatorApi.createValidator(),
        now: harness.now,
        setIntervalFn: harness.setIntervalFn,
        clearIntervalFn: harness.clearIntervalFn
    });

    await monitor.connect();
    monitor.startMonitoring();

    // Local breakdown elements are populated
    assert.match(harness.elements.localEngineLatency.textContent, /ms$/);
    assert.match(harness.elements.frameCaptureLatency.textContent, /ms$/);
    assert.match(harness.elements.localExtractionLatency.textContent, /ms$/);
    assert.match(harness.elements.technicalEngineLatency.textContent, /ms$/);
    assert.match(harness.elements.finalValidationLatency.textContent, /ms$/);

    // Qwen vision inference is NOT executed on incomplete candle WAIT
    assert.equal(harness.elements.visionInferenceLatency.textContent, 'Not invoked');
});
