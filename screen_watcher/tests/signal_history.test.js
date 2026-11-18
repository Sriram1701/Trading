'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const history = require('../public/signal_history.js');

const appPath = path.join(__dirname, '..', 'public', 'app.js');
const clickerPath = path.join(__dirname, '..', 'auto_trader.py');
const htmlPath = path.join(__dirname, '..', 'public', 'index.html');

function makeRecord(id = 'signal-1') {
    return history.createSignalRecord({
        id,
        timestamp: '2025-01-01T00:00:00.000Z',
        direction: 'UP',
        timeframe: 'not verified',
        analysis: { source: 'unverified_screen_pixels' }
    });
}

test('empty history has no accuracy estimate', () => {
    assert.deepEqual(history.getValidationStatus([]), {
        label: 'Not Yet Validated',
        accuracy: null,
        verifiedSamples: 0
    });
});

test('manual outcome is recorded and never counted as verified', () => {
    const updated = history.recordManualOutcome([makeRecord()], 'signal-1', 'correct');
    assert.equal(updated[0].outcome.source, 'manual');
    assert.equal(updated[0].outcome.verified, false);
    assert.deepEqual(history.getValidationStatus(updated), {
        label: 'Not Yet Validated',
        accuracy: null,
        verifiedSamples: 0
    });
});

test('manual outcome rejects missing signals and duplicate outcome entry', () => {
    assert.throws(() => history.recordManualOutcome([], 'missing', 'correct'), /not found/);
    const updated = history.recordManualOutcome([makeRecord()], 'signal-1', 'incorrect');
    assert.throws(() => history.recordManualOutcome(updated, 'signal-1', 'correct'), /already been recorded/);
});

test('manual outcome samples do not produce an accuracy value', () => {
    const records = Array.from({ length: 29 }, (_, index) => ({
        ...makeRecord(`signal-${index}`),
        outcome: { result: 'correct', source: 'manual', verified: false }
    }));
    const status = history.getValidationStatus(records);
    assert.equal(status.label, 'Not Yet Validated');
    assert.equal(status.accuracy, null);
    assert.equal(status.verifiedSamples, 0);
});

test('history serialization round-trips signal records', () => {
    let serialized = null;
    const storage = {
        getItem: () => serialized,
        setItem: (key, value) => { serialized = value; }
    };
    const records = [makeRecord()];
    history.saveHistory(storage, 'history', records);
    assert.deepEqual(history.loadHistory(storage, 'history'), records);
});

test('saved outcomes cannot self-label as verified', () => {
    const storage = {
        getItem: () => JSON.stringify([{
            ...makeRecord(),
            outcome: { result: 'correct', source: 'verified', verified: true }
        }])
    };
    assert.throws(() => history.loadHistory(storage, 'history'), /manual and unverified/);
});

test('screen watcher has no clicker request and clicker launcher is inert', () => {
    const appSource = fs.readFileSync(appPath, 'utf8');
    const clickerSource = fs.readFileSync(clickerPath, 'utf8');
    assert.doesNotMatch(appSource, /localhost:3001|fetch\s*\(/i);
    assert.doesNotMatch(clickerSource, /pyautogui|Flask|app\.run|localhost:3001/i);

    const python = spawnSync('python', [clickerPath], { encoding: 'utf8' });
    assert.equal(python.status, 0, python.stderr || python.stdout);
    assert.match(python.stdout, /DISABLED/);
});

test('screen watcher references only elements present in its HTML', () => {
    const appSource = fs.readFileSync(appPath, 'utf8');
    const htmlSource = fs.readFileSync(htmlPath, 'utf8');
    const htmlIds = new Set(Array.from(htmlSource.matchAll(/\bid="([^"]+)"/g), match => match[1]));
    const scriptIds = Array.from(appSource.matchAll(/byId\('([^']+)'\)/g), match => match[1]);
    assert.ok(scriptIds.length > 0);
    for (const id of scriptIds) {
        assert.ok(htmlIds.has(id), `Missing HTML element with id="${id}"`);
    }
});
