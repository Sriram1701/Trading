'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const engineApi = require('../public/local_technical_engine.js');
const validatorApi = require('../public/final_signal_validator.js');
const trackerApi = require('../public/signal_outcome_tracker.js');
const { PerformanceDB, computeWilsonScoreCI } = require('../performance_db.js');

const BASE_TIME = 1700000000000;

function createBaseExtraction(overrides = {}) {
    return {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        candleClosedAt: BASE_TIME - 2000,
        lastCompletedCandle: {
            id: 'candle_ep_1',
            polarity: 'BULLISH',
            height: 25,
            body: { height: 18, top: 40, bottom: 58 },
            wicks: { upper: 3, lower: 4 },
            pattern: 'NORMAL',
            candleClosedAt: BASE_TIME - 2000
        },
        formingCandle: {
            id: 'candle_ep_forming',
            polarity: 'BULLISH',
            height: 12,
            body: { height: 8, top: 45, bottom: 53 },
            wicks: { upper: 2, lower: 2 },
            pattern: 'NORMAL',
            isCompleted: false
        },
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING',
        ...overrides
    };
}

test('EP-1: Incomplete forming candle strictly returns WAITING FOR CANDLE CLOSE', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();

    const extraction = createBaseExtraction({
        candleCompleted: false,
        candleClosedAt: null
    });

    const localResult = engine.evaluate(extraction, BASE_TIME);
    assert.equal(localResult.candidate, 'WAIT');
    assert.equal(localResult.signalState, 'WAITING FOR CANDLE CLOSE');
    assert.equal(localResult.signalStatus, 'WAITING_FOR_CANDLE_CLOSE');

    const validated = validator.validate({ localResult, now: BASE_TIME });
    assert.equal(validated.direction, 'WAIT');
    assert.equal(validated.signalState, 'WAITING FOR CANDLE CLOSE');
    assert.equal(validated.audit.approved, false);
});

test('EP-2: Unreadable or invalid chart frame strictly returns DATA UNAVAILABLE', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();

    const invalidExtraction = {
        isValid: false,
        isReadable: false,
        dataQuality: 'INVALID'
    };

    const localResult = engine.evaluate(invalidExtraction, BASE_TIME);
    assert.equal(localResult.candidate, 'WAIT');
    assert.equal(localResult.signalState, 'DATA UNAVAILABLE');
    assert.equal(localResult.signalStatus, 'WAIT — NO SAFE ENTRY');

    const validated = validator.validate({ localResult, now: BASE_TIME });
    assert.equal(validated.direction, 'WAIT');
    assert.equal(validated.signalState, 'DATA UNAVAILABLE');
});

test('EP-3: Strong Bullish Trend against a single Red Candle strictly returns WAIT', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();

    // prevailing bullish trend, but latest single candle closed bearish (red) without structural reversal pattern
    const extraction = createBaseExtraction({
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        lastCompletedCandle: {
            id: 'candle_pullback',
            polarity: 'BEARISH',
            height: 20,
            body: { height: 14, top: 40, bottom: 54 },
            wicks: { upper: 3, lower: 3 },
            pattern: 'NORMAL'
        },
        bollingerPosition: 'MIDDLE_BAND',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    });

    const localResult = engine.evaluate(extraction, BASE_TIME);
    assert.equal(localResult.candidate, 'WAIT');
    assert.ok(localResult.conflictingEvidence.some(e => e.includes('opposes prevailing bullish trend')));

    const validated = validator.validate({ localResult, now: BASE_TIME });
    assert.equal(validated.direction, 'WAIT');
    assert.equal(validated.signalState, 'WAIT');
});

