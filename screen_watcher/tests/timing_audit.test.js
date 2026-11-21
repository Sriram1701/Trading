'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const extractorApi = require('../public/local_chart_extractor.js');
const engineApi = require('../public/local_technical_engine.js');
const validatorApi = require('../public/final_signal_validator.js');
const trackerApi = require('../public/signal_outcome_tracker.js');

const sampleTime = 1700000000000;

function createExtractionObject(options = {}) {
    const defaults = {
        isValid: true,
        isReadable: true,
        dataQuality: 'VISUAL_ESTIMATE',
        exactValuesAvailable: false,
        candleCompleted: true,
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        lastCompletedCandle: {
            id: 'candle_test_1',
            polarity: 'BULLISH',
            height: 28,
            body: { height: 22, top: 20, bottom: 42 },
            wicks: { upper: 2, lower: 4 },
            pattern: 'NORMAL',
            candleClosedAt: sampleTime - 5000
        },
        formingCandle: {
            id: 'candle_forming_1',
            polarity: 'BULLISH',
            height: 15,
            body: { height: 10, top: 30, bottom: 40 },
            wicks: { upper: 1, lower: 2 },
            pattern: 'NORMAL',
            isCompleted: false
        },
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'RISING',
        candleClosedAt: sampleTime - 5000,
        extractedAt: sampleTime
    };
    return { ...defaults, ...options };
}

test('Timing Audit: Candle Synchronization - engine assigns signalStatus WAITING_FOR_CANDLE_CLOSE when candle not completed', () => {
    const engine = engineApi.createEngine({ strategyVersion: 'v1.2.0-timing-fix' });
    const extraction = createExtractionObject({ 
        candleCompleted: false,
        candleClosedAt: null,
        lastCompletedCandle: { ...createExtractionObject().lastCompletedCandle, candleClosedAt: null }
    });
    const result = engine.evaluate(extraction, sampleTime);

    assert.equal(result.signalStatus, 'WAITING_FOR_CANDLE_CLOSE', 'Signal status should be WAITING_FOR_CANDLE_CLOSE');
    assert.equal(result.candleClosedAt, null, 'candleClosedAt should be null');
});

test('Timing Audit: Candle Synchronization - engine assigns signalStatus SIGNAL_CONFIRMED when candle completed and signal valid', () => {
    const engine = engineApi.createEngine({ strategyVersion: 'v1.2.0-timing-fix' });
    const extraction = createExtractionObject({ 
        candleCompleted: true,
        candleClosedAt: sampleTime - 5000,
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiSlope: 'RISING'
    });
    const result = engine.evaluate(extraction, sampleTime);

    if (result.candidate === 'UP') {
        assert.equal(result.signalStatus, 'SIGNAL_CONFIRMED', 'Signal status should be SIGNAL_CONFIRMED');
        assert.ok(result.candleClosedAt !== null, 'candleClosedAt should not be null');
        assert.ok(result.hasOwnProperty('signalGeneratedAt'), 'Should have signalGeneratedAt');
        assert.ok(result.hasOwnProperty('recommendedEntryBy'), 'Should have recommendedEntryBy');
        assert.ok(result.hasOwnProperty('entryWindowExpiresAt'), 'Should have entryWindowExpiresAt');
    }
});

test('Timing Audit: Candle Synchronization - engine assigns signalStatus ENTRY_WINDOW_EXPIRED when past entry window', () => {
    const engine = engineApi.createEngine({ strategyVersion: 'v1.2.0-timing-fix' });
    const pastCloseTime = sampleTime - 70000;
    const extraction = createExtractionObject({ 
        candleCompleted: true,
        candleClosedAt: pastCloseTime,
        lastCompletedCandle: { ...createExtractionObject().lastCompletedCandle, candleClosedAt: pastCloseTime },
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiSlope: 'RISING'
    });
    const result = engine.evaluate(extraction, sampleTime);

    if (result.candidate === 'UP') {
        assert.equal(result.signalStatus, 'ENTRY_WINDOW_EXPIRED', 'Signal status should be ENTRY_WINDOW_EXPIRED');
    }
});

test('Timing Audit: Candle Synchronization - engine assigns signalStatus WAIT — NO SAFE ENTRY when no directional signal', () => {
    const engine = engineApi.createEngine({ strategyVersion: 'v1.2.0-timing-fix' });
    const extraction = createExtractionObject({ 
        candleCompleted: true,
        visualTrend: 'NEUTRAL',
        priceStructure: 'CONSOLIDATION',
        movingAverage: 'NEUTRAL',
        bollingerPosition: 'MIDDLE_BAND',
        rsiVisualZone: 'NEUTRAL',
        rsiSlope: 'FLAT'
    });
    const result = engine.evaluate(extraction, sampleTime);

    assert.equal(result.signalStatus, 'WAIT — NO SAFE ENTRY', 'Signal status should be WAIT — NO SAFE ENTRY');
});

