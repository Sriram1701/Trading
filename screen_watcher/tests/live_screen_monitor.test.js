'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const monitorApi = require('../public/live_screen_monitor.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const monitorSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'live_screen_monitor.js'), 'utf8');

class FakeElement {
    constructor(id) {
        this.id = id;
        this.textContent = '';
        this.value = id === 'frameIntervalSelect' ? '1500' : '';
        this.disabled = false;
        this.hidden = id === 'livePreviewContainer';
        this.dataset = {};
        this.listeners = {};
    }

    addEventListener(name, callback) {
        this.listeners[name] = callback;
    }
}

function createHarness({ getDisplayMedia, observeFrame, unsupported = false } = {}) {
    const calls = [];
    const timers = new Map();
    const elements = {};
    [
        'connectButton', 'startButton', 'stopButton', 'intervalSelect',
        'connectionStatus', 'monitoringStatus', 'lastFrameTimestamp',
        'observationStatus', 'signalDirection', 'signalStatus'
    ].forEach(name => { elements[name] = new FakeElement(name); });
    const track = {
        readyState: 'live',
        muted: false,
        listeners: {},
        addEventListener(name, callback) {
            this.listeners[name] = callback;
        },
        stop() {
            this.readyState = 'ended';
        },
        emit(name) {
            if (this.listeners[name]) this.listeners[name]();
        }
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
        addEventListener(name, callback) { this.listeners[name] = callback; }
    };
    const windowRef = { addEventListener() {} };
    let timerId = 0;
    let frameCount = 0;
    let observerResets = 0;
    let time = 1700000000000;
    const mediaDevices = unsupported ? {} : {
        async getDisplayMedia(constraints) {
            calls.push(constraints);
            if (getDisplayMedia) return getDisplayMedia(constraints);
            return stream;
        }
    };
    const monitor = monitorApi.createMonitor({
        mediaDevices,
        video,
        preview,
        elements,
        captureFrame: () => {
            frameCount += 1;
            return { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) };
        },
        observeFrame: observeFrame || (() => ({
            chartVisibleCandidate: false,
            readable: false,
            visualQuality: 'UNCLEAR',
            coloredColumns: 0,
            chartRegionCandidate: null,
            frameDifference: 0,
            unchangedForMs: 0,
            possibleLayoutChange: false
        })),
        resetObserver: () => { observerResets += 1; },
        clearFrameCanvas() {},
        documentRef,
        windowRef,
        now: () => time,
        setIntervalFn: (callback, interval) => {
            timerId += 1;
            timers.set(timerId, { callback, interval, cleared: false });
            return timerId;
        },
        clearIntervalFn: id => {
            if (timers.has(id)) timers.get(id).cleared = true;
        },
        logger: { warn() {}, error() {} }
    });

    return {
        monitor, calls, timers, elements, track, stream, mediaDevices, video, preview, documentRef,
        getFrameCount: () => frameCount,
        getObserverResets: () => observerResets,
        setTime: value => { time = value; }
    };
}

test('screen connection requests video only and waits for explicit monitoring', async () => {
    const harness = createHarness();
    assert.equal(await harness.monitor.connect(), true);
    assert.deepEqual(harness.calls, [{ video: true, audio: false }]);
    assert.equal(harness.video.srcObject, harness.stream);
    assert.equal(harness.preview.hidden, false);
    assert.equal(harness.elements.startButton.disabled, false);
    assert.equal(harness.getFrameCount(), 0);
    assert.equal(harness.elements.signalDirection.textContent, 'WAIT');
});

test('permission denial is surfaced and does not start capture', async () => {
    const harness = createHarness({
        getDisplayMedia: () => {
            const error = new Error('denied');
            error.name = 'NotAllowedError';
            throw error;
        }
    });

    assert.equal(await harness.monitor.connect(), false);
    assert.match(harness.elements.connectionStatus.textContent, /Permission denied/);
    assert.match(harness.elements.monitoringStatus.textContent, /denied|cancelled/i);
    assert.equal(harness.preview.hidden, true);
    assert.equal(harness.elements.signalDirection.textContent, 'WAIT');
});

test('duplicate connect clicks cannot open multiple screen-share prompts', async () => {
    let provideStream;
    const harness = createHarness({
        getDisplayMedia: () => new Promise(resolve => { provideStream = resolve; })
    });

    const firstConnect = harness.monitor.connect();
    assert.equal(harness.elements.connectButton.disabled, true);
    assert.equal(await harness.monitor.connect(), false);
    assert.equal(harness.calls.length, 1);
    provideStream(harness.stream);
    assert.equal(await firstConnect, true);
});