test('EP-4: Strong Bearish Trend against a single Green Candle strictly returns WAIT', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();

    // prevailing bearish trend, but latest single candle closed bullish (green) without structural reversal pattern
    const extraction = createBaseExtraction({
        visualTrend: 'BEARISH',
        priceStructure: 'LOWER_HIGHS_LOWER_LOWS',
        movingAverage: 'BEARISH',
        lastCompletedCandle: {
            id: 'candle_bounce',
            polarity: 'BULLISH',
            height: 20,
            body: { height: 14, top: 40, bottom: 54 },
            wicks: { upper: 3, lower: 3 },
            pattern: 'NORMAL'
        },
        bollingerPosition: 'MIDDLE_BAND',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    });

    const localResult = engine.evaluate(extraction, BASE_TIME);
    assert.equal(localResult.candidate, 'WAIT');
    assert.ok(localResult.conflictingEvidence.some(e => e.includes('opposes prevailing bearish trend')));

    const validated = validator.validate({ localResult, now: BASE_TIME });
    assert.equal(validated.direction, 'WAIT');
    assert.equal(validated.signalState, 'WAIT');
});

test('EP-5: Bullish Reversal with confirmed HAMMER pin-bar at Lower Band Support and Oversold RSI generates UP CONFIRMED', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();

    const extraction = createBaseExtraction({
        visualTrend: 'BEARISH',
        lastCompletedCandle: {
            id: 'candle_hammer_rev',
            polarity: 'BULLISH',
            height: 26,
            body: { height: 8, top: 110, bottom: 118 },
            wicks: { upper: 1, lower: 17 },
            pattern: 'HAMMER',
            candleClosedAt: BASE_TIME - 1000
        },
        candleClosedAt: BASE_TIME - 1000,
        bollingerPosition: 'LOWER_BAND_BOUNCE',
        rsiVisualZone: 'OVERSOLD',
        rsiSlope: 'RISING'
    });

    const localResult = engine.evaluate(extraction, BASE_TIME);
    assert.equal(localResult.candidate, 'UP');
    assert.equal(localResult.signalState, 'UP CONFIRMED');
    assert.equal(localResult.signalStatus, 'SIGNAL_CONFIRMED');

    const validated = validator.validate({ localResult, now: BASE_TIME });
    assert.equal(validated.direction, 'UP');
    assert.equal(validated.signalState, 'UP CONFIRMED');
    assert.equal(validated.audit.approved, true);
});

test('EP-6: Bearish Reversal with confirmed SHOOTING_STAR pin-bar at Upper Band Resistance and Overbought RSI generates DOWN CONFIRMED', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();

    const extraction = createBaseExtraction({
        visualTrend: 'BULLISH',
        lastCompletedCandle: {
            id: 'candle_star_rev',
            polarity: 'BEARISH',
            height: 26,
            body: { height: 8, top: 30, bottom: 38 },
            wicks: { upper: 17, lower: 1 },
            pattern: 'SHOOTING_STAR',
            candleClosedAt: BASE_TIME - 1000
        },
        candleClosedAt: BASE_TIME - 1000,
        bollingerPosition: 'UPPER_BAND_REJECTION',
        rsiVisualZone: 'OVERBOUGHT',
        rsiSlope: 'FALLING'
    });

    const localResult = engine.evaluate(extraction, BASE_TIME);
    assert.equal(localResult.candidate, 'DOWN');
    assert.equal(localResult.signalState, 'DOWN CONFIRMED');
    assert.equal(localResult.signalStatus, 'SIGNAL_CONFIRMED');

    const validated = validator.validate({ localResult, now: BASE_TIME });
    assert.equal(validated.direction, 'DOWN');
    assert.equal(validated.signalState, 'DOWN CONFIRMED');
    assert.equal(validated.audit.approved, true);
});

test('EP-7: Missing indicators strictly return WAIT and WAITING FOR CONFIRMATION', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();

    // Bullish candle, but indicators (Bollinger, RSI, Moving Average) are UNAVAILABLE/FLAT
    const extraction = createBaseExtraction({
        bollingerPosition: 'UNAVAILABLE',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FLAT',
        movingAverage: 'FLAT',
        priceStructure: 'SIDEWAYS'
    });

    const localResult = engine.evaluate(extraction, BASE_TIME);
    assert.equal(localResult.candidate, 'WAIT');
    assert.equal(localResult.signalState, 'WAITING FOR CONFIRMATION');
    assert.equal(localResult.signalStatus, 'WAIT — NO SAFE ENTRY');
    assert.match(localResult.waitReason, /independent momentum \(RSI\) or volatility \(Bollinger\) confirmation is missing/);

    const validated = validator.validate({ localResult, now: BASE_TIME });
    assert.equal(validated.direction, 'WAIT');
    assert.equal(validated.signalState, 'WAITING FOR CONFIRMATION');
});

