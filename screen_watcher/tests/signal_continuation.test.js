'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const engineFactory = require('../public/local_technical_engine.js');
const validatorFactory = require('../public/final_signal_validator.js');
const notificationsFactory = require('../public/signal_notifications.js');

test('Test 1: DOWN continuation with genuinely new setup -> allow new DOWN', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const sounds = [];
    const controller = notificationsFactory.createController({
        playSound: (dir, id) => sounds.push({ dir, id })
    });

    // 1. Initial DOWN signal #1 on candle-101
    const frame1 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: {
            id: 'candle-101',
            polarity: 'BEARISH',
            pattern: 'NORMAL'
        },
        visualTrend: 'BEARISH',
        priceStructure: 'LOWER_HIGHS_LOWER_LOWS',
        movingAverage: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };

    const local1 = engine.evaluate(frame1, 1000);
    assert.equal(local1.candidate, 'DOWN');
    const signal1 = validator.validate({ localResult: local1, now: 1000 });
    assert.equal(signal1.direction, 'DOWN');
    assert.equal(signal1.signalState, 'NEW_SIGNAL_CONFIRMED');
    assert.equal(signal1.isContinuation, false);
    assert.equal(controller.notifyLiveAnalysis(signal1, 1000), true);
    assert.equal(sounds.length, 1);
    assert.equal(sounds[0].dir, 'DOWN');

    // 2. Genuinely new completed candle-102 forms a fresh continuation setup
    const frame2 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: {
            id: 'candle-102',
            polarity: 'BEARISH',
            pattern: 'NORMAL'
        },
        visualTrend: 'BEARISH',
        priceStructure: 'LOWER_HIGHS_LOWER_LOWS',
        movingAverage: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };

    const local2 = engine.evaluate(frame2, 61000);
    assert.equal(local2.candidate, 'DOWN');
    const signal2 = validator.validate({ localResult: local2, now: 61000 });

    assert.equal(signal2.direction, 'DOWN');
    assert.equal(signal2.signalState, 'NEW_SIGNAL_CONFIRMED');
    assert.equal(signal2.isContinuation, true);
    assert.equal(signal2.previousSignalId, signal1.id);
    assert.notEqual(signal2.id, signal1.id);

    // Notification controller allows genuine DOWN continuation with new alert & sound
    assert.equal(controller.notifyLiveAnalysis(signal2, 61000), true);
    assert.equal(sounds.length, 2);
    assert.equal(sounds[1].dir, 'DOWN');
    assert.equal(sounds[1].id, signal2.id);
});

test('Test 2: Same DOWN setup repeated -> block duplicate', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const sounds = [];
    const controller = notificationsFactory.createController({
        playSound: (dir, id) => sounds.push({ dir, id })
    });

    const frame = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: {
            id: 'candle-101',
            polarity: 'BEARISH',
            pattern: 'NORMAL'
        },
        visualTrend: 'BEARISH',
        priceStructure: 'LOWER_HIGHS_LOWER_LOWS',
        movingAverage: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };

    const local1 = engine.evaluate(frame, 1000);
    const signal1 = validator.validate({ localResult: local1, now: 1000 });
    assert.equal(signal1.direction, 'DOWN');
    assert.equal(controller.notifyLiveAnalysis(signal1, 1000), true);
    assert.equal(sounds.length, 1);

    // Repeated frame for same candle-101 within active trend
    const local2 = engine.evaluate(frame, 2500);
    const signal2 = validator.validate({ localResult: local2, now: 2500 });
    assert.equal(signal2.isDuplicate, true);
    assert.equal(signal2.signalState, 'ACTIVE_TREND');
    assert.equal(signal2.id, signal1.id);

    // Notification controller blocks duplicate
    assert.equal(controller.notifyLiveAnalysis(signal2, 2500), false);
    assert.equal(sounds.length, 1); // No new sound played
});