test('frame sampling uses the selected interval and stop prevents later processing', async () => {
    const harness = createHarness();
    await harness.monitor.connect();
    assert.equal(harness.monitor.startMonitoring(), true);
    assert.equal(harness.getFrameCount(), 1);
    const timer = [...harness.timers.values()][0];
    assert.equal(timer.interval, 1500);
    timer.callback();
    assert.equal(harness.getFrameCount(), 2);
    assert.notEqual(harness.elements.lastFrameTimestamp.textContent, 'Not received');
    assert.match(harness.elements.observationStatus.textContent, /No chart-like colored marks/);
    const lastFrameTimestamp = harness.elements.lastFrameTimestamp.textContent;

    harness.monitor.stopMonitoring();
    assert.equal(timer.cleared, true);
    assert.equal(harness.monitor.getState().monitoring, false);
    assert.equal(harness.elements.lastFrameTimestamp.textContent, lastFrameTimestamp);
    timer.callback();
    assert.equal(harness.getFrameCount(), 2);
    assert.match(harness.elements.signalStatus.textContent, /WAIT — LIVE PRICE NOT VERIFIED/);
});

test('frozen frames are warned about and muted tracks stop usable sampling', async () => {
    const harness = createHarness({
        observeFrame: () => ({
            chartVisibleCandidate: true,
            readable: false,
            visualQuality: 'UNCLEAR',
            coloredColumns: 4,
            chartRegionCandidate: null,
            frameDifference: 0,
            unchangedForMs: 12000,
            possibleLayoutChange: false
        })
    });
    await harness.monitor.connect();
    harness.monitor.startMonitoring();
    assert.match(harness.elements.observationStatus.textContent, /Possible frozen frame/);

    harness.track.muted = true;
    harness.monitor.sampleFrame();
    assert.match(harness.elements.monitoringStatus.textContent, /muted/);
    assert.match(harness.elements.signalStatus.textContent, /WAIT — LIVE PRICE NOT VERIFIED/);
});

test('track end stops sampling, clears preview, and allows reconnect', async () => {
    const harness = createHarness();
    await harness.monitor.connect();
    harness.monitor.startMonitoring();
    const timer = [...harness.timers.values()][0];
    harness.track.readyState = 'ended';
    harness.track.emit('ended');

    assert.equal(harness.monitor.getState().monitoring, false);
    assert.equal(timer.cleared, true);
    assert.equal(harness.video.srcObject, null);
    assert.equal(harness.preview.hidden, true);
    assert.match(harness.elements.connectionStatus.textContent, /Disconnected/);
    assert.equal(harness.elements.connectButton.disabled, false);
    assert.equal(harness.elements.connectButton.textContent, 'RECONNECT LIVE SCREEN');

    const reconnectedTrack = {
        readyState: 'live',
        muted: false,
        addEventListener() {},
        stop() { this.readyState = 'ended'; }
    };
    const reconnectedStream = {
        getVideoTracks: () => [reconnectedTrack],
        getTracks: () => [reconnectedTrack]
    };
    harness.mediaDevices.getDisplayMedia = async () => reconnectedStream;
    assert.equal(await harness.monitor.connect(), true);
    assert.equal(harness.monitor.getState().connected, true);
    assert.equal(harness.preview.hidden, false);
});

test('frame gaps reset visual comparison and background status warns of throttling', async () => {
    const harness = createHarness();
    await harness.monitor.connect();
    harness.monitor.startMonitoring();
    harness.documentRef.visibilityState = 'hidden';
    harness.documentRef.listeners.visibilitychange();
    assert.match(harness.elements.monitoringStatus.textContent, /Background tab/);

    harness.setTime(1700000010000);
    harness.documentRef.visibilityState = 'visible';
    harness.documentRef.listeners.visibilitychange();
    assert.ok(harness.getObserverResets() >= 2);
});

test('sharing unsupported by the browser leaves the assistant in WAIT', async () => {
    const harness = createHarness({ unsupported: true });

    assert.equal(await harness.monitor.connect(), false);
    assert.match(harness.elements.connectionStatus.textContent, /unsupported/);
    assert.match(harness.elements.signalStatus.textContent, /WAIT — LIVE PRICE NOT VERIFIED/);
});

test('live screen monitor is exposed in the primary UI workflow', () => {
    assert.match(html, /id="connectLiveScreenBtn"/);
    assert.match(html, /id="startMonitoringBtn"/);
    assert.match(html, /id="stopMonitoringBtn"/);
    assert.match(html, /live_screen_monitor\.js/);
    assert.match(monitorSource, /getDisplayMedia/);
});
