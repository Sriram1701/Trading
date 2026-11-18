/**
 * local_technical_engine.js
 * Fast deterministic local technical analysis engine for Quotex live chart frames.
 *
 * Evaluates extracted visual features against multi-factor confluence rules:
 * - EMA 9/21 trend alignment and slope
 * - RSI 14 momentum and overbought/oversold zones
 * - Bollinger Band rejection/bounce and volatility
 * - Candlestick patterns & price action on completed candles
 * - Support and resistance boundaries
 *
 * Pure deterministic logic executing in < 1 ms.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.LocalTechnicalEngine = api;
    }
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';

    function createEngine() {
        /**
         * Evaluates extracted visual chart features to produce a structured trading candidate.
         *
         * @param {Object} extracted Data returned by LocalChartExtractor
         * @param {number} now Timestamp
         * @returns {Object} Structured analysis candidate
         */
        function evaluate(extracted, now = Date.now()) {
            if (!extracted || !extracted.isValid) {
                return {
                    candidate: 'WAIT',
                    confidence_tier: 'NONE',
                    supportingEvidence: [],
                    conflictingEvidence: ['Invalid or unreadable chart frame.'],
                    dataQuality: 'INVALID',
                    candleCompleted: false,
                    waitReason: 'Invalid chart frame or unreadable pixels.',
                    indicatorsEvaluated: {
                        trend: 'UNAVAILABLE',
                        ema: 'UNAVAILABLE',
                        bollinger: 'UNAVAILABLE',
                        rsi: 'UNAVAILABLE',
                        candles: 'UNAVAILABLE'
                    },
                    analyzedAt: now
                };
            }

            if (!extracted.isReadable) {
                return {
                    candidate: 'WAIT',
                    confidence_tier: 'NONE',
                    supportingEvidence: [],
                    conflictingEvidence: [extracted.reason || 'Chart area unreadable.'],
                    dataQuality: extracted.dataQuality || 'INSUFFICIENT_DATA',
                    candleCompleted: false,
                    waitReason: extracted.reason || 'Visual candlestick pattern unreadable.',
                    indicatorsEvaluated: {
                        trend: 'UNREADABLE',
                        ema: 'UNREADABLE',
                        bollinger: 'UNREADABLE',
                        rsi: 'UNREADABLE',
                        candles: 'UNREADABLE'
                    },
                    analyzedAt: now
                };
            }

            // Independent Evidence Categories:
            // A. PRICE_ACTION: Completed candle polarity and patterns
            // B. MOMENTUM: RSI 14 rebound / rejection
            // C. VOLATILITY: Bollinger Band bounce / rejection
            const priceActionUp = [];
            const priceActionDown = [];
            const momentumUp = [];
            const momentumDown = [];
            const volatilityUp = [];
            const volatilityDown = [];
            const conflicting = [];

            const indicators = {
                priceAction: 'NEUTRAL',
                momentum: 'NEUTRAL',
                volatility: 'NEUTRAL',
                trend: 'NEUTRAL',
                ema: 'NEUTRAL',
                bollinger: 'NEUTRAL',
                rsi: 'NEUTRAL',
                candles: 'NEUTRAL'
            };

            const lastCandle = extracted.lastCompletedCandle;
            const candleCompleted = Boolean(extracted.candleCompleted);

            // A. PRICE_ACTION Category
            if (lastCandle) {
                if (lastCandle.polarity === 'BULLISH') {
                    indicators.candles = 'BULLISH';
                    indicators.priceAction = 'BULLISH';
                    priceActionUp.push('Completed candle closed bullish (green).');
                } else if (lastCandle.polarity === 'BEARISH') {
                    indicators.candles = 'BEARISH';
                    indicators.priceAction = 'BEARISH';
                    priceActionDown.push('Completed candle closed bearish (red).');
                }
            }

            // Trend context: visualTrend is supplementary candle sequence context, NOT an independent category
            if (extracted.visualTrend === 'BULLISH') {
                indicators.trend = 'BULLISH';
                indicators.ema = 'BULLISH';
                if (priceActionDown.length > 0) {
                    conflicting.push('Bearish completed candle opposes prevailing bullish trend.');
                }
            } else if (extracted.visualTrend === 'BEARISH') {
                indicators.trend = 'BEARISH';
                indicators.ema = 'BEARISH';
                if (priceActionUp.length > 0) {
                    conflicting.push('Bullish completed candle opposes prevailing bearish trend.');
                }
            } else {
                indicators.trend = 'NEUTRAL';
                indicators.ema = 'NEUTRAL';
            }

            // B. MOMENTUM Category (RSI 14)
            // Evaluated ONLY when sub-panel is present and sufficiently readable
            if (extracted.rsiVisualZone === 'OVERSOLD' && extracted.rsiSlope === 'RISING') {
                indicators.rsi = 'BULLISH';
                indicators.momentum = 'BULLISH';
                momentumUp.push('RSI 14 rebounded upward from oversold zone.');
            } else if (extracted.rsiVisualZone === 'OVERBOUGHT' && extracted.rsiSlope === 'FALLING') {
                indicators.rsi = 'BEARISH';
                indicators.momentum = 'BEARISH';
                momentumDown.push('RSI 14 rejected downward from overbought zone.');
            } else if (extracted.rsiVisualZone === 'OVERBOUGHT' && priceActionUp.length > 0) {
                conflicting.push('RSI 14 is overbought; price is at risk of exhaustion.');
            } else if (extracted.rsiVisualZone === 'OVERSOLD' && priceActionDown.length > 0) {
                conflicting.push('RSI 14 is oversold; price is at risk of exhaustion.');
            } else {
                indicators.rsi = 'NEUTRAL';
                indicators.momentum = 'NEUTRAL';
            }

            // C. VOLATILITY Category (Bollinger Bands)
            // Evaluated ONLY when price has tested extreme band envelope support/resistance
            if (extracted.bollingerPosition === 'LOWER_BAND_TEST') {
                indicators.bollinger = 'BULLISH';
                indicators.volatility = 'BULLISH';
                volatilityUp.push('Price tested lower Bollinger Band support and bounced.');
            } else if (extracted.bollingerPosition === 'UPPER_BAND_TEST') {
                indicators.bollinger = 'BEARISH';
                indicators.volatility = 'BEARISH';
                volatilityDown.push('Price tested upper Bollinger Band resistance and rejected.');
            } else {
                indicators.bollinger = 'NEUTRAL';
                indicators.volatility = 'NEUTRAL';
            }

            // Detect conflicts between independent categories
            if (priceActionUp.length > 0) {
                if (momentumDown.length > 0) conflicting.push('Bullish price action conflicts with falling bearish momentum.');
                if (volatilityDown.length > 0) conflicting.push('Bullish price action conflicts with upper Bollinger Band resistance.');
            }
            if (priceActionDown.length > 0) {
                if (momentumUp.length > 0) conflicting.push('Bearish price action conflicts with rising bullish momentum.');
                if (volatilityUp.length > 0) conflicting.push('Bearish price action conflicts with lower Bollinger Band support.');
            }

            // Strict Confluence Evaluation:
            // 1. Requires PRICE_ACTION (completed candle)
            // 2. PLUS at least one independent MOMENTUM or VOLATILITY confirmation
            // 3. Candle sequence alone (visualTrend) must NEVER count as independent confirmation
            // 4. Zero conflicting evidence
            // 5. Candle completed confirmation required
            let candidate = 'WAIT';
            let confidenceTier = 'NONE';
            let waitReason = null;
            const supportingEvidence = [];

            const independentUp = [...momentumUp, ...volatilityUp];
            const independentDown = [...momentumDown, ...volatilityDown];

            if (priceActionUp.length > 0 && priceActionDown.length === 0) {
                if (conflicting.length > 0) {
                    candidate = 'WAIT';
                    confidenceTier = 'NONE';
                    waitReason = `Conflicting technical factors detected: ${conflicting.join(' ')}`;
                } else if (independentUp.length === 0) {
                    candidate = 'WAIT';
                    confidenceTier = 'NONE';
                    waitReason = 'Price action shows bullish candle, but independent momentum (RSI) or volatility (Bollinger) confirmation is missing.';
                } else if (!candleCompleted) {
                    candidate = 'WAIT';
                    confidenceTier = 'LOW';
                    waitReason = 'Bullish confluence identified, but awaiting confirmed candle close.';
                } else {
                    candidate = 'UP';
                    supportingEvidence.push(...priceActionUp, ...independentUp);
                    confidenceTier = independentUp.length >= 2 ? 'HIGH' : 'MEDIUM';
                }
            } else if (priceActionDown.length > 0 && priceActionUp.length === 0) {
                if (conflicting.length > 0) {
                    candidate = 'WAIT';
                    confidenceTier = 'NONE';
                    waitReason = `Conflicting technical factors detected: ${conflicting.join(' ')}`;
                } else if (independentDown.length === 0) {
                    candidate = 'WAIT';
                    confidenceTier = 'NONE';
                    waitReason = 'Price action shows bearish candle, but independent momentum (RSI) or volatility (Bollinger) confirmation is missing.';
                } else if (!candleCompleted) {
                    candidate = 'WAIT';
                    confidenceTier = 'LOW';
                    waitReason = 'Bearish confluence identified, but awaiting confirmed candle close.';
                } else {
                    candidate = 'DOWN';
                    supportingEvidence.push(...priceActionDown, ...independentDown);
                    confidenceTier = independentDown.length >= 2 ? 'HIGH' : 'MEDIUM';
                }
            } else if (priceActionUp.length > 0 && priceActionDown.length > 0) {
                candidate = 'WAIT';
                confidenceTier = 'NONE';
                conflicting.push('Conflicting price action: mixed green and red candle signals.');
                waitReason = 'Conflicting candle signals; market is showing mixed directional cues.';
            } else {
                candidate = 'WAIT';
                confidenceTier = 'NONE';
                waitReason = 'Insufficient technical confluence; market is consolidating or lacks clear directional price action.';
            }

            return {
                candidate,
                confidence_tier: confidenceTier,
                supportingEvidence: (candidate === 'UP' || candidate === 'DOWN') ? supportingEvidence : [],
                conflictingEvidence: conflicting,
                dataQuality: extracted.dataQuality,
                candleCompleted,
                candleId: (extracted.lastCompletedCandle && extracted.lastCompletedCandle.id) || (extracted.formingCandle && extracted.formingCandle.id) || 'candle-current',
                priceActionEvidence: priceActionUp.length > 0 ? priceActionUp.slice() : priceActionDown.slice(),
                momentumEvidence: momentumUp.length > 0 ? momentumUp.slice() : momentumDown.slice(),
                volatilityEvidence: volatilityUp.length > 0 ? volatilityUp.slice() : volatilityDown.slice(),
                waitReason,
                indicatorsEvaluated: indicators,
                analyzedAt: now
            };
        }

        return { evaluate };
    }

    return { createEngine };
});