test('Test 3: UP continuation with genuinely new setup -> allow new UP', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const sounds = [];
    const controller = notificationsFactory.createController({
        playSound: (dir, id) => sounds.push({ dir, id })
    });

    // 1. Initial UP signal #1 on candle-201
    const frame1 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: {
            id: 'candle-201',
            polarity: 'BULLISH',
            pattern: 'NORMAL'
        },
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    };

    const local1 = engine.evaluate(frame1, 1000);
    assert.equal(local1.candidate, 'UP');
    const signal1 = validator.validate({ localResult: local1, now: 1000 });
    assert.equal(signal1.direction, 'UP');
    assert.equal(signal1.signalState, 'NEW_SIGNAL_CONFIRMED');
    assert.equal(controller.notifyLiveAnalysis(signal1, 1000), true);
    assert.equal(sounds.length, 1);

    // 2. Genuinely new completed candle-202 forms a fresh continuation setup
    const frame2 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: {
            id: 'candle-202',
            polarity: 'BULLISH',
            pattern: 'NORMAL'
        },
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    };

    const local2 = engine.evaluate(frame2, 61000);
    assert.equal(local2.candidate, 'UP');
    const signal2 = validator.validate({ localResult: local2, now: 61000 });

    assert.equal(signal2.direction, 'UP');
    assert.equal(signal2.signalState, 'NEW_SIGNAL_CONFIRMED');
    assert.equal(signal2.isContinuation, true);
    assert.equal(signal2.previousSignalId, signal1.id);
    assert.notEqual(signal2.id, signal1.id);

    // Notification controller allows genuine UP continuation
    assert.equal(controller.notifyLiveAnalysis(signal2, 61000), true);
    assert.equal(sounds.length, 2);
    assert.equal(sounds[1].dir, 'UP');
    assert.equal(sounds[1].id, signal2.id);
});

test('Test 4: Same UP setup repeated -> block duplicate', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const sounds = [];
    const controller = notificationsFactory.createController({
        playSound: (dir, id) => sounds.push({ dir, id })
    });

    const frame = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: {
            id: 'candle-201',
            polarity: 'BULLISH',
            pattern: 'NORMAL'
        },
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    };

    const local1 = engine.evaluate(frame, 1000);
    const signal1 = validator.validate({ localResult: local1, now: 1000 });
    assert.equal(signal1.direction, 'UP');
    assert.equal(controller.notifyLiveAnalysis(signal1, 1000), true);
    assert.equal(sounds.length, 1);

    // Repeated frame for same candle-201
    const local2 = engine.evaluate(frame, 3000);
    const signal2 = validator.validate({ localResult: local2, now: 3000 });
    assert.equal(signal2.isDuplicate, true);
    assert.equal(signal2.signalState, 'ACTIVE_TREND');

    // Duplicate blocked
    assert.equal(controller.notifyLiveAnalysis(signal2, 3000), false);
    assert.equal(sounds.length, 1);
});

test('Test 5: DOWN trend followed by genuine UP reversal -> evaluate UP independently', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const sounds = [];
    const controller = notificationsFactory.createController({
        playSound: (dir, id) => sounds.push({ dir, id })
    });

    // 1. Active DOWN trend signal on candle-300
    const downFrame = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: {
            id: 'candle-300',
            polarity: 'BEARISH',
            pattern: 'NORMAL'
        },
        visualTrend: 'BEARISH',
        priceStructure: 'LOWER_HIGHS_LOWER_LOWS',
        movingAverage: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };
    const localDown = engine.evaluate(downFrame, 1000);
    const signalDown = validator.validate({ localResult: localDown, now: 1000 });
    assert.equal(signalDown.direction, 'DOWN');
    assert.equal(controller.notifyLiveAnalysis(signalDown, 1000), true);

    // 2. Genuine UP reversal forms on candle-301: Lower band bounce + oversold RSI rebound
    const reversalFrame = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: {
            id: 'candle-301',
            polarity: 'BULLISH',
            pattern: 'HAMMER'
        },
        visualTrend: 'BEARISH', // prior trend was bearish
        priceStructure: 'SIDEWAYS',
        movingAverage: 'FLAT',
        bollingerPosition: 'LOWER_BAND_BOUNCE',
        rsiVisualZone: 'OVERSOLD',
        rsiSlope: 'RISING'
    };
    const localUp = engine.evaluate(reversalFrame, 61000);
    assert.equal(localUp.candidate, 'UP');

    const signalUp = validator.validate({ localResult: localUp, now: 61000 });
    assert.equal(signalUp.direction, 'UP');
    assert.equal(signalUp.signalState, 'NEW_SIGNAL_CONFIRMED');
    assert.equal(signalUp.isContinuation, false);
    assert.equal(signalUp.previousSignalId, signalDown.id);

    // Reversal evaluated independently and allowed
    assert.equal(controller.notifyLiveAnalysis(signalUp, 61000), true);
    assert.equal(sounds.length, 2);
    assert.equal(sounds[1].dir, 'UP');
});

