'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const notifications = require('../public/signal_notifications.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

test('unvalidated directional data becomes WAIT and never sounds', () => {
    const waits = [];
    const sounds = [];
    const controller = notifications.createController({
        onWait: reason => waits.push(reason),
        playSound: direction => sounds.push(direction)
    });

    assert.equal(controller.notifyValidated({
        id: 'unvalidated-up',
        direction: 'UP',
        validation_status: 'NOT_VALIDATED',
        reason: 'Strategy has not passed validation.'
    }), true);
    assert.deepEqual(waits, ['Strategy has not passed validation.']);
    assert.deepEqual(sounds, []);
});

test('a validated signal sounds once per unique id and separates directions', () => {
    const signals = [];
    const sounds = [];
    const controller = notifications.createController({
        onSignal: signal => signals.push(signal.id),
        playSound: (direction, id) => sounds.push([direction, id])
    });
    const up = { id: 'up-1', direction: 'UP', validation_status: 'VALIDATED' };
    const down = { id: 'down-1', direction: 'DOWN', validation_status: 'VALIDATED' };

    assert.equal(controller.notifyValidated(up), true);
    assert.equal(controller.notifyValidated(up), false);
    assert.equal(controller.notifyValidated(down), true);
    assert.deepEqual(signals, ['up-1', 'down-1']);
    assert.deepEqual(sounds, [['UP', 'up-1'], ['DOWN', 'down-1']]);
});

test('MOCKED screenshot analyses notify once by id and never treat WAIT as directional', () => {
    const analyses = [];
    const sounds = [];
    const controller = notifications.createController({
        onScreenshotAnalysis: analysis => analyses.push(analysis.id),
        playSound: (direction, id) => sounds.push([direction, id])
    });
    const up = {
        id: 'screenshot-1',
        analysis_type: 'SCREENSHOT_VISUAL',
        validation_status: 'NOT_VALIDATED',
        direction: 'UP'
    };

    assert.equal(controller.notifyScreenshotAnalysis(up), true);
    assert.equal(controller.notifyScreenshotAnalysis(up), false);
    assert.equal(controller.notifyScreenshotAnalysis({
        id: 'screenshot-wait',
        analysis_type: 'SCREENSHOT_VISUAL',
        direction: 'WAIT'
    }), false);
    assert.deepEqual(analyses, ['screenshot-1']);
    assert.deepEqual(sounds, [['UP', 'screenshot-1']]);
});

test('identical WAIT states are reported once and never sound', () => {
    const waits = [];
    const sounds = [];
    const controller = notifications.createController({
        onWait: reason => waits.push(reason),
        playSound: direction => sounds.push(direction)
    });

    assert.equal(controller.notifyWait('WAIT — DATA NOT VERIFIED.'), true);
    assert.equal(controller.notifyWait('WAIT — DATA NOT VERIFIED.'), false);
    assert.equal(controller.notifyWait('WAIT — DATA UNAVAILABLE.'), true);
    assert.deepEqual(waits, ['WAIT — DATA NOT VERIFIED.', 'WAIT — DATA UNAVAILABLE.']);
    assert.deepEqual(sounds, []);
});

test('directional controls are disabled and audio has explicit user controls', () => {
    assert.match(html, /class="direction-button up-button" disabled/);
    assert.match(html, /class="direction-button down-button" disabled/);
    assert.match(html, /id="chimeEnabledToggle"/);
    assert.match(html, /id="testAudioBtn"/);
    assert.match(html, /id="openHistoryBtn"/);
    assert.match(html, /id="soundStatus"/);
    assert.match(appSource, /audioToggle\.checked/);
    assert.match(appSource, /historyMenu\.open = true/);
    assert.doesNotMatch(appSource, /pyautogui|localhost:3001|fetch\s*\(/i);
});

test('sound playback is muted by default and resumes audio only through the browser API', async () => {
    const elements = new Map();
    const oscillators = [];
    class FakeElement {
        constructor(id) {
            this.id = id;
            this.checked = false;
            this.listeners = {};
            this.textContent = '';
        }

        addEventListener(name, callback) {
            this.listeners[name] = callback;
        }
    }
    [
        'chimeEnabledToggle', 'soundStatus', 'historyList', 'validationStatus',
        'testAudioBtn', 'openHistoryBtn'
    ].forEach(id => elements.set(id, new FakeElement(id)));

    class FakeAudioContext {
        constructor() {
            this.state = 'suspended';
            this.currentTime = 1;
            this.destination = {};
        }

        async resume() {
            this.state = 'running';
        }

        createOscillator() {
            const oscillator = {
                frequency: { setValueAtTime(value) { oscillator.frequencyValue = value; } },
                connect() {},
                start() {},
                stop() {}
            };
            oscillators.push(oscillator);
            return oscillator;
        }

        createGain() {
            return {
                gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
                connect() {}
            };
        }
    }

    const window = { AudioContext: FakeAudioContext };
    vm.runInNewContext(appSource, {
        document: {
            getElementById: id => elements.get(id) || null,
            querySelector: () => null
        },
        window,
        console
    });

    assert.equal(await window.playSignalSound('UP'), false);
    assert.equal(oscillators.length, 0);
    elements.get('chimeEnabledToggle').checked = true;
    assert.equal(await window.playSignalSound('UP'), true);
    assert.deepEqual(oscillators.map(oscillator => oscillator.frequencyValue), [660, 880]);
    assert.equal(elements.get('soundStatus').textContent, 'On');
    oscillators.length = 0;
    assert.equal(await window.playSignalSound('DOWN'), true);
    assert.deepEqual(oscillators.map(oscillator => oscillator.frequencyValue), [440, 330]);
    elements.get('chimeEnabledToggle').checked = false;
    assert.equal(await window.playSignalSound('DOWN'), false);
    assert.equal(oscillators.length, 2);
});

test('desktop screenshot notifications request permission after user opt-in', async () => {
    const elements = new Map();
    const notifications = [];
    class Toggle {
        constructor() {
            this.checked = false;
            this.disabled = false;
            this.listeners = {};
            this.textContent = '';
        }

        addEventListener(name, callback) {
            this.listeners[name] = callback;
        }
    }
    class FakeNotification {
        static permission = 'default';

        static async requestPermission() {
            FakeNotification.permission = 'granted';
            return FakeNotification.permission;
        }

        constructor(title, options) {
            notifications.push({ title, options });
        }
    }
    ['desktopNotificationsToggle', 'notificationPermissionStatus'].forEach(id => elements.set(id, new Toggle()));
    const windowRef = { Notification: FakeNotification };
    vm.runInNewContext(appSource, {
        document: {
            getElementById: id => elements.get(id) || null,
            querySelector: () => null
        },
        window: windowRef,
        Notification: FakeNotification,
        console
    });

    const toggle = elements.get('desktopNotificationsToggle');
    toggle.checked = true;
    await toggle.listeners.change();
    assert.match(elements.get('notificationPermissionStatus').textContent, /granted/);
    assert.equal(windowRef.showScreenshotNotification({
        id: 'screenshot-notification-1',
        direction: 'DOWN',
        explanation: 'Visual bias only.'
    }), true);
    assert.deepEqual(notifications.map(item => item.title), ['DOWN — Screenshot chart analysis']);
    assert.match(notifications[0].options.body, /Not validated/);
});
