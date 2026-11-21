(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.SignalOutcomeTracker = api;
    }
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';

    function createTracker({
        fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
        storage = typeof localStorage !== 'undefined' ? localStorage : null,
        onMetricsUpdated = null,
        now = Date.now,
        logger = console
    } = {}) {
        let pendingSignals = [];
        let latestMetrics = null;

        // Load pending signals from local cache if available
        if (storage) {
            try {
                const cached = storage.getItem('qx_pending_signals_v1');
                if (cached) {
                    pendingSignals = JSON.parse(cached);
                }
            } catch (err) {
                logger.warn('Failed to parse cached pending signals:', err);
            }
        }

        function savePendingCache() {
            if (storage) {
                try {
                    storage.setItem('qx_pending_signals_v1', JSON.stringify(pendingSignals));
                } catch (e) {
                    logger.warn('Could not save pending signals cache:', e);
                }
            }
        }

        async function postJson(url, data) {
            if (!fetchImpl) return null;
            try {
                const res = await fetchImpl(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({}));
                    throw new Error(errBody.error || `HTTP ${res.status}`);
                }
                return await res.json();
            } catch (err) {
                logger.error(`POST ${url} failed:`, err);
                return null;
            }
        }

        async function fetchMetrics() {
            if (!fetchImpl) return null;
            try {
                const res = await fetchImpl('/api/performance');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                latestMetrics = data;
                if (typeof onMetricsUpdated === 'function') {
                    onMetricsUpdated(data);
                }
                return data;
            } catch (err) {
                logger.error('Failed to fetch performance metrics:', err);
                return null;
            }
        }

        /**
         * Tracks a newly confirmed UP or DOWN directional signal.
         */
        async function trackSignal(signal, options = {}) {
            if (!signal || (signal.direction !== 'UP' && signal.direction !== 'DOWN')) {
                return null;
            }

            const currentNow = typeof now === 'function' ? now() : Date.now();
            const expiryDuration = Number.isInteger(options.expiryDuration) ? options.expiryDuration : 60;

            // Use candle close time for expiry alignment (1-minute binary option expiry)
            // If candleClosedAt is available, expiry is candleClosedAt + 60s
            // Otherwise fall back to currentNow + 60s (legacy behavior)
            const candleClosedAt = signal.candleClosedAt || (signal.audit && signal.audit.candleClosedAt) || null;
            const expiryMs = candleClosedAt ? candleClosedAt + 60000 : currentNow + expiryDuration * 1000;
            const expiryTimestamp = new Date(expiryMs).toISOString();

            const entryPrice = typeof options.entryPrice === 'number' ? options.entryPrice : null;
            const asset = options.asset || 'EUR/USD (Quotex)';
            const marketType = options.marketType || (asset.includes('OTC') ? 'OTC' : 'REGULAR');
            const timeframe = options.timeframe || '1M';

            const candleId = signal.candleId || (signal.audit && signal.audit.candleIdentity) || `candle-${currentNow}`;

            // Deduplication: Check if we already tracked a signal for this candle
            const existingByCandle = pendingSignals.find(s => s.candleId === candleId);
            if (existingByCandle) {
                logger.info(`Duplicate signal for candle ${candleId} ignored (existing: ${existingByCandle.id})`);
                return existingByCandle;
            }

            const record = {
                id: signal.id || `SIG-${currentNow}-${Math.random().toString(36).slice(2, 6)}`,
                timestamp: new Date(currentNow).toISOString(),
                asset,
                marketType,
                timeframe,
                direction: signal.direction,
                entryTimestamp: new Date(currentNow).toISOString(),
                entryPrice,
                expiryDuration,
                expiryTimestamp,
                expiryMs,
                candleId,
                candleClosedAt: candleClosedAt ? new Date(candleClosedAt).toISOString() : null,
                signalGeneratedAt: signal.signalGeneratedAt ? new Date(signal.signalGeneratedAt).toISOString() : null,
                signalStatus: signal.signalStatus || 'UNKNOWN',
                recommendedEntryBy: signal.recommendedEntryBy ? new Date(signal.recommendedEntryBy).toISOString() : null,
                entryWindowExpiresAt: signal.entryWindowExpiresAt ? new Date(signal.entryWindowExpiresAt).toISOString() : null,
                timeSinceCandleCloseMs: (candleClosedAt && typeof currentNow === 'number') ? currentNow - candleClosedAt : null,
                timeUntilEntryWindowExpiresMs: expiryMs - currentNow,
                candlePattern: (signal.observations && signal.observations.pattern) || 'NORMAL',
                candlePolarity: (signal.observations && signal.observations.candles) || 'UNKNOWN',
                technicalEvidence: signal.audit ? [
                    ...(signal.audit.priceActionEvidence || []),
                    ...(signal.audit.momentumEvidence || []),
                    ...(signal.audit.volatilityEvidence || [])
                ] : [],
                indicatorStates: signal.observations || {},
                visionStatus: signal.audit ? signal.audit.visionVerificationStatus : 'UNVERIFIED',
                confidence: signal.confidence || 'MEDIUM',
                validationReason: signal.explanation || '',
                algorithmVersion: 'v1.2.0-timing-fix',
                tradePlaced: Boolean(options.tradePlaced),
                outcome: 'PENDING'
            };

            // Avoid duplicate tracking of the same signal (by ID)
            if (!pendingSignals.some(s => s.id === record.id)) {
                pendingSignals.push(record);
                savePendingCache();
            }

            // Persist to SQLite backend
            await postJson('/api/signals', record);
            await fetchMetrics();

            return record;
        }

        /**
         * Explicit trade confirmation toggle.
         * User confirms whether they actually took the trade on Quotex.
         */
        async function recordTradeConfirmation(signalId, tradePlaced) {
            const sig = pendingSignals.find(s => s.id === signalId);
            if (sig) {
                sig.tradePlaced = Boolean(tradePlaced);
                savePendingCache();
            }

            await postJson('/api/signals/trade', { signalId, tradePlaced: Boolean(tradePlaced) });
            await fetchMetrics();
        }

        /**
         * Evaluates outcome when expiry window elapses.
         *
         * @param {Object} params
         * @param {string} params.signalId
         * @param {string} params.outcome - WIN | LOSS | DRAW | UNVERIFIED
         * @param {number|null} params.expiryPrice
         * @param {string|null} params.outcomeReason
         * @param {Object|null} params.subsequentEvidence
         */
        async function verifyOutcome(signalId, {
            outcome,
            expiryPrice = null,
            outcomeReason = null,
            subsequentEvidence = null
        }) {
            if (!['WIN', 'LOSS', 'DRAW', 'UNVERIFIED'].includes(outcome)) {
                throw new TypeError(`Invalid outcome: ${outcome}`);
            }

            // Remove from pending
            pendingSignals = pendingSignals.filter(s => s.id !== signalId);
            savePendingCache();

            // Post to backend database
            const result = await postJson('/api/signals/outcome', {
                signalId,
                outcome,
                expiryPrice,
                outcomeReason,
                subsequentEvidence
            });

            await fetchMetrics();
            return result;
        }

        /**
         * Periodically checks pending signals to see if any have expired.
         * Uses candle completion and/or price ticks to determine outcome reliably.
         */
        async function checkPendingExpiries(currentTime = Date.now(), latestCandleData = null, currentPrice = null) {
            const expired = pendingSignals.filter(s => currentTime >= s.expiryMs);
            if (expired.length === 0) return [];

            const verifiedList = [];

            for (const sig of expired) {
                let outcome = 'UNVERIFIED';
                let reason = '';
                const entryP = sig.entryPrice;
                const expiryP = typeof currentPrice === 'number' ? currentPrice : null;

                if (typeof entryP === 'number' && typeof expiryP === 'number') {
                    // Exact price payout verification
                    if (sig.direction === 'UP') {
                        if (expiryP > entryP) {
                            outcome = 'WIN';
                            reason = `Expiry price (${expiryP}) closed above entry (${entryP}).`;
                        } else if (expiryP < entryP) {
                            outcome = 'LOSS';
                            reason = `Expiry price (${expiryP}) closed below entry (${entryP}).`;
                        } else {
                            outcome = 'DRAW';
                            reason = `Expiry price (${expiryP}) tied entry (${entryP}).`;
                        }
                    } else if (sig.direction === 'DOWN') {
                        if (expiryP < entryP) {
                            outcome = 'WIN';
                            reason = `Expiry price (${expiryP}) closed below entry (${entryP}).`;
                        } else if (expiryP > entryP) {
                            outcome = 'LOSS';
                            reason = `Expiry price (${expiryP}) closed above entry (${entryP}).`;
                        } else {
                            outcome = 'DRAW';
                            reason = `Expiry price (${expiryP}) tied entry (${entryP}).`;
                        }
                    }
                } else if (latestCandleData && latestCandleData.polarity) {
                    // Visual candle polarity settlement check (1-minute binary expiry)
                    const subsequentPolarity = latestCandleData.polarity;
                    if (sig.direction === 'UP') {
                        if (subsequentPolarity === 'BULLISH') {
                            outcome = 'WIN';
                            reason = 'Subsequent 1M candle closed BULLISH (green).';
                        } else if (subsequentPolarity === 'BEARISH') {
                            outcome = 'LOSS';
                            reason = 'Subsequent 1M candle closed BEARISH (red).';
                        } else {
                            outcome = 'DRAW';
                            reason = 'Subsequent candle closed flat DOJI.';
                        }
                    } else if (sig.direction === 'DOWN') {
                        if (subsequentPolarity === 'BEARISH') {
                            outcome = 'WIN';
                            reason = 'Subsequent 1M candle closed BEARISH (red).';
                        } else if (subsequentPolarity === 'BULLISH') {
                            outcome = 'LOSS';
                            reason = 'Subsequent 1M candle closed BULLISH (green).';
                        } else {
                            outcome = 'DRAW';
                            reason = 'Subsequent candle closed flat DOJI.';
                        }
                    }
                } else {
                    outcome = 'UNVERIFIED';
                    reason = 'Visual chart data or price beacon unreadable at expiry.';
                }

                const res = await verifyOutcome(sig.id, {
                    outcome,
                    expiryPrice: expiryP,
                    outcomeReason: reason,
                    subsequentEvidence: latestCandleData ? {
                        polarity: latestCandleData.polarity,
                        body: latestCandleData.body,
                        pattern: latestCandleData.pattern
                    } : null
                });

                verifiedList.push({ id: sig.id, outcome, reason, res });
            }

            return verifiedList;
        }

        async function rollbackStrategy(targetVersion) {
            const res = await postJson('/api/strategy/rollback', { targetVersion });
            await fetchMetrics();
            return res;
        }

        async function recordCandidateAudit(candidateData) {
            if (!candidateData) return null;
            return await postJson('/api/candidate-audit', candidateData);
        }

        return {
            trackSignal,
            recordTradeConfirmation,
            verifyOutcome,
            checkPendingExpiries,
            fetchMetrics,
            rollbackStrategy,
            recordCandidateAudit,
            getPendingSignals: () => pendingSignals.slice(),
            getLatestMetrics: () => latestMetrics
        };
    }

    return { createTracker };
});
