'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const extractorApi = require('../public/local_chart_extractor.js');
const engineApi = require('../public/local_technical_engine.js');
const validatorApi = require('../public/final_signal_validator.js');

/**
 * Helper to decode a JPG frame to RGBA ImageData format using ffmpeg.
 */
function loadJpgFrame(relativePath) {
    const fullPath = path.resolve(__dirname, '../../', relativePath);
    if (!fs.existsSync(fullPath)) {
        return null;
    }
    try {
        const raw = execSync(`ffmpeg -v error -i "${fullPath}" -f rawvideo -pix_fmt rgba pipe:1`, {
            maxBuffer: 50 * 1024 * 1024
        });
        const probe = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${fullPath}"`).toString().trim();
        const [width, height] = probe.split('x').map(Number);
        return {
            width,
            height,
            data: new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength)
        };
    } catch {
        return null;
    }
}

test('Regression Frame 03: Actual candles detected with proper stride; indicator lines do not merge into mega-blobs', (t) => {
    const frame = loadJpgFrame('debug_frames_220529/frame_03.jpg');
    if (!frame) {
        t.skip('debug_frames_220529/frame_03.jpg not available in test environment');
        return;
    }

    const extractor = extractorApi.createExtractor();
    const extracted = extractor.extract(frame, 1000);

    assert.equal(extracted.isValid, true);
    assert.equal(extracted.isReadable, true);
    assert.equal(extracted.dataQuality, 'VISUAL_ESTIMATE');

    // Real chart has at least 12 distinct visible candles
    assert.ok(extracted.candlesCount >= 12, `Expected >= 12 candles, found ${extracted.candlesCount}`);

    // Verify indicator lines did not merge into mega-blobs (> 6% of screen width)
    const maxWidth = Math.floor(frame.width * 0.06);
    if (extracted.candles) {
        for (const candle of extracted.candles) {
            assert.ok(candle.width <= maxWidth, `Candle width ${candle.width} exceeded max limit ${maxWidth}`);
            assert.ok(candle.height >= 4, `Candle height ${candle.height} too small`);
        }
    }
});

test('Regression Frame 03: Trade panel buttons and header elements are strictly excluded from candles', (t) => {
    const frame = loadJpgFrame('debug_frames_220529/frame_03.jpg');
    if (!frame) {
        t.skip('debug_frames_220529/frame_03.jpg not available in test environment');
        return;
    }

    const extractor = extractorApi.createExtractor();
    const extracted = extractor.extract(frame, 1000);

    const maxChartX = Math.floor(frame.width * 0.75);
    const minChartY = Math.floor(frame.height * 0.24);

    if (extracted.candles) {
        for (const candle of extracted.candles) {
            assert.ok(candle.centerX <= maxChartX, `Candle centerX ${candle.centerX} contaminated by right trade panel (> ${maxChartX})`);
            assert.ok(candle.minY >= minChartY, `Candle minY ${candle.minY} contaminated by top header (< ${minChartY})`);
        }
    }
});

test('Regression Frame 03: False DOWN signal during recorded bullish rally is completely rejected', (t) => {
    const frame = loadJpgFrame('debug_frames_220529/frame_03.jpg');
    if (!frame) {
        t.skip('debug_frames_220529/frame_03.jpg not available in test environment');
        return;
    }

    const extractor = extractorApi.createExtractor();
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();

    const extracted = extractor.extract(frame, 1000);
    const evaluated = engine.evaluate(extracted, 1000);
    const validated = validator.validate({ localResult: evaluated, now: 1000 });

    // The audit showed this frame produced a false DOWN desktop notification during a strong bullish surge.
    // Under the fixed logic, it must NEVER generate a DOWN signal!
    assert.notEqual(validated.direction, 'DOWN', 'False DOWN signal was generated during bullish rally!');
    assert.equal(validated.direction, 'WAIT', 'Expected WAIT state during unconfirmed market condition');
});

test('Regression Frame 04: Detects actual large bearish reversal candle at x ≈ 642', (t) => {
    const frame = loadJpgFrame('debug_frames/frame_04.jpg');
    if (!frame) {
        t.skip('debug_frames/frame_04.jpg not available in test environment');
        return;
    }

    const extractor = extractorApi.createExtractor();
    const extracted = extractor.extract(frame, 1000);

    assert.equal(extracted.isValid, true);
    assert.equal(extracted.isReadable, true);

    // Look for the prominent bearish candle at x ≈ 642 with height > 100px
    assert.ok(extracted.candles && extracted.candles.length > 0);
    const reversalCandle = extracted.candles.find(c => c.centerX >= 620 && c.centerX <= 665 && c.polarity === 'BEARISH');

    assert.ok(reversalCandle, 'Expected large bearish reversal candle around x ≈ 642 not found');
    assert.equal(reversalCandle.polarity, 'BEARISH');
    assert.ok(reversalCandle.height >= 100, `Expected height >= 100, got ${reversalCandle.height}`);
});

test('Regression: Forming candle is never marked completed on initial frame observation', (t) => {
    const frame = loadJpgFrame('debug_frames_220529/frame_03.jpg');
    if (!frame) {
        t.skip('debug_frames_220529/frame_03.jpg not available in test environment');
        return;
    }

    const extractor = extractorApi.createExtractor();
    const extracted = extractor.extract(frame, 1000);

    assert.equal(extracted.candleCompleted, false, 'Initial frame observation must not report candleCompleted = true');
    assert.equal(extracted.formingCandle.isCompleted, false, 'Forming candle must have isCompleted = false');
});

test('Regression: Missing indicators cannot produce synthetic confirmation', (t) => {
    const engine = engineApi.createEngine();

    // Setup with candle but UNAVAILABLE indicators
    const missingIndicatorSetup = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BEARISH',
        lastCompletedCandle: { polarity: 'BEARISH', height: 25 },
        bollingerPosition: 'UNAVAILABLE',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FLAT'
    };

    const result = engine.evaluate(missingIndicatorSetup, 1000);
    assert.equal(result.candidate, 'WAIT');
    assert.match(result.waitReason, /independent momentum \(RSI\) or volatility \(Bollinger\) confirmation is missing/i);
    assert.equal(result.supportingEvidence.length, 0);
});
