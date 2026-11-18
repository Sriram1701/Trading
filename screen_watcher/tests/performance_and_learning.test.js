'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PerformanceDB } = require('../performance_db.js');
const trackerApi = require('../public/signal_outcome_tracker.js');

test('SignalRecord: Valid directional signal record is created with all required fields', () => {
    const db = new PerformanceDB(':memory:');
    const signal = db.saveSignal({
        id: 'SIG-AUDIT-1',
        asset: 'EUR/USD (Quotex)',
        marketType: 'REGULAR',
        timeframe: '1M',
        direction: 'UP',
        entryTimestamp: '2026-11-18T10:00:00.000Z',
        entryPrice: 1.08542,
        expiryDuration: 60,
        expiryTimestamp: '2026-11-18T10:01:00.000Z',
        candlePattern: 'HAMMER',
        candlePolarity: 'BULLISH',
        technicalEvidence: ['BULLISH pin-bar', 'RSI bounce from oversold'],
        indicatorStates: { rsi: 'OVERSOLD', bollinger: 'LOWER_BAND_TEST' },
        visionStatus: 'VERIFIED_UP',
        confidence: 'HIGH',
        validationReason: 'UP SIGNAL — Dual confirmation: Fast local technical engine + Qwen3-VL vision agree.',
        algorithmVersion: 'v1.1.0-hybrid'
    });

    assert.equal(signal.id, 'SIG-AUDIT-1');
    assert.equal(signal.direction, 'UP');
    assert.equal(signal.entry_price, 1.08542);
    assert.equal(signal.candle_pattern, 'HAMMER');
    assert.equal(signal.algorithm_version, 'v1.1.0-hybrid');
    assert.equal(signal.outcome, 'PENDING');
    assert.equal(signal.trade_placed, false);
});

test('TradeMatching: Signal displayed does not assume trade taken until confirmed', () => {
    const db = new PerformanceDB(':memory:');
    db.saveSignal({
        id: 'SIG-MATCH-1',
        direction: 'UP',
        tradePlaced: false
    });

    let metrics = db.getPerformanceMetrics();
    assert.equal(metrics.userTrades.total, 0);

    // User confirms trade taken
    db.updateTradeStatus('SIG-MATCH-1', true);
    metrics = db.getPerformanceMetrics();
    assert.equal(metrics.userTrades.total, 1);
});

test('OutcomeVerification: UP signal verified as WIN when expiry price is above entry price', () => {
    const db = new PerformanceDB(':memory:');
    db.saveSignal({
        id: 'SIG-UP-WIN',
        direction: 'UP',
        entryPrice: 1.08500,
        expiryDuration: 60
    });

    const verified = db.recordOutcome('SIG-UP-WIN', {
        outcome: 'WIN',
        expiryPrice: 1.08535,
        outcomeReason: 'Expiry price (1.08535) closed above entry (1.08500).'
    });

    assert.equal(verified.outcome, 'WIN');
    assert.equal(verified.expiry_price, 1.08535);

    const metrics = db.getPerformanceMetrics();
    assert.equal(metrics.verifiedWins, 1);
    assert.equal(metrics.verifiedLosses, 0);
    assert.equal(metrics.winRate, 100);
    assert.equal(metrics.upAccuracy, 100);
});

test('OutcomeVerification: DOWN signal verified as WIN when expiry price is below entry price', () => {
    const db = new PerformanceDB(':memory:');
    db.saveSignal({
        id: 'SIG-DOWN-WIN',
        direction: 'DOWN',
        entryPrice: 1.08500,
        expiryDuration: 60
    });

    const verified = db.recordOutcome('SIG-DOWN-WIN', {
        outcome: 'WIN',
        expiryPrice: 1.08470,
        outcomeReason: 'Expiry price (1.08470) closed below entry (1.08500).'
    });

    assert.equal(verified.outcome, 'WIN');
    const metrics = db.getPerformanceMetrics();
    assert.equal(metrics.verifiedWins, 1);
    assert.equal(metrics.downAccuracy, 100);
});

