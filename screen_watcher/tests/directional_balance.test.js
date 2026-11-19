'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const extractorApi = require('../public/local_chart_extractor.js');
const engineApi = require('../public/local_technical_engine.js');
const validatorApi = require('../public/final_signal_validator.js');

test('Directional Balance: 1. Strong Bullish Trend generates STRONG UP signal', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();
    const now = 1700000000000;

    const bullishTrendSetup = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        lastCompletedCandle: {
            id: 'candle_bull_1',
            polarity: 'BULLISH',
            height: 28,
            body: { height: 22, top: 20, bottom: 42 },
            wicks: { upper: 2, lower: 4 },
            pattern: 'NORMAL'
        },
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    };

    const localResult = engine.evaluate(bullishTrendSetup, now);
    assert.equal(localResult.candidate, 'UP');
    assert.equal(localResult.signal_strength, 'STRONG');
    assert.equal(localResult.confidence_tier, 'HIGH');
    assert.ok(localResult.supportingEvidence.some(e => e.includes('bullish')));
    assert.ok(localResult.supportingEvidence.some(e => e.includes('riding upper Bollinger Band')));
    assert.equal(localResult.conflictingEvidence.length, 0);

    const validated = validator.validate({ localResult, now });
    assert.equal(validated.direction, 'UP');
    assert.equal(validated.signal_strength, 'STRONG');
    assert.equal(validated.quality_level, 'STRONG UP');
    assert.equal(validated.confidence, 'HIGH');
    assert.equal(validated.audit.approved, true);
});

test('Directional Balance: 2. Strong Bearish Trend generates STRONG DOWN signal', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();
    const now = 1700000000000;

    const bearishTrendSetup = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BEARISH',
        priceStructure: 'LOWER_HIGHS_LOWER_LOWS',
        movingAverage: 'BEARISH',
        lastCompletedCandle: {
            id: 'candle_bear_1',
            polarity: 'BEARISH',
            height: 28,
            body: { height: 22, top: 40, bottom: 62 },
            wicks: { upper: 3, lower: 3 },
            pattern: 'NORMAL'
        },
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };

    const localResult = engine.evaluate(bearishTrendSetup, now);
    assert.equal(localResult.candidate, 'DOWN');
    assert.equal(localResult.signal_strength, 'STRONG');
    assert.equal(localResult.confidence_tier, 'HIGH');
    assert.ok(localResult.supportingEvidence.some(e => e.includes('bearish')));
    assert.ok(localResult.supportingEvidence.some(e => e.includes('riding lower Bollinger Band')));
    assert.equal(localResult.conflictingEvidence.length, 0);

    const validated = validator.validate({ localResult, now });
    assert.equal(validated.direction, 'DOWN');
    assert.equal(validated.signal_strength, 'STRONG');
    assert.equal(validated.quality_level, 'STRONG DOWN');
    assert.equal(validated.confidence, 'HIGH');
    assert.equal(validated.audit.approved, true);
});

test('Directional Balance: 3. Bullish Reversal at Lower Band Support with Oversold RSI is NOT blocked by Reversal Trap', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();
    const now = 1700000000000;

    // Prior candle sequence was BEARISH, but price reaches lower band support, RSI oversold rebounds, and a Hammer forms
    const bullishReversalSetup = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BEARISH', // Prior sequence was bearish!
        lastCompletedCandle: {
            id: 'candle_rev_up',
            polarity: 'BULLISH',
            height: 24,
            body: { height: 8, top: 120, bottom: 128 },
            wicks: { upper: 1, lower: 15 },
            pattern: 'HAMMER'
        },
        bollingerPosition: 'LOWER_BAND_BOUNCE',
        rsiVisualZone: 'OVERSOLD',
        rsiSlope: 'RISING'
    };

    const localResult = engine.evaluate(bullishReversalSetup, now);
    assert.equal(localResult.candidate, 'UP');
    assert.equal(localResult.conflictingEvidence.length, 0, 'Reversal trap must not create a false trend conflict on support bounce');
    assert.ok(localResult.supportingEvidence.some(e => e.includes('Hammer')));
    assert.ok(localResult.supportingEvidence.some(e => e.includes('lower Bollinger Band support and bounced')));
    assert.ok(localResult.supportingEvidence.some(e => e.includes('RSI 14 rebounded')));

    const validated = validator.validate({ localResult, now });
    assert.equal(validated.direction, 'UP');
    assert.equal(validated.audit.approved, true);
});