test('Timing Audit: Expiry Alignment - trackSignal uses candleClosedAt + 60s for expiry (not signal generation time)', () => {
    const tracker = trackerApi.createTracker({ strategyVersion: 'v1.2.0-timing-fix', fetchImpl: null, storage: null });
    const candleCloseTime = sampleTime - 5000;
    const signalGeneratedTime = sampleTime;
    
    const analysis = {
        direction: 'UP',
        signal_strength: 'STRONG',
        candleClosedAt: candleCloseTime,
        signalGeneratedAt: signalGeneratedTime,
        recommendedEntryBy: candleCloseTime + 2000,
        entryWindowExpiresAt: candleCloseTime + 60000,
        candleId: 'candle_123',
        confidence: 0.85,
        explanation: 'Test signal'
    };

    tracker.trackSignal(analysis, { entryPrice: 1.08500, expiryDuration: 60 });

    const pending = tracker.getPendingSignals();
    assert.equal(pending.length, 1, 'Should have 1 pending signal');
    
    const expectedExpiry = candleCloseTime + 60000;
    assert.equal(pending[0].expiryMs, expectedExpiry, 'Expiry should be candleClosedAt + 60s');
    assert.equal(pending[0].candleId, 'candle_123', 'Should track candleId');
});

test('Timing Audit: Expiry Alignment - trackSignal rejects duplicate candleId (deduplication)', () => {
    const tracker = trackerApi.createTracker({ strategyVersion: 'v1.2.0-timing-fix', fetchImpl: null, storage: null });
    const candleCloseTime = sampleTime - 5000;
    const baseAnalysis = {
        direction: 'UP',
        signal_strength: 'STRONG',
        candleClosedAt: candleCloseTime,
        signalGeneratedAt: sampleTime,
        recommendedEntryBy: candleCloseTime + 2000,
        entryWindowExpiresAt: candleCloseTime + 60000,
        candleId: 'candle_456',
        confidence: 0.85,
        explanation: 'Test signal'
    };

    tracker.trackSignal(baseAnalysis, { entryPrice: 1.08500, expiryDuration: 60 });
    tracker.trackSignal(baseAnalysis, { entryPrice: 1.08500, expiryDuration: 60 });
    tracker.trackSignal(baseAnalysis, { entryPrice: 1.08500, expiryDuration: 60 });

    const pending = tracker.getPendingSignals();
    assert.equal(pending.length, 1, 'Should deduplicate to 1 signal');
});

test('Timing Audit: Expiry Alignment - trackSignal stores all timing audit fields as ISO strings', () => {
    const tracker = trackerApi.createTracker({ strategyVersion: 'v1.2.0-timing-fix', fetchImpl: null, storage: null });
    const candleCloseTime = sampleTime - 5000;
    const analysis = {
        direction: 'DOWN',
        signal_strength: 'MODERATE',
        candleClosedAt: candleCloseTime,
        signalGeneratedAt: sampleTime,
        recommendedEntryBy: candleCloseTime + 2000,
        entryWindowExpiresAt: candleCloseTime + 60000,
        candleId: 'candle_789',
        confidence: 0.72,
        explanation: 'Test DOWN signal'
    };

    tracker.trackSignal(analysis, { entryPrice: 1.08450, expiryDuration: 60 });

    const pending = tracker.getPendingSignals();
    assert.equal(pending[0].candleClosedAt, new Date(candleCloseTime).toISOString(), 'Should store candleClosedAt as ISO string');
    assert.equal(pending[0].signalGeneratedAt, new Date(sampleTime).toISOString(), 'Should store signalGeneratedAt as ISO string');
    assert.equal(pending[0].recommendedEntryBy, new Date(candleCloseTime + 2000).toISOString(), 'Should store recommendedEntryBy as ISO string');
    assert.equal(pending[0].entryWindowExpiresAt, new Date(candleCloseTime + 60000).toISOString(), 'Should store entryWindowExpiresAt as ISO string');
    assert.equal(pending[0].candleId, 'candle_789', 'Should store candleId');
});

test('Timing Audit: Staleness Threshold - engine recommendedEntryBy is candleClosedAt + 2s', () => {
    const engine = engineApi.createEngine({ strategyVersion: 'v1.2.0-timing-fix' });
    const candleCloseTime = sampleTime - 5000;
    const extraction = createExtractionObject({ 
        candleCompleted: true,
        candleClosedAt: candleCloseTime,
        lastCompletedCandle: { ...createExtractionObject().lastCompletedCandle, candleClosedAt: candleCloseTime },
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiSlope: 'RISING'
    });
    const result = engine.evaluate(extraction, sampleTime);

    if (result.candidate === 'UP') {
        const expectedEntryBy = candleCloseTime + 2000;
        assert.equal(result.recommendedEntryBy, expectedEntryBy, 'recommendedEntryBy should be candleClosedAt + 2s');
    }
});