test('OutcomeVerification: DRAW and UNVERIFIED outcomes are correctly classified', () => {
    const db = new PerformanceDB(':memory:');
    db.saveSignal({ id: 'SIG-DRAW', direction: 'UP' });
    db.saveSignal({ id: 'SIG-UNVERIFIED', direction: 'DOWN' });

    db.recordOutcome('SIG-DRAW', { outcome: 'DRAW', outcomeReason: 'Tie at settlement.' });
    db.recordOutcome('SIG-UNVERIFIED', { outcome: 'UNVERIFIED', outcomeReason: 'Price unreadable.' });

    const metrics = db.getPerformanceMetrics();
    assert.equal(metrics.draws, 1);
    assert.equal(metrics.unverified, 1);
    assert.equal(metrics.verifiedWins, 0);
    assert.equal(metrics.verifiedLosses, 0);
    // When no verified wins or losses, winRate must be null (not 0% or NaN)
    assert.equal(metrics.winRate, null);
});

test('WinRateCalculation: Unverified signals are strictly excluded from the win-rate denominator', () => {
    const db = new PerformanceDB(':memory:');
    // 3 wins, 1 loss, 5 unverified signals
    db.saveSignal({ id: 'S-W1', direction: 'UP' });
    db.recordOutcome('S-W1', { outcome: 'WIN' });

    db.saveSignal({ id: 'S-W2', direction: 'UP' });
    db.recordOutcome('S-W2', { outcome: 'WIN' });

    db.saveSignal({ id: 'S-W3', direction: 'DOWN' });
    db.recordOutcome('S-W3', { outcome: 'WIN' });

    db.saveSignal({ id: 'S-L1', direction: 'DOWN' });
    db.recordOutcome('S-L1', { outcome: 'LOSS' });

    for (let i = 1; i <= 5; i += 1) {
        db.saveSignal({ id: `S-UNV-${i}`, direction: 'UP' });
        db.recordOutcome(`S-UNV-${i}`, { outcome: 'UNVERIFIED' });
    }

    const metrics = db.getPerformanceMetrics();
    assert.equal(metrics.totalSignals, 9);
    assert.equal(metrics.verifiedWins, 3);
    assert.equal(metrics.verifiedLosses, 1);
    assert.equal(metrics.unverified, 5);

    // Strict verified win rate: 3 / (3 + 1) = 75.0%
    // If unverified were incorrectly counted in denominator, it would be 3 / 9 = 33.3%
    assert.equal(metrics.winRate, 75.0);
    assert.equal(metrics.upAccuracy, 100); // 2W / 2 total
    assert.equal(metrics.downAccuracy, 50.0); // 1W / 2 total
});

test('Analytics: Groups performance correctly by Asset, Market Type (OTC vs Regular) and Timeframe', () => {
    const db = new PerformanceDB(':memory:');
    db.saveSignal({ id: 'S1', asset: 'EUR/USD (Quotex)', marketType: 'REGULAR', timeframe: '1M', direction: 'UP' });
    db.recordOutcome('S1', { outcome: 'WIN' });

    db.saveSignal({ id: 'S2', asset: 'EUR/USD (OTC)', marketType: 'OTC', timeframe: '1M', direction: 'DOWN' });
    db.recordOutcome('S2', { outcome: 'LOSS' });

    const metrics = db.getPerformanceMetrics();
    const regular = metrics.marketBreakdown.find(m => m.market === 'REGULAR');
    const otc = metrics.marketBreakdown.find(m => m.market === 'OTC');

    assert.equal(regular.wins, 1);
    assert.equal(regular.winRate, 100);

    assert.equal(otc.losses, 1);
    assert.equal(otc.winRate, 0);

    const eurReg = metrics.assetBreakdown.find(a => a.asset === 'EUR/USD (Quotex)');
    assert.equal(eurReg.wins, 1);
});