test('Directional Balance: 4. Bearish Reversal at Upper Band Resistance with Overbought RSI is NOT blocked by Reversal Trap', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();
    const now = 1700000000000;

    // Prior candle sequence was BULLISH, but price reaches upper band resistance, RSI overbought rejects, and Shooting Star forms
    const bearishReversalSetup = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BULLISH', // Prior sequence was bullish!
        lastCompletedCandle: {
            id: 'candle_rev_down',
            polarity: 'BEARISH',
            height: 24,
            body: { height: 8, top: 30, bottom: 38 },
            wicks: { upper: 15, lower: 1 },
            pattern: 'SHOOTING_STAR'
        },
        bollingerPosition: 'UPPER_BAND_REJECTION',
        rsiVisualZone: 'OVERBOUGHT',
        rsiSlope: 'FALLING'
    };

    const localResult = engine.evaluate(bearishReversalSetup, now);
    assert.equal(localResult.candidate, 'DOWN');
    assert.equal(localResult.conflictingEvidence.length, 0, 'Reversal trap must not create a false trend conflict on resistance rejection');
    assert.ok(localResult.supportingEvidence.some(e => e.includes('Shooting Star')));
    assert.ok(localResult.supportingEvidence.some(e => e.includes('upper Bollinger Band resistance and rejected')));
    assert.ok(localResult.supportingEvidence.some(e => e.includes('RSI 14 rejected')));

    const validated = validator.validate({ localResult, now });
    assert.equal(validated.direction, 'DOWN');
    assert.equal(validated.audit.approved, true);
});

test('Directional Balance: 5. Bullish Trend Continuation (Upper Band Walk) is NOT blocked by Uptrend Continuation Trap', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();
    const now = 1700000000000;

    // Price is near top of chart in strong uptrend; UPPER_BAND_WALK with green candle must NOT conflict with resistance
    const continuationUp = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        lastCompletedCandle: {
            id: 'candle_walk_up',
            polarity: 'BULLISH',
            height: 25,
            body: { height: 20, top: 15, bottom: 35 },
            wicks: { upper: 2, lower: 3 },
            pattern: 'NORMAL'
        },
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    };

    const localResult = engine.evaluate(continuationUp, now);
    assert.equal(localResult.candidate, 'UP');
    assert.equal(localResult.conflictingEvidence.length, 0, 'Upper Band Walk must not be treated as resistance conflict against bullish candle');
    assert.ok(localResult.supportingEvidence.some(e => e.includes('riding upper Bollinger Band')));

    const validated = validator.validate({ localResult, now });
    assert.equal(validated.direction, 'UP');
    assert.equal(validated.audit.approved, true);
});

test('Directional Balance: 6. Bearish Trend Continuation (Lower Band Walk) generates DOWN signal', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();
    const now = 1700000000000;

    const continuationDown = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BEARISH',
        priceStructure: 'LOWER_HIGHS_LOWER_LOWS',
        lastCompletedCandle: {
            id: 'candle_walk_down',
            polarity: 'BEARISH',
            height: 25,
            body: { height: 20, top: 120, bottom: 140 },
            wicks: { upper: 3, lower: 2 },
            pattern: 'NORMAL'
        },
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };

    const localResult = engine.evaluate(continuationDown, now);
    assert.equal(localResult.candidate, 'DOWN');
    assert.equal(localResult.conflictingEvidence.length, 0);
    assert.ok(localResult.supportingEvidence.some(e => e.includes('riding lower Bollinger Band')));

    const validated = validator.validate({ localResult, now });
    assert.equal(validated.direction, 'DOWN');
    assert.equal(validated.audit.approved, true);
});