test('Test 6: Same candle repeated across multiple frames -> no duplicate', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const sounds = [];
    const controller = notificationsFactory.createController({
        playSound: (dir, id) => sounds.push({ dir, id })
    });

    const frame = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: {
            id: 'candle-400',
            polarity: 'BEARISH',
            pattern: 'NORMAL'
        },
        visualTrend: 'BEARISH',
        priceStructure: 'LOWER_HIGHS_LOWER_LOWS',
        movingAverage: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };

    // Frame 1: Generates and notifies signal
    const local1 = engine.evaluate(frame, 1000);
    const signal1 = validator.validate({ localResult: local1, now: 1000 });
    assert.equal(controller.notifyLiveAnalysis(signal1, 1000), true);

    // Frames 2-10: 9 subsequent frames within the 1-minute window
    let duplicateBlocks = 0;
    for (let f = 2; f <= 10; f++) {
        const time = 1000 + f * 1500;
        const localN = engine.evaluate(frame, time);
        const signalN = validator.validate({ localResult: localN, now: time });
        assert.equal(signalN.isDuplicate, true);
        assert.equal(signalN.signalState, 'ACTIVE_TREND');
        const notified = controller.notifyLiveAnalysis(signalN, time);
        if (!notified) duplicateBlocks++;
    }

    assert.equal(duplicateBlocks, 9);
    assert.equal(sounds.length, 1); // Exactly 1 alert sounded across all 10 frames
});

test('Test 7: Price already moved before entry -> WAIT — MISSED ENTRY', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();

    // Chart frame where price has already moved excessively before entry
    const frameMissed = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        entryMissed: true,
        lastCompletedCandle: {
            id: 'candle-missed-1',
            polarity: 'BEARISH',
            pattern: 'NORMAL'
        },
        visualTrend: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };

    const localResult = engine.evaluate(frameMissed, 1000);
    assert.equal(localResult.candidate, 'WAIT');
    assert.match(localResult.waitReason, /MISSED ENTRY/);

    const validated = validator.validate({ localResult, now: 1000 });
    assert.equal(validated.direction, 'WAIT');
    assert.match(validated.explanation, /MISSED ENTRY/);
});

test('Test 8: New valid setup after 1 minute -> evaluate immediately', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const controller = notificationsFactory.createController();

    // Setup 1 at t = 1000
    const frame1 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-801', polarity: 'BULLISH', pattern: 'NORMAL' },
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    };
    const signal1 = validator.validate({ localResult: engine.evaluate(frame1, 1000), now: 1000 });
    assert.equal(controller.notifyLiveAnalysis(signal1, 1000), true);

    // Setup 2 after exactly 1 minute (60s later) at t = 61000
    const frame2 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-802', polarity: 'BULLISH', pattern: 'NORMAL' },
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    };
    const signal2 = validator.validate({ localResult: engine.evaluate(frame2, 61000), now: 61000 });
    assert.equal(signal2.direction, 'UP');
    assert.equal(signal2.isContinuation, true);
    assert.equal(controller.notifyLiveAnalysis(signal2, 61000), true);
});

test('Test 9: New valid setup after 2 minutes -> evaluate immediately', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const controller = notificationsFactory.createController();

    // Setup 1 at t = 1000
    const frame1 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-901', polarity: 'BEARISH', pattern: 'NORMAL' },
        visualTrend: 'BEARISH',
        priceStructure: 'LOWER_HIGHS_LOWER_LOWS',
        movingAverage: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };
    const signal1 = validator.validate({ localResult: engine.evaluate(frame1, 1000), now: 1000 });
    assert.equal(controller.notifyLiveAnalysis(signal1, 1000), true);

    // Setup 2 after 2 minutes (120s later) at t = 121000
    const frame2 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-902', polarity: 'BEARISH', pattern: 'NORMAL' },
        visualTrend: 'BEARISH',
        priceStructure: 'LOWER_HIGHS_LOWER_LOWS',
        movingAverage: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };
    const signal2 = validator.validate({ localResult: engine.evaluate(frame2, 121000), now: 121000 });
    assert.equal(signal2.direction, 'DOWN');
    assert.equal(signal2.isContinuation, true);
    assert.equal(controller.notifyLiveAnalysis(signal2, 121000), true);
});

test('Test 10: Five-minute context conflicts with one-minute setup -> apply existing validator conservatively', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();

    // 1-minute immediate setup is bullish, but 5-minute broader trend is BEARISH without reversal confirmation
    const frameConflict = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        fiveMinuteContext: 'BEARISH', // Broader 5m context conflicts with 1m setup
        lastCompletedCandle: {
            id: 'candle-1001',
            polarity: 'BULLISH',
            pattern: 'NORMAL'
        },
        visualTrend: 'NEUTRAL',
        priceStructure: 'SIDEWAYS',
        movingAverage: 'FLAT',
        bollingerPosition: 'MIDDLE', // Neutral position, no lower band bounce
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FLAT'
    };

    const localResult = engine.evaluate(frameConflict, 1000);
    // Validator applies conservative precision and rejects conflicting context
    assert.equal(localResult.candidate, 'WAIT');
    assert.ok(localResult.conflictingEvidence.some(e => e.includes('Five-minute broader trend context')));

    const finalSignal = validator.validate({ localResult, now: 1000 });
    assert.equal(finalSignal.direction, 'WAIT');
});