test('LossAnalysis: Wrong signal triggers structured failure investigation with primary cause', () => {
    const db = new PerformanceDB(':memory:');
    db.saveSignal({
        id: 'SIG-LOSS-BOLLINGER',
        direction: 'UP',
        candlePattern: 'NORMAL',
        indicatorStates: { bollinger: 'UPPER_BAND_TEST', rsi: 'NEUTRAL' },
        technicalEvidence: ['BULLISH candle', 'UPPER_BAND_TEST']
    });

    const recorded = db.recordOutcome('SIG-LOSS-BOLLINGER', { outcome: 'LOSS' });
    assert.equal(recorded.outcome, 'LOSS');
    assert.equal(recorded.outcome_reason, 'Bollinger Band rejection');

    const metrics = db.getPerformanceMetrics();
    assert.equal(metrics.recentMistakes.length, 1);
    assert.equal(metrics.recentMistakes[0].cause, 'Bollinger Band rejection');
    assert.match(metrics.recentMistakes[0].warning, /testing upper band resistance/);
});

test('LearningSafety: Rejects automatic rule adjustments when sample size is insufficient (< 20)', () => {
    const db = new PerformanceDB(':memory:');
    // Only 3 verified outcomes
    for (let i = 1; i <= 3; i += 1) {
        db.saveSignal({ id: `S-SAMPLE-${i}`, direction: 'UP' });
        db.recordOutcome(`S-SAMPLE-${i}`, { outcome: 'WIN' });
    }

    const metrics = db.getPerformanceMetrics();
    assert.equal(metrics.learning.canLearn, false);
    assert.equal(metrics.learning.verifiedSampleCount, 3);
    assert.equal(metrics.learning.minSamplesRequired, 20);
    assert.match(metrics.learning.message, /Insufficient sample to learn reliably \(3 \/ 20/);
});

test('StrategyVersioning: Allows safe rollback to earlier strategy version', () => {
    const db = new PerformanceDB(':memory:');
    let versions = db.getStrategyVersions();
    assert.equal(versions.find(v => v.version === 'v1.1.0-hybrid').status, 'ACTIVE');

    const rollback = db.rollbackStrategy('v1.0.0-legacy');
    assert.equal(rollback.success, true);
    assert.equal(rollback.activeVersion, 'v1.0.0-legacy');

    versions = db.getStrategyVersions();
    assert.equal(versions.find(v => v.version === 'v1.0.0-legacy').status, 'ACTIVE');
    assert.equal(versions.find(v => v.version === 'v1.1.0-hybrid').status, 'HISTORICAL');
});

test('SignalOutcomeTracker: Evaluates pending signals after expiry timestamp', async () => {
    let savedSignal = null;
    let savedOutcome = null;

    const fakeFetch = async (url, opts) => {
        if (url === '/api/signals') {
            savedSignal = JSON.parse(opts.body);
            return { ok: true, json: async () => ({ success: true, signal: savedSignal }) };
        }
        if (url === '/api/signals/outcome') {
            savedOutcome = JSON.parse(opts.body);
            return { ok: true, json: async () => ({ success: true, signal: savedOutcome }) };
        }
        if (url === '/api/performance') {
            return {
                ok: true,
                json: async () => ({
                    totalSignals: 1,
                    verifiedWins: 1,
                    verifiedLosses: 0,
                    winRate: 100
                })
            };
        }
        return { ok: true, json: async () => ({}) };
    };

    const now = 1700000000000;
    const tracker = trackerApi.createTracker({ fetchImpl: fakeFetch, now: () => now });
    const tracked = await tracker.trackSignal({
        id: 'TRACKER-SIG-1',
        direction: 'UP',
        explanation: 'UP SIGNAL confirmed by local confluence.'
    }, {
        entryPrice: 1.08500,
        expiryDuration: 60
    });

    assert.equal(tracked.id, 'TRACKER-SIG-1');
    assert.equal(tracker.getPendingSignals().length, 1);

    // Advance clock past 60s expiry
    const futureTime = now + 65000;
    const verified = await tracker.checkPendingExpiries(futureTime, { polarity: 'BULLISH' }, 1.08540);

    assert.equal(verified.length, 1);
    assert.equal(verified[0].outcome, 'WIN');
    assert.equal(tracker.getPendingSignals().length, 0);
    assert.equal(savedOutcome.outcome, 'WIN');
});
