'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const engineFactory = require('../public/local_technical_engine.js');
const validatorFactory = require('../public/final_signal_validator.js');
const notificationsFactory = require('../public/signal_notifications.js');

test('Timing 1: New confirmed setup after 60 seconds -> eligible', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const sounds = [];
    const controller = notificationsFactory.createController({
        playSound: (dir, id) => sounds.push({ dir, id })
    });

    // Initial DOWN signal at t = 1000
    const frame1 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-101', polarity: 'BEARISH', pattern: 'NORMAL' },
        visualTrend: 'BEARISH',
        priceStructure: 'LOWER_HIGHS_LOWER_LOWS',
        movingAverage: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };
    const s1 = validator.validate({ localResult: engine.evaluate(frame1, 1000), now: 1000 });
    assert.equal(s1.direction, 'DOWN');
    assert.equal(s1.signalState, 'NEW_SIGNAL_CONFIRMED');
    assert.equal(controller.notifyLiveAnalysis(s1, 1000), true);
    assert.equal(sounds.length, 1);

    // Genuinely new setup after exactly 60 seconds (t = 61000)
    const frame2 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-102', polarity: 'BEARISH', pattern: 'NORMAL' },
        visualTrend: 'BEARISH',
        priceStructure: 'LOWER_HIGHS_LOWER_LOWS',
        movingAverage: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };
    const s2 = validator.validate({ localResult: engine.evaluate(frame2, 61000), now: 61000 });
    assert.equal(s2.direction, 'DOWN');
    assert.equal(s2.signalState, 'NEW_SIGNAL_CONFIRMED');
    assert.equal(s2.isContinuation, true);
    assert.equal(s2.previousSignalId, s1.id);
    assert.notEqual(s2.id, s1.id);

    // Eligible and published
    assert.equal(controller.notifyLiveAnalysis(s2, 61000), true);
    assert.equal(sounds.length, 2);
});

test('Timing 2: Weak setup after 60 seconds -> WAIT', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const controller = notificationsFactory.createController();

    // Initial signal at t = 1000
    const frame1 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-201', polarity: 'BEARISH', pattern: 'NORMAL' },
        visualTrend: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };
    const s1 = validator.validate({ localResult: engine.evaluate(frame1, 1000), now: 1000 });
    assert.equal(s1.direction, 'DOWN');

    // 60 seconds elapsed, but the market forms a WEAK setup (no independent confirmation, flat RSI/Bollinger)
    const weakFrame = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-202', polarity: 'BEARISH', pattern: 'NORMAL' },
        visualTrend: 'NEUTRAL',
        priceStructure: 'SIDEWAYS',
        movingAverage: 'FLAT',
        bollingerPosition: 'MIDDLE', // Neutral, no lower band walk/bounce
        rsiVisualZone: 'NEUTRAL',    // Flat momentum
        rsiSlope: 'FLAT'
    };
    const localWeak = engine.evaluate(weakFrame, 61000);
    assert.equal(localWeak.candidate, 'WAIT');

    const sWeak = validator.validate({ localResult: localWeak, now: 61000 });
    assert.equal(sWeak.direction, 'WAIT');
    assert.equal(controller.notifyLiveAnalysis(sWeak, 61000), false);
});

test('Timing 3: New confirmed setup after 2 minutes -> eligible', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const sounds = [];
    const controller = notificationsFactory.createController({
        playSound: (dir, id) => sounds.push({ dir, id })
    });

    const frame1 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-301', polarity: 'BULLISH', pattern: 'NORMAL' },
        visualTrend: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    };
    const s1 = validator.validate({ localResult: engine.evaluate(frame1, 1000), now: 1000 });
    assert.equal(s1.direction, 'UP');
    assert.equal(controller.notifyLiveAnalysis(s1, 1000), true);

    // After 2 minutes (120s later at t = 121000), new confirmed bullish setup arrives
    const frame2 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-303', polarity: 'BULLISH', pattern: 'NORMAL' },
        visualTrend: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    };
    const s2 = validator.validate({ localResult: engine.evaluate(frame2, 121000), now: 121000 });
    assert.equal(s2.direction, 'UP');
    assert.equal(s2.signalState, 'NEW_SIGNAL_CONFIRMED');
    assert.equal(s2.isContinuation, true);

    // Eligible immediately without artificial delays
    assert.equal(controller.notifyLiveAnalysis(s2, 121000), true);
    assert.equal(sounds.length, 2);
});

test('Timing 4: New confirmed setup after 3 minutes -> eligible', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const sounds = [];
    const controller = notificationsFactory.createController({
        playSound: (dir, id) => sounds.push({ dir, id })
    });

    const frame1 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-401', polarity: 'BEARISH', pattern: 'NORMAL' },
        visualTrend: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };
    const s1 = validator.validate({ localResult: engine.evaluate(frame1, 1000), now: 1000 });
    assert.equal(controller.notifyLiveAnalysis(s1, 1000), true);

    // After 3 minutes (180s later at t = 181000), new confirmed bearish setup arrives
    const frame2 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-404', polarity: 'BEARISH', pattern: 'NORMAL' },
        visualTrend: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };
    const s2 = validator.validate({ localResult: engine.evaluate(frame2, 181000), now: 181000 });
    assert.equal(s2.direction, 'DOWN');
    assert.equal(s2.signalState, 'NEW_SIGNAL_CONFIRMED');
    assert.equal(controller.notifyLiveAnalysis(s2, 181000), true);
    assert.equal(sounds.length, 2);
});