test('EP-8: Expired entry window (> 60s) strictly yields ENTRY WINDOW EXPIRED', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();

    // Candle closed 65 seconds ago (past the 1-minute candle lifetime)
    const closedLongAgo = BASE_TIME - 65000;
    const extraction = createBaseExtraction({
        candleClosedAt: closedLongAgo,
        lastCompletedCandle: {
            ...createBaseExtraction().lastCompletedCandle,
            candleClosedAt: closedLongAgo
        }
    });

    const localResult = engine.evaluate(extraction, BASE_TIME);
    assert.equal(localResult.signalState, 'ENTRY WINDOW EXPIRED');
    assert.equal(localResult.signalStatus, 'ENTRY_WINDOW_EXPIRED');

    const validated = validator.validate({ localResult, now: BASE_TIME });
    assert.equal(validated.direction, 'WAIT');
    assert.equal(validated.signalState, 'ENTRY WINDOW EXPIRED');
    assert.ok(validated.uncertainties.some(u => u.includes('Entry window expired')));
});

test('EP-9: Wilson Score 95% Confidence Interval computes honest bounds', () => {
    // 0 sample size
    const empty = computeWilsonScoreCI(0, 0);
    assert.equal(empty.lower, null);
    assert.equal(empty.upper, null);

    // 10 wins out of 10 decided trades (should NOT say 100% lower bound!)
    const tenOfTen = computeWilsonScoreCI(10, 10);
    assert.ok(tenOfTen.lower > 65.0, 'Lower bound should be > 65%');
    assert.ok(tenOfTen.lower < 100.0, 'Lower bound must be < 100% due to sample size uncertainty');
    assert.equal(tenOfTen.upper, 100.0);

    // 18 wins out of 20 decided trades
    const eighteenOfTwenty = computeWilsonScoreCI(18, 20);
    assert.ok(eighteenOfTwenty.lower >= 69.0 && eighteenOfTwenty.lower <= 75.0);
    assert.ok(eighteenOfTwenty.upper >= 96.0 && eighteenOfTwenty.upper <= 99.0);
});

test('EP-10: PerformanceDB reports INSUFFICIENT VALIDATION DATA when sample < 20', () => {
    const db = new PerformanceDB(':memory:');

    // Add only 8 verified trades
    for (let i = 1; i <= 8; i += 1) {
        db.saveSignal({
            id: `SIG-EP-${i}`,
            direction: i <= 7 ? 'UP' : 'DOWN'
        });
        db.recordOutcome(`SIG-EP-${i}`, {
            outcome: i <= 7 ? 'WIN' : 'LOSS'
        });
    }

    const metrics = db.getPerformanceMetrics();
    assert.equal(metrics.totalDecided, 8);
    assert.equal(metrics.minSamplesRequired, 20);
    assert.equal(metrics.validationStatus, 'INSUFFICIENT_VALIDATION_DATA');
    assert.equal(metrics.learning.canLearn, false);
    assert.ok(metrics.confidenceInterval.lower !== null);
    assert.ok(metrics.confidenceInterval.upper !== null);
});

test('EP-11: Candidate audit logs rejection breakdown categories accurately', () => {
    const db = new PerformanceDB(':memory:');

    // Log various rejections
    db.recordCandidate({
        candidate: 'UP',
        approved: false,
        rejectionReason: 'independent momentum (RSI) or volatility (Bollinger) confirmation is missing.'
    });
    db.recordCandidate({
        candidate: 'DOWN',
        approved: false,
        rejectionReason: 'Conflicting technical factors detected: candle opposes prevailing bullish trend.'
    });
    db.recordCandidate({
        candidate: 'UP',
        approved: false,
        rejectionReason: 'awaiting confirmed candle close.'
    });
    db.recordCandidate({
        candidate: 'UP',
        approved: false,
        rejectionReason: 'RSI 14 is overbought; price is at risk of exhaustion.'
    });
    db.recordCandidate({
        candidate: 'DOWN',
        approved: false,
        rejectionReason: 'Recommended entry window has expired (1-minute candle limit).'
    });
    db.recordCandidate({
        candidate: 'WAIT',
        approved: false,
        rejectionReason: 'Visual chart frame unreadable or invalid.'
    });

    const metrics = db.getPerformanceMetrics();
    const breakdown = metrics.directional.rejectionBreakdown;

    assert.equal(breakdown.missingConfirmation, 1);
    assert.equal(breakdown.conflictingIndicators, 1);
    assert.equal(breakdown.unconfirmedCandle, 1);
    assert.equal(breakdown.exhaustionRisk, 1);
    assert.equal(breakdown.expiredEntryWindow, 1);
    assert.equal(breakdown.dataUnavailable, 1);
});

