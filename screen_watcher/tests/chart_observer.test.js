'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const observerApi = require('../public/chart_observer.js');

function makeFrame(width = 320, height = 180, color = [8, 12, 18, 255]) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let offset = 0; offset < data.length; offset += 4) {
        data.set(color, offset);
    }
    return { width, height, data };
}

function addColoredBars(frame) {
    const colors = [[220, 40, 55, 255], [30, 200, 110, 255]];
    [35, 75, 120, 185, 250].forEach((left, index) => {
        const color = colors[index % colors.length];
        for (let y = 55 + index % 3 * 8; y < 145 - index % 2 * 12; y += 1) {
            for (let x = left; x < left + 4; x += 1) {
                frame.data.set(color, (y * frame.width + x) * 4);
            }
        }
    });
    return frame;
}

test('blank or malformed frames do not claim a chart is visible', () => {
    const observer = observerApi.createObserver();
    assert.equal(observer.observe(makeFrame(), 1000).chartVisibleCandidate, false);
    assert.throws(() => observer.observe(null), /valid RGBA frame/);
});

test('colored chart-like marks are reported without creating OHLC values', () => {
    const observation = observerApi.createObserver().observe(addColoredBars(makeFrame()), 1000);
    assert.equal(observation.chartVisibleCandidate, true);
    assert.ok(observation.coloredColumns >= 3);
    assert.ok(observation.chartRegionCandidate);
    assert.equal(Object.prototype.hasOwnProperty.call(observation, 'open'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(observation, 'rsi'), false);
});

test('unchanged samples can flag a possible frozen frame and reset cleanly', () => {
    const observer = observerApi.createObserver();
    const frame = addColoredBars(makeFrame());
    observer.observe(frame, 1000);
    const unchanged = observer.observe(frame, 12000);
    assert.equal(unchanged.unchangedForMs, 11000);
    assert.equal(unchanged.frameDifference, 0);
    observer.reset();
    assert.equal(observer.observe(frame, 13000).unchangedForMs, 0);
});

test('large visual changes are flagged as possible layout changes only', () => {
    const observer = observerApi.createObserver();
    const dark = makeFrame();
    const checkerboard = makeFrame();
    for (let y = 0; y < checkerboard.height; y += 1) {
        for (let x = 0; x < checkerboard.width; x += 1) {
            if ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0) {
                checkerboard.data.set([220, 220, 220, 255], (y * checkerboard.width + x) * 4);
            }
        }
    }
    observer.observe(dark, 1000);
    assert.equal(observer.observe(checkerboard, 2000).possibleLayoutChange, true);
});