test('Timing 5: No valid setup after 5 minutes -> WAIT', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const controller = notificationsFactory.createController();

    const frame1 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-501', polarity: 'BULLISH', pattern: 'NORMAL' },
        visualTrend: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    };
    const s1 = validator.validate({ localResult: engine.evaluate(frame1, 1000), now: 1000 });
    assert.equal(controller.notifyLiveAnalysis(s1, 1000), true);

    // After 5 minutes (300s later at t = 301000), market is in low-volatility consolidation / Doji
    const consolidatingFrame = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-506', polarity: 'BEARISH', pattern: 'DOJI' },
        visualTrend: 'NEUTRAL',
        bollingerPosition: 'MIDDLE',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FLAT'
    };
    const localConsolidation = engine.evaluate(consolidatingFrame, 301000);
    assert.equal(localConsolidation.candidate, 'WAIT');

    const sWait = validator.validate({ localResult: localConsolidation, now: 301000 });
    // Must NOT force a signal merely because 5 minutes elapsed
    assert.equal(sWait.direction, 'WAIT');
    assert.equal(controller.notifyLiveAnalysis(sWait, 301000), false);
});

test('Timing 6: Same setup repeated -> blocked', () => {
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
        lastCompletedCandle: { id: 'candle-601', polarity: 'BEARISH', pattern: 'NORMAL' },
        visualTrend: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };
    const s1 = validator.validate({ localResult: engine.evaluate(frame, 1000), now: 1000 });
    assert.equal(controller.notifyLiveAnalysis(s1, 1000), true);
    assert.equal(sounds.length, 1);

    // Subsequent frame for identical candle-601
    const sRepeat = validator.validate({ localResult: engine.evaluate(frame, 2500), now: 2500 });
    assert.equal(sRepeat.isDuplicate, true);
    assert.equal(sRepeat.signalState, 'ACTIVE_TREND');
    assert.equal(controller.notifyLiveAnalysis(sRepeat, 2500), false);
    assert.equal(sounds.length, 1); // No duplicate sound
});

test('Timing 7: New setup in the same direction -> eligible', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const controller = notificationsFactory.createController();

    const frame1 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-701', polarity: 'BULLISH', pattern: 'NORMAL' },
        visualTrend: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    };
    const s1 = validator.validate({ localResult: engine.evaluate(frame1, 1000), now: 1000 });
    assert.equal(controller.notifyLiveAnalysis(s1, 1000), true);

    // Genuinely new setup in same direction on candle-702 after 60s
    const frame2 = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-702', polarity: 'BULLISH', pattern: 'NORMAL' },
        visualTrend: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING'
    };
    const s2 = validator.validate({ localResult: engine.evaluate(frame2, 61000), now: 61000 });
    assert.equal(s2.direction, 'UP');
    assert.equal(s2.isContinuation, true);
    assert.equal(controller.notifyLiveAnalysis(s2, 61000), true);
});

test('Timing 8: Genuine opposite-direction reversal -> independently evaluated', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();
    const sounds = [];
    const controller = notificationsFactory.createController({
        playSound: (dir, id) => sounds.push({ dir, id })
    });

    // 1. Initial DOWN signal
    const downFrame = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-801', polarity: 'BEARISH', pattern: 'NORMAL' },
        visualTrend: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };
    const sDown = validator.validate({ localResult: engine.evaluate(downFrame, 1000), now: 1000 });
    assert.equal(controller.notifyLiveAnalysis(sDown, 1000), true);

    // 2. Market reverses after 60s with confirmed Bullish Hammer at lower band bounce + oversold RSI rebound
    const reversalFrame = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        lastCompletedCandle: { id: 'candle-802', polarity: 'BULLISH', pattern: 'HAMMER' },
        visualTrend: 'BEARISH', // prior trend
        bollingerPosition: 'LOWER_BAND_BOUNCE',
        rsiVisualZone: 'OVERSOLD',
        rsiSlope: 'RISING'
    };
    const sUp = validator.validate({ localResult: engine.evaluate(reversalFrame, 62000), now: 62000 });
    assert.equal(sUp.direction, 'UP');
    assert.equal(sUp.isContinuation, false);
    assert.equal(sUp.previousSignalId, sDown.id);

    // Reversal evaluated independently and allowed
    assert.equal(controller.notifyLiveAnalysis(sUp, 62000), true);
    assert.equal(sounds.length, 2);
    assert.equal(sounds[1].dir, 'UP');
});

test('Timing 9: Entry opportunity already passed -> WAIT — MISSED ENTRY', () => {
    const engine = engineFactory.createEngine();
    const validator = validatorFactory.createValidator();

    const lateFrame = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        candleCompleted: true,
        entryMissed: true, // Price move already developed before entry
        lastCompletedCandle: { id: 'candle-901', polarity: 'BEARISH', pattern: 'NORMAL' },
        visualTrend: 'BEARISH',
        bollingerPosition: 'LOWER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FALLING'
    };

    const localResult = engine.evaluate(lateFrame, 1000);
    assert.equal(localResult.candidate, 'WAIT');
    assert.match(localResult.waitReason, /MISSED ENTRY/);

    const validated = validator.validate({ localResult, now: 1000 });
    assert.equal(validated.direction, 'WAIT');
    assert.match(validated.explanation, /MISSED ENTRY/);
});