test('Directional Balance: 7. Sideways / Range-Bound Market without Confluence yields WAIT', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();
    const now = 1700000000000;

    const sidewaysSetup = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'NEUTRAL',
        priceStructure: 'SIDEWAYS',
        lastCompletedCandle: {
            id: 'candle_side_1',
            polarity: 'BULLISH',
            height: 12,
            body: { height: 8, top: 70, bottom: 78 },
            wicks: { upper: 2, lower: 2 },
            pattern: 'NORMAL'
        },
        bollingerPosition: 'MIDDLE',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FLAT'
    };

    const localResult = engine.evaluate(sidewaysSetup, now);
    assert.equal(localResult.candidate, 'WAIT');
    assert.match(localResult.waitReason, /independent momentum \(RSI\) or volatility \(Bollinger\) confirmation is missing/i);

    const validated = validator.validate({ localResult, now });
    assert.equal(validated.direction, 'WAIT');
    assert.equal(validated.audit.approved, false);
});

test('Directional Balance: 8. Conflicting Indicator Conditions symmetrically reject both UP and DOWN', () => {
    const engine = engineApi.createEngine();

    // Bullish candle + Bearish Falling Momentum
    const conflictUp = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BULLISH',
        lastCompletedCandle: { polarity: 'BULLISH', height: 20 },
        bollingerPosition: 'MIDDLE',
        rsiVisualZone: 'OVERBOUGHT',
        rsiSlope: 'FALLING'
    };
    const resConflictUp = engine.evaluate(conflictUp);
    assert.equal(resConflictUp.candidate, 'WAIT');
    assert.ok(resConflictUp.conflictingEvidence.some(e => e.includes('conflicts with falling bearish momentum')));

    // Bearish candle + Bullish Rising Momentum
    const conflictDown = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BEARISH',
        lastCompletedCandle: { polarity: 'BEARISH', height: 20 },
        bollingerPosition: 'MIDDLE',
        rsiVisualZone: 'OVERSOLD',
        rsiSlope: 'RISING'
    };
    const resConflictDown = engine.evaluate(conflictDown);
    assert.equal(resConflictDown.candidate, 'WAIT');
    assert.ok(resConflictDown.conflictingEvidence.some(e => e.includes('conflicts with rising bullish momentum')));
});

test('Directional Balance: 9. Incomplete / Forming Candle produces WAIT with explicit notice', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();
    const now = 1700000000000;

    const formingCandleSetup = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: false, // Actively forming candle
        visualTrend: 'BULLISH',
        lastCompletedCandle: { polarity: 'BULLISH', height: 20 },
        bollingerPosition: 'LOWER_BAND_TEST',
        rsiVisualZone: 'OVERSOLD',
        rsiSlope: 'RISING'
    };

    const localResult = engine.evaluate(formingCandleSetup, now);
    assert.equal(localResult.candidate, 'WAIT');
    assert.match(localResult.waitReason, /awaiting confirmed candle close/i);

    const validated = validator.validate({ localResult, now });
    assert.equal(validated.direction, 'WAIT');
    assert.match(validated.explanation, /awaiting confirm(ed)? candle close/i);
});

test('Directional Balance: 10. Low Volatility / Doji Consolidation candle produces WAIT', () => {
    const engine = engineApi.createEngine();

    const dojiSetup = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'NEUTRAL',
        lastCompletedCandle: {
            id: 'candle_doji',
            polarity: 'BULLISH',
            height: 16,
            body: { height: 1, top: 75, bottom: 76 },
            wicks: { upper: 8, lower: 7 },
            pattern: 'DOJI'
        },
        bollingerPosition: 'LOWER_BAND_TEST',
        rsiVisualZone: 'OVERSOLD',
        rsiSlope: 'RISING'
    };

    const res = engine.evaluate(dojiSetup);
    assert.equal(res.candidate, 'WAIT');
    assert.ok(res.conflictingEvidence.some(e => e.includes('Doji')));
});