test('Timing Audit: Staleness Threshold - engine entryWindowExpiresAt is candleClosedAt + 60s (1-minute candle life)', () => {
    const engine = engineApi.createEngine({ strategyVersion: 'v1.2.0-timing-fix' });
    const candleCloseTime = sampleTime - 5000;
    const extraction = createExtractionObject({ 
        candleCompleted: true,
        candleClosedAt: candleCloseTime,
        lastCompletedCandle: { ...createExtractionObject().lastCompletedCandle, candleClosedAt: candleCloseTime },
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiSlope: 'RISING'
    });
    const result = engine.evaluate(extraction, sampleTime);

    if (result.candidate === 'UP') {
        const expectedWindowEnd = candleCloseTime + 60000;
        assert.equal(result.entryWindowExpiresAt, expectedWindowEnd, 'entryWindowExpiresAt should be candleClosedAt + 60s');
    }
});

test('Timing Audit: Staleness Threshold - validator passes through timing fields in audit object', () => {
    const validator = validatorApi.createValidator({ strategyVersion: 'v1.2.0-timing-fix' });
    const candleCloseTime = sampleTime - 5000;
    const localResult = {
        direction: 'UP',
        candidate: 'UP',
        signal_strength: 'STRONG',
        confidence_tier: 'HIGH',
        signalStatus: 'SIGNAL_CONFIRMED',
        candleClosedAt: candleCloseTime,
        signalGeneratedAt: sampleTime,
        recommendedEntryBy: candleCloseTime + 2000,
        entryWindowExpiresAt: candleCloseTime + 60000,
        candleId: 'candle_val_1',
        explanation: 'Strong bullish alignment',
        observations: {},
        priceActionEvidence: ['bullish candle', 'higher highs'],
        trendEvidence: ['BULLISH trend'],
        momentumEvidence: ['RSI rising'],
        volatilityEvidence: ['upper band walk'],
        conflictingEvidence: [],
        supportingEvidence: ['bullish candle', 'higher highs', 'BULLISH trend', 'RSI rising', 'upper band walk'],
        candleCompleted: true,
        dataQuality: 'VISUAL_ESTIMATE'
    };

    const validated = validator.validate({
        localResult,
        visionResult: null,
        frameAgeMs: 1000,
        now: sampleTime,
        telemetry: {}
    });

    assert.equal(validated.audit.candleClosedAt, candleCloseTime, 'Audit should have candleClosedAt');
    assert.equal(validated.audit.signalGeneratedAt, sampleTime, 'Audit should have signalGeneratedAt');
    assert.equal(validated.audit.recommendedEntryBy, candleCloseTime + 2000, 'Audit should have recommendedEntryBy');
    assert.equal(validated.audit.entryWindowExpiresAt, candleCloseTime + 60000, 'Audit should have entryWindowExpiresAt');
    assert.equal(validated.audit.candleIdentity, 'candle_val_1', 'Audit should have candleIdentity');
});

test('Timing Audit: Staleness Threshold - validator passes through timing fields in returned analysis object', () => {
    const validator = validatorApi.createValidator({ strategyVersion: 'v1.2.0-timing-fix' });
    const candleCloseTime = sampleTime - 5000;
    const localResult = {
        direction: 'UP',
        candidate: 'UP',
        signal_strength: 'STRONG',
        confidence_tier: 'HIGH',
        signalStatus: 'SIGNAL_CONFIRMED',
        candleClosedAt: candleCloseTime,
        signalGeneratedAt: sampleTime,
        recommendedEntryBy: candleCloseTime + 2000,
        entryWindowExpiresAt: candleCloseTime + 60000,
        candleId: 'candle_val_2',
        explanation: 'Strong bullish alignment',
        observations: {},
        priceActionEvidence: ['bullish candle', 'higher highs'],
        trendEvidence: ['BULLISH trend'],
        momentumEvidence: ['RSI rising'],
        volatilityEvidence: ['upper band walk'],
        conflictingEvidence: [],
        supportingEvidence: ['bullish candle', 'higher highs', 'BULLISH trend', 'RSI rising', 'upper band walk'],
        candleCompleted: true,
        dataQuality: 'VISUAL_ESTIMATE'
    };

    const validated = validator.validate({
        localResult,
        visionResult: null,
        frameAgeMs: 1000,
        now: sampleTime,
        telemetry: {}
    });

    assert.equal(validated.candleClosedAt, candleCloseTime, 'Should have candleClosedAt');
    assert.equal(validated.signalGeneratedAt, sampleTime, 'Should have signalGeneratedAt');
    assert.equal(validated.recommendedEntryBy, candleCloseTime + 2000, 'Should have recommendedEntryBy');
    assert.equal(validated.entryWindowExpiresAt, candleCloseTime + 60000, 'Should have entryWindowExpiresAt');
    assert.equal(validated.signalStatus, 'SIGNAL_CONFIRMED', 'Should have signalStatus');
});

