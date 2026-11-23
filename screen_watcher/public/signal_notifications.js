(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.SignalNotifications = api;
    }
})(typeof globalThis === 'object' ? globalThis : this, function () {
    function createController({ onWait, onSignal, onScreenshotAnalysis, onLiveAnalysis, playSound, speakSignal, cooldownMs = 60000 } = {}) {
        const seenSignalIds = new Set();
        const seenScreenshotIds = new Set();
        const seenLiveIds = new Set();
        let lastWaitReason = null;
        let lastLiveDirection = null;
        let lastLiveCandleId = null;
        let lastLiveSetupHash = null;
        let lastLiveAlertTime = 0;

        function notifyWait(reason) {
            const message = reason || 'Signal validation is unavailable. WAIT.';
            if (message === lastWaitReason) return false;
            lastWaitReason = message;
            if (typeof onWait === 'function') onWait(message);
            return true;
        }

        function notifyValidated(signal) {
            if (!signal || signal.validation_status !== 'VALIDATED' ||
                !['UP', 'DOWN'].includes(signal.direction)) {
                return notifyWait(signal && signal.reason);
            }
            if (typeof signal.id !== 'string' || signal.id.length === 0) {
                throw new TypeError('A validated signal must have a unique id.');
            }
            if (seenSignalIds.has(signal.id)) return false;
            seenSignalIds.add(signal.id);
            lastWaitReason = null;
            if (typeof onSignal === 'function') onSignal(signal);
            if (typeof playSound === 'function') playSound(signal.direction, signal.id);
            return true;
        }

        function notifyScreenshotAnalysis(analysis) {
            if (!analysis || analysis.analysis_type !== 'SCREENSHOT_VISUAL' ||
                !['UP', 'DOWN'].includes(analysis.direction)) return false;
            if (typeof analysis.id !== 'string' || analysis.id.length === 0) {
                throw new TypeError('A screenshot analysis must have a unique id.');
            }
            if (seenScreenshotIds.has(analysis.id)) return false;
            seenScreenshotIds.add(analysis.id);
            if (seenScreenshotIds.size > 200) {
                seenScreenshotIds.delete(seenScreenshotIds.values().next().value);
            }
            if (typeof onScreenshotAnalysis === 'function') onScreenshotAnalysis(analysis);
            if (typeof playSound === 'function') playSound(analysis.direction, analysis.id);
            return true;
        }

        function notifyLiveAnalysis(analysis, now = Date.now()) {
            if (!analysis || !['UP', 'DOWN', 'WAIT'].includes(analysis.direction)) return false;

            if (analysis.direction === 'WAIT') {
                notifyWait(analysis.explanation || 'Market consolidating or indicators conflict. WAIT.');
                return false;
            }

            const signalId = typeof analysis.id === 'string' && analysis.id.length > 0
                ? analysis.id
                : `live-${now}-${Math.random().toString(36).slice(2, 8)}`;

            // SMART DUPLICATE PROTECTION:
            // 1. Suppress if explicitly marked as duplicate or in ACTIVE_TREND without new confirmation
            if (analysis.isDuplicate === true || analysis.signalState === 'ACTIVE_TREND') {
                if (typeof onLiveAnalysis === 'function') onLiveAnalysis(analysis);
                return false;
            }

            // 2. Suppress if identical signal ID already notified
            if (seenLiveIds.has(signalId)) {
                if (typeof onLiveAnalysis === 'function') onLiveAnalysis(analysis);
                return false;
            }

            const candleId = analysis.candleId || (analysis.audit && analysis.audit.candleIdentity) || null;
            const setupHash = analysis.setupHash || (analysis.audit && analysis.audit.setupHash) || null;

            // 3. Determine if this is a genuine continuation setup
            const isContinuation = analysis.isContinuation === true ||
                (analysis.signalState === 'NEW_SIGNAL_CONFIRMED' &&
                 analysis.direction === lastLiveDirection &&
                 Boolean(candleId && lastLiveCandleId && candleId !== lastLiveCandleId));

            // 4. Suppress duplicate candles across multiple frames (same candle, same direction)
            if (candleId && lastLiveCandleId && candleId === lastLiveCandleId && analysis.direction === lastLiveDirection && !isContinuation) {
                if (typeof onLiveAnalysis === 'function') onLiveAnalysis(analysis);
                return false;
            }

            // 5. Directional duplicate check with continuation bypass
            const isDuplicateDirection = analysis.direction === lastLiveDirection;
            const withinCooldown = (now - lastLiveAlertTime) < cooldownMs;

            if (isDuplicateDirection && withinCooldown && !isContinuation) {
                if (typeof onLiveAnalysis === 'function') onLiveAnalysis(analysis);
                return false;
            }

            seenLiveIds.add(signalId);
            if (seenLiveIds.size > 200) {
                seenLiveIds.delete(seenLiveIds.values().next().value);
            }

            lastLiveDirection = analysis.direction;
            lastLiveCandleId = candleId;
            lastLiveSetupHash = setupHash;
            lastLiveAlertTime = now;
            lastWaitReason = null;

            if (typeof onLiveAnalysis === 'function') onLiveAnalysis(analysis);
            if (typeof playSound === 'function') playSound(analysis.direction, signalId, analysis.signal_strength);
            if (typeof speakSignal === 'function') speakSignal(analysis.direction, analysis.signal_strength);
            return true;
        }

        return {
            notifyWait,
            notifyValidated,
            notifyScreenshotAnalysis,
            notifyLiveAnalysis
        };
    }

    return { createController };
});