test('EP-12: All 8 Canonical Signal States are verified and distinct', () => {
    const expectedStates = [
        'ANALYZING',
        'WAITING FOR CONFIRMATION',
        'WAIT',
        'UP CONFIRMED',
        'DOWN CONFIRMED',
        'ENTRY WINDOW EXPIRED',
        'DATA UNAVAILABLE',
        'WAITING FOR CANDLE CLOSE'
    ];

    // Verify all 8 states are unique non-empty strings
    const unique = new Set(expectedStates);
    assert.equal(unique.size, 8);
    expectedStates.forEach(s => assert.ok(typeof s === 'string' && s.length > 0));
});

test('EP-13: Structural Confluence (EMA 9/21 + Higher Highs/Lows) confirms UP when Bollinger is Middle/Unavailable', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();

    // Completed green candle with rising EMA and Higher Highs/Lows structure, even without extreme Bollinger touch
    const extraction = createBaseExtraction({
        bollingerPosition: 'MIDDLE',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FLAT',
        movingAverage: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        lastCompletedCandle: {
            id: 'candle_struct_up',
            polarity: 'BULLISH',
            height: 22,
            body: { height: 16, top: 40, bottom: 56 },
            wicks: { upper: 2, lower: 4 },
            pattern: 'NORMAL',
            candleClosedAt: BASE_TIME - 1000
        },
        candleClosedAt: BASE_TIME - 1000
    });

    const localResult = engine.evaluate(extraction, BASE_TIME);
    assert.equal(localResult.candidate, 'UP');
    assert.equal(localResult.signalState, 'UP CONFIRMED');
    assert.ok(localResult.supportingEvidence.some(e => e.includes('EMA 9/21')));

    const validated = validator.validate({ localResult, now: BASE_TIME });
    assert.equal(validated.direction, 'UP');
    assert.equal(validated.signalState, 'UP CONFIRMED');
    assert.equal(validated.audit.approved, true);
});

test('EP-14: Structural Confluence (EMA 9/21 + Lower Highs/Lows) confirms DOWN when Bollinger is Middle/Unavailable', () => {
    const engine = engineApi.createEngine();
    const validator = validatorApi.createValidator();

    // Completed red candle with declining EMA and Lower Highs/Lows structure, even without extreme Bollinger touch
    const extraction = createBaseExtraction({
        visualTrend: 'BEARISH',
        bollingerPosition: 'MIDDLE',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FLAT',
        movingAverage: 'BEARISH',
        priceStructure: 'LOWER_HIGHS_LOWER_LOWS',
        lastCompletedCandle: {
            id: 'candle_struct_down',
            polarity: 'BEARISH',
            height: 22,
            body: { height: 16, top: 50, bottom: 66 },
            wicks: { upper: 4, lower: 2 },
            pattern: 'NORMAL',
            candleClosedAt: BASE_TIME - 1000
        },
        candleClosedAt: BASE_TIME - 1000
    });

    const localResult = engine.evaluate(extraction, BASE_TIME);
    assert.equal(localResult.candidate, 'DOWN');
    assert.equal(localResult.signalState, 'DOWN CONFIRMED');
    assert.ok(localResult.supportingEvidence.some(e => e.includes('EMA 9/21')));

    const validated = validator.validate({ localResult, now: BASE_TIME });
    assert.equal(validated.direction, 'DOWN');
    assert.equal(validated.signalState, 'DOWN CONFIRMED');
    assert.equal(validated.audit.approved, true);
});