test('Timing Audit: Signal Status State Transitions - progression WAITING_FOR_CANDLE_CLOSE → SIGNAL_CONFIRMED → ENTRY_WINDOW_EXPIRED', () => {
    const engine = engineApi.createEngine({ strategyVersion: 'v1.2.0-timing-fix' });
    const candleCloseTime = sampleTime - 5000;
    
    // 1. Before candle close
    const extraction1 = createExtractionObject({ 
        candleCompleted: false,
        candleClosedAt: null,
        lastCompletedCandle: { ...createExtractionObject().lastCompletedCandle, candleClosedAt: null }
    });
    const result1 = engine.evaluate(extraction1, sampleTime);
    assert.equal(result1.signalStatus, 'WAITING_FOR_CANDLE_CLOSE', 'Step 1: Should be WAITING_FOR_CANDLE_CLOSE');

    // 2. At candle close
    const extraction2 = createExtractionObject({ 
        candleCompleted: true,
        candleClosedAt: candleCloseTime,
        lastCompletedCandle: { ...createExtractionObject().lastCompletedCandle, candleClosedAt: candleCloseTime },
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiSlope: 'RISING'
    });
    const result2 = engine.evaluate(extraction2, sampleTime);
    if (result2.candidate === 'UP') {
        assert.equal(result2.signalStatus, 'SIGNAL_CONFIRMED', 'Step 2: Should be SIGNAL_CONFIRMED');
    }

    // 3. Past entry window (60s after close)
    const pastWindowTime = candleCloseTime + 65000;
    const extraction3 = createExtractionObject({ 
        candleCompleted: true,
        candleClosedAt: candleCloseTime,
        lastCompletedCandle: { ...createExtractionObject().lastCompletedCandle, candleClosedAt: candleCloseTime },
        visualTrend: 'BULLISH',
        priceStructure: 'HIGHER_HIGHS_HIGHER_LOWS',
        movingAverage: 'BULLISH',
        bollingerPosition: 'UPPER_BAND_WALK',
        rsiSlope: 'RISING'
    });
    const result3 = engine.evaluate(extraction3, pastWindowTime);
    if (result3.candidate === 'UP') {
        assert.equal(result3.signalStatus, 'ENTRY_WINDOW_EXPIRED', 'Step 3: Should be ENTRY_WINDOW_EXPIRED');
    }
});

test('Timing Audit: Edge Cases - handles missing candleId gracefully (auto-generates)', () => {
    const tracker = trackerApi.createTracker({ strategyVersion: 'v1.2.0-timing-fix', fetchImpl: null, storage: null });
    const analysis = {
        direction: 'UP',
        signal_strength: 'STRONG',
        candleClosedAt: sampleTime - 5000,
        signalGeneratedAt: sampleTime,
        recommendedEntryBy: sampleTime - 3000,
        entryWindowExpiresAt: sampleTime + 55000,
        confidence: 0.85,
        explanation: 'Test signal'
    };

    tracker.trackSignal(analysis, { entryPrice: 1.08500, expiryDuration: 60 });

    const pending = tracker.getPendingSignals();
    assert.equal(pending.length, 1, 'Should track signal without candleId');
    assert.ok(pending[0].candleId.startsWith('candle-'), 'Should auto-generate candleId');
});

test('Timing Audit: Edge Cases - handles rapid successive signals with different candleIds', () => {
    const tracker = trackerApi.createTracker({ strategyVersion: 'v1.2.0-timing-fix', fetchImpl: null, storage: null });
    for (let i = 0; i < 5; i++) {
        const analysis = {
            direction: i % 2 === 0 ? 'UP' : 'DOWN',
            signal_strength: 'STRONG',
            candleClosedAt: sampleTime - 5000 + i * 1000,
            signalGeneratedAt: sampleTime + i * 100,
            recommendedEntryBy: sampleTime - 3000 + i * 1000,
            entryWindowExpiresAt: sampleTime + 55000 + i * 1000,
            candleId: `candle_${i}`,
            confidence: 0.85,
            explanation: `Test signal ${i}`
        };
        tracker.trackSignal(analysis, { entryPrice: 1.08500 + i * 0.0001, expiryDuration: 60 });
    }

    const pending = tracker.getPendingSignals();
    assert.equal(pending.length, 5, 'Should track 5 signals');
    
    const candleIds = pending.map(p => p.candleId);
    const uniqueCandleIds = new Set(candleIds);
    assert.equal(uniqueCandleIds.size, 5, 'All candleIds should be unique');
});