test('Directional Balance: 11. Symmetrical generation check: Equal candidate generation and pass rate for UP and DOWN', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();

    // Symmetrical Pairs:
    // Pair A: Mean Reversion Bounce / Rejection
    const upReversion = {
        isValid: true,
        isReadable: true,
        candleCompleted: true,
        lastCompletedCandle: { polarity: 'BULLISH', height: 20 },
        bollingerPosition: 'LOWER_BAND_BOUNCE',
        rsiVisualZone: 'OVERSOLD',
        rsiSlope: 'RISING'
    };
    const downReversion = {
        isValid: true,
        isReadable: true,
        candleCompleted: true,
        lastCompletedCandle: { polarity: 'BEARISH', height: 20 },
        bollingerPosition: 'UPPER_BAND_REJECTION',
        rsiVisualZone: 'OVERBOUGHT',
        rsiSlope: 'FALLING'
    };

    const resUpRev = engine.evaluate(upReversion);
    const resDownRev = engine.evaluate(downReversion);
    assert.equal(resUpRev.candidate, 'UP');
    assert.equal(resDownRev.candidate, 'DOWN');
    assert.equal(resUpRev.confidence_tier, resDownRev.confidence_tier);
    assert.equal(resUpRev.signal_strength, resDownRev.signal_strength);

    const valUpRev = validator.validate({ localResult: resUpRev });
    const valDownRev = validator.validate({ localResult: resDownRev });
    assert.equal(valUpRev.direction, 'UP');
    assert.equal(valDownRev.direction, 'DOWN');
    assert.equal(valUpRev.signal_strength, valDownRev.signal_strength);

    // Pair B: Trend Continuation
    const upContinuation = {
        isValid: true,
        isReadable: true,
        candleCompleted: true,
        visualTrend: 'BULLISH',
        lastCompletedCandle: { polarity: 'BULLISH', height: 24 },
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    };
    const downContinuation = {
        isValid: true,
        isReadable: true,
        candleCompleted: true,
        visualTrend: 'BEARISH',
        lastCompletedCandle: { polarity: 'BEARISH', height: 24 },
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };

    const resUpCont = engine.evaluate(upContinuation);
    const resDownCont = engine.evaluate(downContinuation);
    assert.equal(resUpCont.candidate, 'UP');
    assert.equal(resDownCont.candidate, 'DOWN');
    assert.equal(resUpCont.confidence_tier, resDownCont.confidence_tier);

    const valUpCont = validator.validate({ localResult: resUpCont });
    const valDownCont = validator.validate({ localResult: resDownCont });
    assert.equal(valUpCont.direction, 'UP');
    assert.equal(valDownCont.direction, 'DOWN');
});

test('Directional Balance: 12. Ghost RSI prevention: Horizontal bottom axis line does NOT create false overbought or falling RSI', () => {
    const extractor = extractorApi.createExtractor();

    // Create an image buffer with candles in center and a horizontal line across the bottom axis (y = 80%)
    const width = 320;
    const height = 180;
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill background dark
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 16;
        data[i + 1] = 22;
        data[i + 2] = 34;
        data[i + 3] = 255;
    }

    // Add 3 valid green candles in chart area (x in [50, 150], y in [40, 90])
    for (let c = 0; c < 3; c += 1) {
        const startX = 60 + c * 30;
        for (let x = startX; x < startX + 8; x += 1) {
            for (let y = 50; y < 85; y += 1) {
                const off = (y * width + x) * 4;
                data[off] = 20;
                data[off + 1] = 180; // bright green
                data[off + 2] = 80;
                data[off + 3] = 255;
            }
        }
    }

    // Add static horizontal time axis line at y = 145 (sub-panel area y in [142, 172])
    // Color matches subpanel curve filter: b > 130 && r > 100
    const staticY = 145;
    for (let x = 20; x < 260; x += 1) {
        const off = (staticY * width + x) * 4;
        data[off] = 115;
        data[off + 1] = 125;
        data[off + 2] = 150;
        data[off + 3] = 255;
    }

    const img = { width, height, data };
    const extracted = extractor.extract(img);

    // Sub-panel must NOT falsely detect static flat axis line as a falling overbought RSI oscillator
    assert.equal(extracted.rsiVisualZone, 'NEUTRAL', 'Static horizontal line must be rejected as ghost RSI');
    assert.equal(extracted.rsiSlope, 'FLAT', 'Static horizontal line must have FLAT slope, not FALLING');
});
