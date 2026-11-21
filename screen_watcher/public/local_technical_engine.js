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

            // Independent Evidence Categories (Symmetrically Balanced):
            // A. PRICE_ACTION: Completed candle polarity and candlestick patterns
            // B. TREND: Moving average slope, higher-highs/lower-lows, and candle sequence
            // C. MOMENTUM: RSI 14 rebound / rejection / directional expansion
            // D. VOLATILITY: Bollinger Band bounce / rejection / band walk expansion
            const priceActionUp = [];
            const priceActionDown = [];
            const trendUp = [];
            const trendDown = [];
            const momentumUp = [];
            const momentumDown = [];
            const volatilityUp = [];
            const volatilityDown = [];
            const conflicting = [];

            const indicators = {
                priceAction: 'NEUTRAL',
                trend: 'NEUTRAL',
                momentum: 'NEUTRAL',
                volatility: 'NEUTRAL',
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

                // Candlestick pattern recognition
                if (lastCandle.pattern === 'HAMMER') {
                    indicators.candles = 'BULLISH';
                    indicators.priceAction = 'BULLISH';
                    priceActionUp.push('Bullish Hammer pin-bar formed with strong lower wick rejection.');
                } else if (lastCandle.pattern === 'BULLISH_ENGULFING') {
                    indicators.candles = 'BULLISH';
                    indicators.priceAction = 'BULLISH';
                    priceActionUp.push('Bullish Engulfing pattern formed; buyers overwhelmed previous sellers.');
                } else if (lastCandle.pattern === 'SHOOTING_STAR') {
                    indicators.candles = 'BEARISH';
                    indicators.priceAction = 'BEARISH';
                    priceActionDown.push('Bearish Shooting Star formed with strong upper wick rejection.');
                } else if (lastCandle.pattern === 'BEARISH_ENGULFING') {
                    indicators.candles = 'BEARISH';
                    indicators.priceAction = 'BEARISH';
                    priceActionDown.push('Bearish Engulfing pattern formed; sellers overwhelmed previous buyers.');
                } else if (lastCandle.pattern === 'DOJI') {
                    conflicting.push('Indecision Doji candle detected; market lacks directional conviction.');
                }
            }

            // B. VOLATILITY Category (Bollinger Bands)
            // Symmetrically distinguishes Support Bounce, Resistance Rejection, and Trend Expansion
            // When indicators are unavailable or missing from pixels, never fabricate volatility confirmation
            if (extracted.bollingerPosition === 'UNAVAILABLE') {
                indicators.bollinger = 'UNAVAILABLE';
                indicators.volatility = 'UNAVAILABLE';
            } else if (extracted.bollingerPosition === 'LOWER_BAND_BOUNCE') {
                indicators.bollinger = 'BULLISH';
                indicators.volatility = 'BULLISH';
                volatilityUp.push('Price tested lower Bollinger Band support and bounced.');
            } else if (extracted.bollingerPosition === 'UPPER_BAND_WALK') {
                indicators.bollinger = 'BULLISH';
                indicators.volatility = 'BULLISH';
                volatilityUp.push('Price is riding upper Bollinger Band in strong trend expansion.');
            } else if (extracted.bollingerPosition === 'UPPER_BAND_REJECTION') {
                indicators.bollinger = 'BEARISH';
                indicators.volatility = 'BEARISH';
                volatilityDown.push('Price tested upper Bollinger Band resistance and rejected.');
            } else if (extracted.bollingerPosition === 'LOWER_BAND_WALK') {
                indicators.bollinger = 'BEARISH';
                indicators.volatility = 'BEARISH';
                volatilityDown.push('Price is riding lower Bollinger Band in strong trend expansion.');
            } else if (extracted.bollingerPosition === 'UPPER_BAND_TEST') {
                if (priceActionDown.length > 0) {
                    indicators.bollinger = 'BEARISH';
                    indicators.volatility = 'BEARISH';
                    volatilityDown.push('Price tested upper Bollinger Band resistance and rejected.');
                } else if (priceActionUp.length > 0) {
                    indicators.bollinger = 'TESTING_RESISTANCE';
                    indicators.volatility = 'NEUTRAL';
                    conflicting.push('Price is testing upper Bollinger Band boundary; risk of resistance rejection.');
                }
            } else if (extracted.bollingerPosition === 'LOWER_BAND_TEST') {
                if (priceActionUp.length > 0) {
                    indicators.bollinger = 'BULLISH';
                    indicators.volatility = 'BULLISH';
                    volatilityUp.push('Price tested lower Bollinger Band support and bounced.');
                } else if (priceActionDown.length > 0) {
                    indicators.bollinger = 'TESTING_SUPPORT';
                    indicators.volatility = 'NEUTRAL';
                    conflicting.push('Price is testing lower Bollinger Band boundary; risk of support bounce.');
                }
            } else {
                indicators.bollinger = 'NEUTRAL';
                indicators.volatility = 'NEUTRAL';
            }

            // C. MOMENTUM Category (RSI 14)
            // Evaluated ONLY when sub-panel is present and sufficiently readable
            if (extracted.rsiVisualZone === 'OVERSOLD' && extracted.rsiSlope === 'RISING') {
                indicators.rsi = 'BULLISH';
                indicators.momentum = 'BULLISH';
                momentumUp.push('RSI 14 rebounded upward from oversold zone.');
            } else if (extracted.rsiVisualZone === 'NEUTRAL' && extracted.rsiSlope === 'RISING' &&
                       (extracted.visualTrend === 'BULLISH' || extracted.priceStructure === 'HIGHER_HIGHS_HIGHER_LOWS' || extracted.bollingerPosition === 'UPPER_BAND_WALK')) {
                indicators.rsi = 'BULLISH';
                indicators.momentum = 'BULLISH';
                momentumUp.push('RSI 14 expanding upward with healthy bullish momentum.');
            } else if (extracted.rsiVisualZone === 'OVERBOUGHT' && extracted.rsiSlope === 'FALLING') {
                indicators.rsi = 'BEARISH';
                indicators.momentum = 'BEARISH';
                momentumDown.push('RSI 14 rejected downward from overbought zone.');
            } else if (extracted.rsiVisualZone === 'NEUTRAL' && extracted.rsiSlope === 'FALLING' &&
                       (extracted.visualTrend === 'BEARISH' || extracted.priceStructure === 'LOWER_HIGHS_LOWER_LOWS' || extracted.bollingerPosition === 'LOWER_BAND_WALK')) {
                indicators.rsi = 'BEARISH';
                indicators.momentum = 'BEARISH';
                momentumDown.push('RSI 14 expanding downward with healthy bearish momentum.');
            } else if (extracted.rsiVisualZone === 'OVERBOUGHT' && priceActionUp.length > 0 && extracted.bollingerPosition !== 'UPPER_BAND_WALK') {
                conflicting.push('RSI 14 is overbought; price is at risk of exhaustion.');
            } else if (extracted.rsiVisualZone === 'OVERSOLD' && priceActionDown.length > 0 && extracted.bollingerPosition !== 'LOWER_BAND_WALK') {
                conflicting.push('RSI 14 is oversold; price is at risk of exhaustion.');
            } else {
                indicators.rsi = 'NEUTRAL';
                indicators.momentum = 'NEUTRAL';
            }

            // D. TREND Category
            // Combines visualTrend sequence, price structure (HH/HL vs LH/LL), and moving average slope
            if (extracted.visualTrend === 'BULLISH') {
                trendUp.push('Candle sequence shows prevailing bullish trend.');
            }
            if (extracted.priceStructure === 'HIGHER_HIGHS_HIGHER_LOWS') {
                trendUp.push('Price structure forming consistent higher highs and higher lows.');
            }
            if (extracted.movingAverage === 'BULLISH') {
                trendUp.push('Short-term moving average is rising above slow baseline.');
            }

            if (extracted.visualTrend === 'BEARISH') {
                trendDown.push('Candle sequence shows prevailing bearish trend.');
            }
            if (extracted.priceStructure === 'LOWER_HIGHS_LOWER_LOWS') {
                trendDown.push('Price structure forming consistent lower highs and lower lows.');
            }
            if (extracted.movingAverage === 'BEARISH') {
                trendDown.push('Short-term moving average is declining below slow baseline.');
            }

            if (trendUp.length > 0 && trendDown.length === 0) {
                indicators.trend = 'BULLISH';
                indicators.ema = 'BULLISH';
            } else if (trendDown.length > 0 && trendUp.length === 0) {
                indicators.trend = 'BEARISH';
                indicators.ema = 'BEARISH';
            } else {
                indicators.trend = 'NEUTRAL';
                indicators.ema = 'NEUTRAL';
            }

            // Reversal Trap vs Counter-Trend Conflict Resolution:
            // If price action opposes prior trend, allow validated support bounces / resistance rejections,
            // but flag unconfirmed counter-trend moves as conflicting.
            if (trendDown.length > 0 && priceActionUp.length > 0) {
                if (volatilityUp.length > 0 || momentumUp.length > 0) {
                    trendUp.push('Bullish reversal reaction off key support level against prior bearish trend.');
                } else {
                    conflicting.push('Bullish completed candle opposes prevailing bearish trend.');
                }
            }
            if (trendUp.length > 0 && priceActionDown.length > 0) {
                if (volatilityDown.length > 0 || momentumDown.length > 0) {
                    trendDown.push('Bearish rejection reaction off key resistance level against prior bullish trend.');
                } else {
                    conflicting.push('Bearish completed candle opposes prevailing bullish trend.');
                }
            }

            // Detect cross-category conflicts between independent factors
            if (priceActionUp.length > 0) {
                if (momentumDown.length > 0) conflicting.push('Bullish price action conflicts with falling bearish momentum.');
                if (volatilityDown.length > 0) conflicting.push('Bullish price action conflicts with upper Bollinger Band resistance.');
            }
            if (priceActionDown.length > 0) {
                if (momentumUp.length > 0) conflicting.push('Bearish price action conflicts with rising bullish momentum.');
                if (volatilityUp.length > 0) conflicting.push('Bearish price action conflicts with lower Bollinger Band support.');
            }

            // Strict Confluence & Directional Balance Evaluation:
            // 1. Requires PRICE_ACTION (completed candle)
            // 2. PLUS at least one independent MOMENTUM or VOLATILITY confirmation
            // 3. Candle sequence alone (visualTrend) must NEVER count as independent confirmation
            // 4. Zero conflicting evidence
            // 5. Candle completed confirmation required
            let candidate = 'WAIT';
            let signalStrength = 'NONE';
            let confidenceTier = 'NONE';
            let waitReason = null;
            const supportingEvidence = [];

            const independentUp = [...momentumUp, ...volatilityUp];
            const independentDown = [...momentumDown, ...volatilityDown];

            if (priceActionUp.length > 0 && priceActionDown.length === 0) {
                if (conflicting.length > 0) {
                    candidate = 'WAIT';
                    confidenceTier = 'NONE';
                    signalStrength = 'WAIT';
                    waitReason = `Conflicting technical factors detected: ${conflicting.join(' ')}`;
                } else if (independentUp.length === 0) {
                    candidate = 'WAIT';
                    confidenceTier = 'NONE';
                    signalStrength = 'WAIT';
                    waitReason = 'Price action shows bullish candle, but independent momentum (RSI) or volatility (Bollinger) confirmation is missing.';
                } else if (!candleCompleted) {
                    candidate = 'WAIT';
                    confidenceTier = 'LOW';
                    signalStrength = 'WAIT';
                    waitReason = 'Bullish confluence identified, but awaiting confirmed candle close.';
                } else {
                    candidate = 'UP';
                    supportingEvidence.push(...priceActionUp, ...independentUp);
                    if (trendUp.length > 0) {
                        supportingEvidence.push(...trendUp);
                    }
                    if (independentUp.length >= 2) {
                        signalStrength = 'STRONG';
                        confidenceTier = 'HIGH';
                    } else {
                        signalStrength = 'MODERATE';
                        confidenceTier = 'MEDIUM';
                    }
                }
            } else if (priceActionDown.length > 0 && priceActionUp.length === 0) {
                if (conflicting.length > 0) {
                    candidate = 'WAIT';
                    confidenceTier = 'NONE';
                    signalStrength = 'WAIT';
                    waitReason = `Conflicting technical factors detected: ${conflicting.join(' ')}`;
                } else if (independentDown.length === 0) {
                    candidate = 'WAIT';
                    confidenceTier = 'NONE';
                    signalStrength = 'WAIT';
                    waitReason = 'Price action shows bearish candle, but independent momentum (RSI) or volatility (Bollinger) confirmation is missing.';
                } else if (!candleCompleted) {
                    candidate = 'WAIT';
                    confidenceTier = 'LOW';
                    signalStrength = 'WAIT';
                    waitReason = 'Bearish confluence identified, but awaiting confirmed candle close.';
                } else {
                    candidate = 'DOWN';
                    supportingEvidence.push(...priceActionDown, ...independentDown);
                    if (trendDown.length > 0) {
                        supportingEvidence.push(...trendDown);
                    }
                    if (independentDown.length >= 2) {
                        signalStrength = 'STRONG';
                        confidenceTier = 'HIGH';
                    } else {
                        signalStrength = 'MODERATE';
                        confidenceTier = 'MEDIUM';
                    }
                }
            } else if (priceActionUp.length > 0 && priceActionDown.length > 0) {
                candidate = 'WAIT';
                confidenceTier = 'NONE';
                signalStrength = 'WAIT';
                conflicting.push('Conflicting price action: mixed green and red candle signals.');
                waitReason = 'Conflicting candle signals; market is showing mixed directional cues.';
            } else {
                candidate = 'WAIT';
                confidenceTier = 'NONE';
                signalStrength = 'WAIT';
                waitReason = 'Insufficient technical confluence; market is consolidating or lacks clear directional price action.';
            }

            return {
                candidate,
                signal_strength: signalStrength,
                confidence_tier: confidenceTier,
                supportingEvidence: (candidate === 'UP' || candidate === 'DOWN') ? supportingEvidence : [],
                conflictingEvidence: conflicting,
                dataQuality: extracted.dataQuality,
                candleCompleted,
                candleId: (extracted.lastCompletedCandle && extracted.lastCompletedCandle.id) || (extracted.formingCandle && extracted.formingCandle.id) || 'candle-current',
                priceActionEvidence: priceActionUp.length > 0 ? priceActionUp.slice() : priceActionDown.slice(),
                trendEvidence: trendUp.length > 0 ? trendUp.slice() : trendDown.slice(),
                momentumEvidence: momentumUp.length > 0 ? momentumUp.slice() : momentumDown.slice(),
                volatilityEvidence: volatilityUp.length > 0 ? volatilityUp.slice() : volatilityDown.slice(),
                waitReason,
                indicatorsEvaluated: indicators,
                analyzedAt: now,
                signalGeneratedAt: (candidate === 'UP' || candidate === 'DOWN') ? now : null,
                candleClosedAt: extracted.candleClosedAt || (extracted.lastCompletedCandle && extracted.lastCompletedCandle.candleClosedAt) || null,
                signalStatus: (() => {
                    if (candidate === 'WAIT') {
                        if (!candleCompleted) return 'WAITING_FOR_CANDLE_CLOSE';
                        if (conflicting.length > 0) return 'WAIT — CONFLICTING EVIDENCE';
                        if ((candidate === 'UP' && priceActionUp.length > 0) || (candidate === 'DOWN' && priceActionDown.length > 0)) {
                            if (independentUp.length === 0 && independentDown.length === 0) return 'WAIT — NO INDEPENDENT CONFIRMATION';
                        }
                        return 'WAIT — NO SAFE ENTRY';
                    }
                    // Candidate is UP or DOWN
                    if (!candleCompleted) return 'WAITING_FOR_CANDLE_CLOSE';
                    const candleCloseTime = extracted.candleClosedAt || (extracted.lastCompletedCandle && extracted.lastCompletedCandle.candleClosedAt);
                    if (candleCloseTime) {
                        const entryWindowExpiresAt = candleCloseTime + 60000; // 1-minute fixed window from candle close
                        if (now > entryWindowExpiresAt) return 'ENTRY_WINDOW_EXPIRED';
                        if (now > candleCloseTime + 5000) return 'SIGNAL_CONFIRMED — ENTRY WINDOW CLOSING';
                    }
                    return 'SIGNAL_CONFIRMED';
                })(),
                recommendedEntryBy: (() => {
                    const candleCloseTime = extracted.candleClosedAt || (extracted.lastCompletedCandle && extracted.lastCompletedCandle.candleClosedAt);
                    return candleCloseTime ? candleCloseTime + 2000 : null; // Recommend entry within 2s of candle close
                })(),
                entryWindowExpiresAt: (() => {
                    const candleCloseTime = extracted.candleClosedAt || (extracted.lastCompletedCandle && extracted.lastCompletedCandle.candleClosedAt);
                    return candleCloseTime ? candleCloseTime + 60000 : null; // 1-minute expiry aligned to candle close
                })()
            };
        }

        return { evaluate };
    }

    return { createEngine };
});
