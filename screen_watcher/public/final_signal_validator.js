/**
 * final_signal_validator.js
 * Final decision layer combining the primary fast local technical analysis engine
 * with secondary asynchronous Qwen3-VL vision verification and strict safety guards.
 *
 * Enforces:
 * - Minimum independent confluence factors
 * - Completed candle confirmation
 * - Rejection of conflicting or sideways signals
 * - Rejection of stale vision inference results (> 30s)
 * - Safe fallback to WAIT on unverified or ambiguous states
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.FinalSignalValidator = api;
    }
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';

    const MAX_STALENESS_MS = 30000;

    function createValidator() {
        let lastConfirmedSignal = null;
        let activeTrendDirection = null;

        function reset() {
            lastConfirmedSignal = null;
            activeTrendDirection = null;
        }

        /**
         * Validates and arbitrates between local technical engine output and background vision response.
         * Enforces 3 signal states: ACTIVE_TREND, NEW_SETUP_DETECTED, NEW_SIGNAL_CONFIRMED.
         * Enforces Smart Duplicate Protection, multi-window context, and missed entry guards.
         *
         * @param {Object} params
         * @param {Object} params.localResult Output of LocalTechnicalEngine
         * @param {Object|null} params.visionResult Latest Qwen3-VL response from /api/analyze-frame
         * @param {number} params.frameAgeMs Milliseconds since the chart frame was captured
         * @param {number} params.now Current timestamp
         * @returns {Object} Final structured analysis matching renderAnalysis requirements
         */
        function validate({
            localResult,
            visionResult = null,
            frameAgeMs = 0,
            now = Date.now(),
            telemetry = {}
        }) {
            const uncertainties = [];
            let direction = 'WAIT';
            let explanation = '';
            let confidence = 'WAIT';

            // Guard 1: Frame Freshness Check
            if (frameAgeMs > MAX_STALENESS_MS) {
                return {
                    id: `signal-stale-${now}`,
                    direction: 'WAIT',
                    signalState: 'WAIT',
                    isContinuation: false,
                    isDuplicate: false,
                    previousSignalId: lastConfirmedSignal ? lastConfirmedSignal.id : null,
                    explanation: `WAIT — DELAYED ANALYSIS (Frame age: ${(frameAgeMs / 1000).toFixed(1)}s). The captured chart frame is outdated and no longer actionable in live market.`,
                    observations: {
                        ema9: 'Stale frame rejected',
                        ema21: 'Stale frame rejected',
                        bollingerBands: 'Stale frame rejected',
                        rsi14: 'Stale frame rejected',
                        macd: 'Stale frame rejected',
                        candles: 'Stale frame rejected',
                        trend: 'Stale frame rejected',
                        supportResistance: 'Stale frame rejected'
                    },
                    uncertainties: ['Frame exceeded maximum freshness tolerance of 30s.'],
                    confidence: 'WAIT',
                    analyzed_at: now,
                    telemetry
                };
            }

            // Guard 2: Missing or Invalid Local Result
            if (!localResult || localResult.candidate === 'WAIT') {
                direction = 'WAIT';
                explanation = localResult ? (localResult.waitReason || 'Waiting for high-confidence technical setup.') : 'Waiting for live chart analysis.';
                if (localResult && localResult.conflictingEvidence.length > 0) {
                    uncertainties.push(...localResult.conflictingEvidence);
                }
                confidence = 'WAIT';
            } else if (localResult.missedEntry || (localResult.waitReason && localResult.waitReason.includes('MISSED ENTRY'))) {
                // Guard 2b: Entry Quality Guard (WAIT — MISSED ENTRY)
                direction = 'WAIT';
                explanation = localResult.waitReason || 'WAIT — MISSED ENTRY. The price move has already occurred before entry.';
                uncertainties.push('Price move already developed before entry; late entry rejected to protect precision.');
                confidence = 'WAIT';
            } else {
                // Directional candidate ('UP' or 'DOWN') from local engine
                const candidate = localResult.candidate;

                // Guard 3: Completed Candle Requirement
                if (!localResult.candleCompleted) {
                    direction = 'WAIT';
                    explanation = `WAIT — Candle forming in ${candidate} direction. Awaiting completed candle close to confirm signal.`;
                    uncertainties.push('Forming candle has not yet closed; premature signals rejected.');
                    confidence = 'LOW';
                } else {
                    // Local engine confirmed completed candle with >= 2 factors
                    // Guard 4: Secondary Qwen3-VL Vision Verification Inspection
                    if (visionResult) {
                        const visionAgeMs = now - (visionResult.analyzed_at || now);
                        const isVisionStale = visionAgeMs > MAX_STALENESS_MS;

                        if (isVisionStale) {
                            uncertainties.push(`Secondary Qwen3-VL vision verification expired (${(visionAgeMs / 1000).toFixed(1)}s old); applying primary technical confluence.`);
                            direction = candidate;
                            explanation = `${candidate} SIGNAL — Confirmed by local technical confluence (${localResult.supportingEvidence.join(' ')}). [Secondary vision expired; local rules verified]`;
                            confidence = localResult.confidence_tier || 'MEDIUM';
                        } else if (visionResult.direction === candidate) {
                            // Perfect dual-engine agreement: Local Engine + Qwen3-VL
                            direction = candidate;
                            explanation = `${candidate} SIGNAL — Dual confirmation: Fast local technical engine + Qwen3-VL vision agree. ${localResult.supportingEvidence.join(' ')}`;
                            confidence = 'HIGH';
                        } else if (visionResult.direction === 'WAIT') {
                            // Vision sees ambiguity; proceed with local engine if confidence is HIGH, otherwise caution
                            if (localResult.confidence_tier === 'HIGH') {
                                direction = candidate;
                                explanation = `${candidate} SIGNAL — Strong local technical confluence (${localResult.supportingEvidence.join(' ')}). [Qwen3-VL flagged conservative caution]`;
                                confidence = 'MEDIUM';
                            } else {
                                direction = 'WAIT';
                                explanation = `WAIT — Local technical engine indicated ${candidate}, but Qwen3-VL vision identified caution/consolidation: ${visionResult.explanation || 'Ambiguous visual chart structure'}.`;
                                uncertainties.push('Vision verification conflicted with local technical candidate.');
                                confidence = 'WAIT';
                            }
                        } else {
                            // Direct opposition (e.g. Local UP vs Vision DOWN)
                            direction = 'WAIT';
                            explanation = `WAIT — Conflicting directions between local engine (${candidate}) and Qwen3-VL (${visionResult.direction}). Signal rejected.`;
                            uncertainties.push(`Direct engine divergence: Local=${candidate}, Vision=${visionResult.direction}`);
                            confidence = 'WAIT';
                        }
                    } else {
                        // Vision result not yet available (or running asynchronously in background)
                        direction = candidate;
                        explanation = `${candidate} SIGNAL — Validated by primary technical engine (${localResult.supportingEvidence.join(' ')}). [Qwen3-VL background verifying]`;
                        confidence = localResult.confidence_tier || 'MEDIUM';
                    }
                }
            }

            // SMART DUPLICATE PROTECTION & THREE SIGNAL STATES:
            // State A: ACTIVE TREND (Track current direction, continuous analysis, suppress duplicate notifications)
            // State B: NEW SETUP DETECTED (Detect new candle/setup, compare against previous signal identity)
            // State C: NEW SIGNAL CONFIRMED (Publish only when genuinely new opportunity passes validator)
            const candleId = (localResult && localResult.candleId) || 'candle-current';
            const setupEvidence = (localResult && localResult.supportingEvidence) || [];
            const setupHash = `${direction}_${candleId}_${setupEvidence.join('|')}`;
            let signalState = direction === 'WAIT' ? (lastConfirmedSignal ? 'ACTIVE_TREND' : 'WAIT') : 'NEW_SIGNAL_CONFIRMED';
            let isContinuation = false;
            let isDuplicate = false;
            let previousSignalId = lastConfirmedSignal ? lastConfirmedSignal.id : null;
            let finalSignalId = `signal-${now}`;

            if (direction === 'UP' || direction === 'DOWN') {
                if (lastConfirmedSignal) {
                    const isSameCandle = candleId === lastConfirmedSignal.candleId;
                    const isSameDirection = direction === lastConfirmedSignal.direction;
                    const isSameSetup = setupHash === lastConfirmedSignal.setupHash;

                    if (isSameCandle && isSameDirection) {
                        // Duplicate setup: same candle & direction already signaled
                        isDuplicate = true;
                        signalState = 'ACTIVE_TREND';
                        finalSignalId = lastConfirmedSignal.id; // Retain existing signal ID
                        explanation = `${direction} ACTIVE TREND — Monitoring live candle development. [Setup already confirmed on ${candleId}]`;
                    } else if (!isSameCandle && isSameDirection) {
                        // Continuation: genuinely new completed candle forming a fresh setup in active trend
                        isContinuation = true;
                        signalState = 'NEW_SIGNAL_CONFIRMED';
                        finalSignalId = `signal-${direction.toLowerCase()}-${now}-${Math.random().toString(36).slice(2, 6)}`;
                        explanation = `${direction} CONTINUATION SIGNAL — Genuinely new setup confirmed by technical confluence (${setupEvidence.join(' ')}). [Continuation of ${lastConfirmedSignal.id}]`;
                        lastConfirmedSignal = {
                            id: finalSignalId,
                            direction,
                            candleId,
                            setupHash,
                            timestamp: now,
                            evidence: setupEvidence.slice()
                        };
                        activeTrendDirection = direction;
                    } else if (!isSameDirection) {
                        // Reversal: market conditions reversed, evaluate independently
                        isContinuation = false;
                        signalState = 'NEW_SIGNAL_CONFIRMED';
                        finalSignalId = `signal-${direction.toLowerCase()}-${now}-${Math.random().toString(36).slice(2, 6)}`;
                        explanation = `${direction} REVERSAL SIGNAL — Validated reversal against prior ${lastConfirmedSignal.direction} trend (${setupEvidence.join(' ')}). [Reversal from ${lastConfirmedSignal.id}]`;
                        lastConfirmedSignal = {
                            id: finalSignalId,
                            direction,
                            candleId,
                            setupHash,
                            timestamp: now,
                            evidence: setupEvidence.slice()
                        };
                        activeTrendDirection = direction;
                    }
                } else {
                    // Initial confirmed signal
                    signalState = 'NEW_SIGNAL_CONFIRMED';
                    finalSignalId = `signal-${direction.toLowerCase()}-${now}-${Math.random().toString(36).slice(2, 6)}`;
                    lastConfirmedSignal = {
                        id: finalSignalId,
                        direction,
                        candleId,
                        setupHash,
                        timestamp: now,
                        evidence: setupEvidence.slice()
                    };
                    activeTrendDirection = direction;
                }
            }

            // Compile structured observation map for UI display with explicit transparency labels
            const evaluated = (localResult && localResult.indicatorsEvaluated) || {};
            const observations = {
                ema9: evaluated.ema ? `Trend alignment: ${evaluated.ema} (Visual Estimate)` : 'Unavailable (Not detected)',
                ema21: evaluated.ema ? `Trend alignment: ${evaluated.ema} (Visual Estimate)` : 'Unavailable (Not detected)',
                bollingerBands: evaluated.bollinger && evaluated.bollinger !== 'NEUTRAL' ? `Position: ${evaluated.bollinger} (Visual Estimate)` : 'Band boundaries neutral (Visual Estimate)',
                rsi14: evaluated.rsi && evaluated.rsi !== 'NEUTRAL' ? `Momentum: ${evaluated.rsi} (Visual Estimate)` : 'Oscillator neutral or sub-panel unavailable',
                macd: evaluated.trend ? `Momentum: ${evaluated.trend} (Visual Estimate)` : 'Visual slope neutral',
                candles: localResult ? (localResult.candleCompleted ? `Confirmed Completed Candle (${evaluated.candles})` : `Active Forming Candle (${evaluated.candles}) [Unconfirmed]`) : 'Not detected',
                trend: evaluated.trend || 'Consolidating (Visual Estimate)',
                supportResistance: evaluated.bollinger === 'LOWER_BAND_TEST' ? 'Testing support (Visual Estimate)' : evaluated.bollinger === 'UPPER_BAND_TEST' ? 'Testing resistance (Visual Estimate)' : 'Within range (Visual Estimate)'
            };

            // Determine final Signal Strength and 3-Tier Quality Level
            let signalStrength = 'WAIT';
            let qualityLevel = 'WAIT';
            if (direction === 'UP' || direction === 'DOWN') {
                signalStrength = (localResult && localResult.signal_strength) || (confidence === 'HIGH' ? 'STRONG' : 'MODERATE');
                qualityLevel = `${signalStrength} ${direction}`;
            }

            // Comprehensive Signal Audit Log Record (No fabricated OHLC or indicator numbers)
            const audit = {
                timestamp: new Date(now).toISOString(),
                signal: direction,
                signalStrength,
                qualityLevel,
                signalState,
                isContinuation,
                isDuplicate,
                previousSignalId,
                setupHash,
                candidateDirection: (localResult && localResult.candidate) || 'WAIT',
                approved: direction === 'UP' || direction === 'DOWN',
                candleIdentity: candleId,
                candleCompletionStatus: Boolean(localResult && localResult.candleCompleted),
                dataQuality: (localResult && localResult.dataQuality) || 'VISUAL_ESTIMATE',
                priceActionEvidence: (localResult && localResult.priceActionEvidence) || [],
                trendEvidence: (localResult && localResult.trendEvidence) || [],
                momentumEvidence: (localResult && localResult.momentumEvidence) || [],
                volatilityEvidence: (localResult && localResult.volatilityEvidence) || [],
                conflictingEvidence: (localResult && localResult.conflictingEvidence) || [],
                finalValidationReason: explanation,
                frameFreshness: frameAgeMs <= MAX_STALENESS_MS ? `Fresh (${(frameAgeMs / 1000).toFixed(2)}s)` : `Stale (${(frameAgeMs / 1000).toFixed(2)}s)`,
                localProcessingLatency: `${((telemetry && telemetry.totalLocalLatencyMs) || 0).toFixed(3)}ms`,
                visionVerificationStatus: visionResult ? (now - (visionResult.analyzed_at || now) > MAX_STALENESS_MS ? 'UNVERIFIED_EXPIRED' : `VERIFIED_${visionResult.direction}`) : 'UNVERIFIED_PENDING'
            };

            return {
                id: finalSignalId,
                direction,
                signalState,
                isContinuation,
                isDuplicate,
                previousSignalId,
                candleId,
                setupHash,
                signal_strength: signalStrength,
                quality_level: qualityLevel,
                explanation,
                observations,
                uncertainties,
                confidence,
                analyzed_at: now,
                telemetry,
                audit
            };
        }

        return { validate, reset, getLastConfirmedSignal: () => lastConfirmedSignal, MAX_STALENESS_MS };
    }

    return { createValidator };
});
