'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const monitorApi = require('../public/live_screen_monitor.js');

function createTestHarness(options = {}) {
    let frameCount = 0;
    const timers = new Map();
    let timerId = 0;
    let time = 1700000000000;

    const trackListeners = {};
    const track = {
        readyState: 'live',
        muted: false,
        addEventListener(name, cb) { trackListeners[name] = cb; },
        stop() { this.readyState = 'ended'; if (trackListeners.ended) trackListeners.ended(); }
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

    const elements = {
        connectButton: { disabled: false, textContent: 'CONNECT LIVE SCREEN' },
        startButton: { disabled: true, textContent: 'START MONITORING' },
        stopButton: { disabled: true, textContent: 'STOP MONITORING' },
        intervalSelect: { disabled: false, value: '1500' },
        connectionStatus: { textContent: 'Disconnected' },
        monitoringStatus: { textContent: '' },
        lastFrameTimestamp: { textContent: '' },
        observationStatus: { textContent: '' },
        signalDirection: { textContent: 'WAIT', dataset: { direction: 'WAIT' } },
        signalStatus: { textContent: '' },
        indicatorObservations: { replaceChildren() {} },
        analysisUncertainties: { textContent: '' },
        signalTimestamp: { textContent: '' },
        visionModelStatus: { textContent: '' },
        visionSetupDetails: { textContent: '' },
        analysisStartTime: { textContent: '' },
        analysisCompleteTime: { textContent: '' },
        inferenceLatency: { textContent: '' },
        frameFreshness: { textContent: '' },
        aiProcessingStatus: { textContent: '' },
        visionInferenceLatency: { textContent: '' }
    };

    const preview = { hidden: true };

    const mediaDevices = options.permissionDenied ? {
        async getDisplayMedia() {
            const err = new Error('Permission denied');
            err.name = 'NotAllowedError';
            throw err;
        }
    } : {
        async getDisplayMedia() { return stream; }
    };

    const monitor = monitorApi.createMonitor({
        mediaDevices,
        video,
        preview,
        elements,
        autoStart: options.autoStart !== undefined ? options.autoStart : true,
        captureFrame: () => {
            if (options.simulateEmptyFrame) return null;
            frameCount += 1;
            return { width: 320, height: 180, data: new Uint8ClampedArray(320 * 180 * 4) };
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
        documentRef: { visibilityState: 'visible', addEventListener() {} },
        windowRef: { addEventListener() {} },
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
        monitor,
        track,
        video,
        preview,
        elements,
        timers,
        getFrameCount: () => frameCount,
        advanceTimer: id => {
            const t = timers.get(id);
            if (t && !t.cleared) t.cb();
        }
    };
}

test('AutoMonitoring: Starts automatically as soon as screen sharing succeeds with valid first frame', async () => {
    const harness = createTestHarness({ autoStart: true });

    assert.equal(harness.elements.connectionStatus.textContent, 'Disconnected');
    assert.equal(harness.elements.startButton.disabled, true);

    const connected = await harness.monitor.connect();
    assert.equal(connected, true);

    // Monitoring must have started automatically without user clicking Start
    const state = harness.monitor.getState();
    assert.equal(state.monitoring, true);
    assert.equal(state.connected, true);

    // UI statuses must reflect LIVE MONITORING ACTIVE
    assert.equal(harness.elements.connectionStatus.textContent, 'LIVE MONITORING ACTIVE');
    assert.match(harness.elements.monitoringStatus.textContent, /LIVE MONITORING ACTIVE/);
    assert.equal(harness.elements.startButton.disabled, true);
    assert.equal(harness.elements.stopButton.disabled, false);

    // Frame capture loop started immediately
    assert.ok(harness.getFrameCount() >= 1);
});

test('AutoMonitoring: No monitoring starts before permission is granted or if denied', async () => {
    const harness = createTestHarness({ permissionDenied: true, autoStart: true });

    const connected = await harness.monitor.connect();
    assert.equal(connected, false);

    const state = harness.monitor.getState();
    assert.equal(state.monitoring, false);
    assert.equal(state.connected, false);
    assert.equal(harness.elements.connectionStatus.textContent, 'Permission denied');
    assert.equal(harness.getFrameCount(), 0);
});

test('AutoMonitoring: Requires first usable frame before auto-starting', async () => {
    const harness = createTestHarness({ simulateEmptyFrame: true, autoStart: true });
    // Video not ready
    harness.video.readyState = 0;
    harness.video.videoWidth = 0;

    await harness.monitor.connect();

    const state = harness.monitor.getState();
    // Since no usable frame and video unready, monitoring does not auto-start
    assert.equal(state.monitoring, false);
});

test('AutoMonitoring: Prevents duplicate monitoring loops on multiple calls', async () => {
    const harness = createTestHarness({ autoStart: true });
    await harness.monitor.connect();

    const activeTimersBefore = Array.from(harness.timers.values()).filter(t => !t.cleared).length;
    assert.equal(activeTimersBefore, 1);

    // Calling startMonitoring while already monitoring returns false and creates no extra timers
    const secondStart = harness.monitor.startMonitoring();
    assert.equal(secondStart, false);

    const activeTimersAfter = Array.from(harness.timers.values()).filter(t => !t.cleared).length;
    assert.equal(activeTimersAfter, 1);
});

test('AutoMonitoring: Automatic stop after screen disconnection', async () => {
    const harness = createTestHarness({ autoStart: true });
    await harness.monitor.connect();
    assert.equal(harness.monitor.getState().monitoring, true);

    // User stops sharing from the browser tab
    harness.track.stop();

    const state = harness.monitor.getState();
    assert.equal(state.monitoring, false);
    assert.equal(state.connected, false);
    assert.equal(harness.elements.connectionStatus.textContent, 'Disconnected');
    assert.equal(harness.elements.frameFreshness.textContent, 'Screen disconnected');
});

test('AutoMonitoring: Automatic resume after reconnection', async () => {
    const harness = createTestHarness({ autoStart: true });
    await harness.monitor.connect();
    assert.equal(harness.monitor.getState().monitoring, true);

    // Track ends
    harness.track.stop();
    assert.equal(harness.monitor.getState().monitoring, false);

    // Reconnection
    harness.track.readyState = 'live';
    const reconnected = await harness.monitor.connect();
    assert.equal(reconnected, true);
    assert.equal(harness.monitor.getState().monitoring, true);
    assert.equal(harness.elements.connectionStatus.textContent, 'LIVE MONITORING ACTIVE');
});

test('AutoMonitoring: Manual STOP protection prevents automatic restart until reconnect or explicit start', async () => {
    const harness = createTestHarness({ autoStart: true });
    await harness.monitor.connect();
    assert.equal(harness.monitor.getState().monitoring, true);

    // User explicitly clicks STOP MONITORING
    harness.monitor.stopMonitoring('Stopped by user.', true);
    assert.equal(harness.monitor.getState().monitoring, false);
    assert.equal(harness.elements.stopButton.disabled, true);
    assert.equal(harness.elements.startButton.disabled, false);

    // Subsequent frame arrivals must NOT restart monitoring
    harness.advanceTimer(1);
    assert.equal(harness.monitor.getState().monitoring, false);

    // Only explicit startMonitoring or reconnect resumes monitoring
    harness.monitor.startMonitoring();
    assert.equal(harness.monitor.getState().monitoring, true);
});

test('Safety: Assistant contains zero automated clickers or order placement functions', () => {
    const harness = createTestHarness();
    assert.equal(typeof harness.monitor.clickBuy, 'undefined');
    assert.equal(typeof harness.monitor.clickSell, 'undefined');
    assert.equal(typeof harness.monitor.placeOrder, 'undefined');
    assert.equal(typeof harness.monitor.automateTrading, 'undefined');
});
