(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.LiveScreenMonitor = api;
    }
})(typeof globalThis === 'object' ? globalThis : this, function () {
    const OBSERVATION_LABELS = {
        ema9: 'EMA 9',
        ema21: 'EMA 21',
        bollingerBands: 'Bollinger Bands',
        rsi14: 'RSI 14',
        macd: 'MACD 12/26/9',
        candles: 'Candles / Patterns',
        trend: 'Trend & Momentum',
        supportResistance: 'Support / Resistance'
    };

    function createMonitor({
        mediaDevices,
        video,
        preview,
        elements,
        captureFrame,
        captureHighResFrame,
        observeFrame,
        resetObserver,
        clearFrameCanvas,
        localChartExtractor = null,
        localTechnicalEngine = null,
        finalSignalValidator = null,
        autoStart = false,
        outcomeTracker = null,
        documentRef,
        windowRef,
        fetchImpl = (typeof globalThis !== 'undefined' ? globalThis.fetch : null),
        notificationController,
        now = Date.now,
        setIntervalFn = setInterval,
        clearIntervalFn = clearInterval,
        logger = console
    }) {
        let screenStream = null;
        let videoTrack = null;
        let samplingTimer = null;
        let samplingIntervalMs = 1500;
        let lastFrameAt = null;
        let monitoring = false;
        let userExplicitlyStopped = false;
        let connecting = false;
        let analyzing = false;
        let hasAnalyzedInitial = false;
        let latestLocalResult = null;
        let latestVisionResult = null;
        let pageHidden = Boolean(documentRef && documentRef.visibilityState === 'hidden');
        let lastAnalysisStartAt = null;
        let lastAnalysisCompleteAt = null;
        let lastInferenceLatencyMs = null;
        const signalAuditLog = [];
        const directionalStats = {
            totalUpCandidates: 0,
            totalDownCandidates: 0,
            approvedUpSignals: 0,
            approvedDownSignals: 0,
            rejectedUpCandidates: 0,
            rejectedDownCandidates: 0
        };
        const MAX_STALENESS_MS = 30000; // 30s threshold: candles move faster than stale visual results

        const diagMetrics = {
            framesReceived: 0,
            framesRejected: 0,
            candlesDetected: 0,
            completedCandles: 0,
            indicatorAvailability: 'Checking…',
            engineState: 'WAIT',
            validatorState: 'WAIT',
            waitReason: 'Awaiting live monitoring start…',
            lastEvalTime: null
        };

        function updateDiagnosticsUI() {
            if (elements.diagFramesReceived) elements.diagFramesReceived.textContent = diagMetrics.framesReceived;
            if (elements.diagFramesRejected) elements.diagFramesRejected.textContent = diagMetrics.framesRejected;
            if (elements.diagCandlesDetected) elements.diagCandlesDetected.textContent = diagMetrics.candlesDetected;
            if (elements.diagCompletedCandles) elements.diagCompletedCandles.textContent = diagMetrics.completedCandles;
            if (elements.diagIndicatorAvailability) elements.diagIndicatorAvailability.textContent = diagMetrics.indicatorAvailability;
            if (elements.diagEngineState) elements.diagEngineState.textContent = diagMetrics.engineState;
            if (elements.diagValidatorState) elements.diagValidatorState.textContent = diagMetrics.validatorState;
            if (elements.diagWaitReason) elements.diagWaitReason.textContent = diagMetrics.waitReason;
            if (elements.diagLastEvalTime) {
                elements.diagLastEvalTime.textContent = diagMetrics.lastEvalTime
                    ? `Last Eval: ${new Date(diagMetrics.lastEvalTime).toLocaleTimeString()}`
                    : 'Last Eval: Not evaluated';
            }
        }

        function setAiStatus(statusText) {
            if (elements.aiProcessingStatus) elements.aiProcessingStatus.textContent = statusText;
        }

        function setWait(reason) {
            if (elements.signalDirection) {
                elements.signalDirection.textContent = 'WAIT';
                elements.signalDirection.dataset.direction = 'WAIT';
            }
            if (elements.signalStatus) elements.signalStatus.textContent = reason;
            diagMetrics.engineState = 'WAIT';
            diagMetrics.validatorState = 'WAIT';
            diagMetrics.waitReason = reason;
            updateDiagnosticsUI();
        }

        function setMonitoringStatus(message) {
            if (!elements.monitoringStatus) return;
            elements.monitoringStatus.textContent = pageHidden && monitoring
                ? `${message} · Background tab; sampling may be throttled.`
                : message;
        }

        function setConnectionStatus(message) {
            if (elements.connectionStatus) elements.connectionStatus.textContent = message;
        }

        function resetObservation(clearTimestamp = true) {
            if (typeof resetObserver === 'function') resetObserver();
            if (typeof clearFrameCanvas === 'function') clearFrameCanvas();
            latestLocalResult = null;
            latestVisionResult = null;
            if (clearTimestamp) {
                lastFrameAt = null;
                if (elements.lastFrameTimestamp) elements.lastFrameTimestamp.textContent = 'Not received';
            }
            if (elements.observationStatus) {
                elements.observationStatus.textContent = 'Waiting for a shared chart. Visual checks inspect visible indicators and candles.';
            }
        }

        function updateButtons() {
            const connected = Boolean(videoTrack && videoTrack.readyState === 'live');
            if (elements.connectButton) {
                elements.connectButton.disabled = connected || connecting;
                if (!connected && elements.connectButton.dataset) {
                    elements.connectButton.textContent = screenStream
                        ? 'RECONNECT LIVE SCREEN'
                        : elements.connectButton.dataset.reconnect
                            ? 'RECONNECT LIVE SCREEN'
                            : 'CONNECT LIVE SCREEN';
                }
            }
            if (elements.startButton) elements.startButton.disabled = !connected || monitoring || connecting;
            if (elements.stopButton) elements.stopButton.disabled = !monitoring;
            if (elements.intervalSelect) elements.intervalSelect.disabled = monitoring;
        }

        function stopMonitoring(message = 'Stopped by user.', byUser = false) {
            if (byUser) {
                userExplicitlyStopped = true;
            }
            if (samplingTimer !== null) {
                clearIntervalFn(samplingTimer);
                samplingTimer = null;
            }
            monitoring = false;
            analyzing = false;
            resetObservation(false);
            setMonitoringStatus(message);
            updateButtons();
            setWait('WAIT — LIVE PRICE NOT VERIFIED. Live monitoring paused. Press START MONITORING to resume.');
        }

        function finishSharing(message = 'Screen disconnected.') {
            stopMonitoring(message, false);
            userExplicitlyStopped = false;
            const endedStream = screenStream;
            screenStream = null;
            videoTrack = null;
            if (endedStream) {
                endedStream.getTracks().forEach(track => {
                    if (track.readyState === 'live') track.stop();
                });
            }
            if (video) {
                video.pause();
                video.srcObject = null;
            }
            if (preview) preview.hidden = true;
            setConnectionStatus('Disconnected');
            if (elements.frameFreshness) {
                elements.frameFreshness.textContent = 'Screen disconnected';
                elements.frameFreshness.className = 'telemetry-val';
            }
            setAiStatus('Idle');
            if (elements.connectButton && elements.connectButton.dataset) {
                elements.connectButton.dataset.reconnect = 'true';
            }
            updateButtons();
            setWait('WAIT — LIVE PRICE NOT VERIFIED. Screen sharing disconnected. Reconnect to resume live monitoring.');
        }

        function onTrackEnded() {
            finishSharing('Sharing ended by the browser or user.');
        }

        function onTrackMuted() {
            setMonitoringStatus('Paused — shared video track is muted.');
            setWait('WAIT — LIVE PRICE NOT VERIFIED. The shared screen is not currently producing usable frames.');
        }

        function onTrackUnmuted() {
            if (monitoring) setMonitoringStatus('Monitoring locally.');
        }

        function describeObservation(observation, resumedAfterGap) {
            const notes = [];
            if (resumedAfterGap) notes.push('Sampling resumed after a frame gap.');
            if (!observation.chartVisibleCandidate) {
                notes.push(`No chart-like colored marks detected; visual quality ${observation.visualQuality}.`);
            } else {
                notes.push(`Chart region active; visual quality ${observation.visualQuality}.`);
                notes.push(`${observation.coloredColumns} candle/indicator columns detected.`);
                if (observation.chartRegionCandidate) {
                    const region = observation.chartRegionCandidate;
                    const wPct = Math.round(region.width * 100);
                    const hPct = Math.round(region.height * 100);
                    const covPct = Math.round(region.width * region.height * 100);
                    notes.push(`Chart area approx ${wPct}%×${hPct}% (${covPct}% of frame).`);
                }
            }
            if (observation.possibleLayoutChange) {
                notes.push('Visual layout or timeframe change detected.');
            }
            if (observation.unchangedForMs >= 10000) {
                notes.push('Possible frozen frame: sampled pixels have not changed for 10 seconds.');
            }
            if (!observation.readable && observation.chartVisibleCandidate) {
                notes.push('Chart details may be small or partially obscured.');
            }
            if (elements.observationStatus) elements.observationStatus.textContent = notes.join(' ');
        }

        function renderAnalysis(analysis, sampleTime) {
            const direction = ['UP', 'DOWN', 'WAIT'].includes(analysis.direction) ? analysis.direction : 'WAIT';
            if (elements.signalDirection) {
                elements.signalDirection.textContent = direction;
                elements.signalDirection.dataset.direction = direction;
                if (analysis.signal_strength) {
                    elements.signalDirection.dataset.strength = analysis.signal_strength;
                }
            }
            if (elements.signalStrengthBadge) {
                const strength = analysis.signal_strength || (direction === 'WAIT' ? 'WAIT' : 'MODERATE');
                elements.signalStrengthBadge.textContent = strength;
                elements.signalStrengthBadge.dataset.strength = strength;
                elements.signalStrengthBadge.className = `signal-strength-badge ${strength.toLowerCase()}`;
            }
            // Signal Status Badge (8 Canonical States):
            // ANALYZING, WAITING FOR CONFIRMATION, WAIT, UP CONFIRMED, DOWN CONFIRMED, ENTRY WINDOW EXPIRED, DATA UNAVAILABLE, WAITING FOR CANDLE CLOSE
            if (elements.signalStatusBadge) {
                const status = analysis.signalState || analysis.signalStatus || 'WAIT';
                elements.signalStatusBadge.textContent = status;
                elements.signalStatusBadge.dataset.status = status.replace(/\s+/g, '_').toUpperCase();
                elements.signalStatusBadge.className = `signal-status-badge ${
                    status.includes('WAITING FOR CANDLE CLOSE') || status.includes('WAITING_FOR_CANDLE_CLOSE') ? 'waiting-candle' :
                    status.includes('CONFIRMATION') ? 'waiting-conf' :
                    status.includes('CONFIRMED') ? 'confirmed' :
                    status.includes('EXPIRED') ? 'expired' :
                    status.includes('UNAVAILABLE') ? 'unavailable' :
                    status.includes('ANALYZING') ? 'analyzing' : 'wait'
                }`;
            }
            // Entry Window Countdown
            if (elements.entryWindowCountdown) {
                if (analysis.entryWindowExpiresAt) {
                    const remainingMs = analysis.entryWindowExpiresAt - sampleTime;
                    if (remainingMs > 0) {
                        const remainingSec = Math.ceil(remainingMs / 1000);
                        elements.entryWindowCountdown.textContent = `Entry window: ${remainingSec}s remaining`;
                        elements.entryWindowCountdown.dataset.remaining = remainingSec;
                        elements.entryWindowCountdown.className = remainingSec <= 10 ? 'countdown-critical' : remainingSec <= 30 ? 'countdown-warning' : 'countdown-ok';
                    } else {
                        elements.entryWindowCountdown.textContent = 'ENTRY WINDOW EXPIRED';
                        elements.entryWindowCountdown.className = 'countdown-expired';
                    }
                } else {
                    elements.entryWindowCountdown.textContent = '';
                    elements.entryWindowCountdown.className = '';
                }
            }
            // Candle Close Timestamp Display
            if (elements.candleCloseTimestamp) {
                if (analysis.candleClosedAt) {
                    const closeTime = new Date(analysis.candleClosedAt);
                    elements.candleCloseTimestamp.textContent = `Candle closed: ${closeTime.toLocaleTimeString()}.${String(closeTime.getMilliseconds()).padStart(3, '0')}`;
                } else {
                    elements.candleCloseTimestamp.textContent = 'Candle close: --';
                }
            }
            if (elements.trendDirectionBadge) {
                const tr = (analysis.observations && analysis.observations.trend) || 'Neutral';
                elements.trendDirectionBadge.textContent = `Trend: ${tr.split('(')[0].trim()}`;
            }
            if (elements.momentumDirectionBadge) {
                const mom = (analysis.observations && analysis.observations.rsi14) || 'Neutral';
                elements.momentumDirectionBadge.textContent = `Momentum: ${mom.split('(')[0].trim()}`;
            }
            if (elements.volatilityDirectionBadge) {
                const vol = (analysis.observations && analysis.observations.bollingerBands) || 'Neutral';
                elements.volatilityDirectionBadge.textContent = `Volatility: ${vol.split('(')[0].trim()}`;
            }
            if (elements.upCandidatesCount) {
                elements.upCandidatesCount.textContent = directionalStats.totalUpCandidates;
            }
            if (elements.downCandidatesCount) {
                elements.downCandidatesCount.textContent = directionalStats.totalDownCandidates;
            }
            if (elements.upApprovedCount) {
                elements.upApprovedCount.textContent = directionalStats.approvedUpSignals;
            }
            if (elements.downApprovedCount) {
                elements.downApprovedCount.textContent = directionalStats.approvedDownSignals;
            }
            if (elements.signalStatus) {
                elements.signalStatus.textContent = analysis.explanation || 'Signal evaluated.';
            }
            if (elements.signalTimestamp) {
                elements.signalTimestamp.textContent = analysis.analyzed_at
                    ? new Date(analysis.analyzed_at).toLocaleTimeString()
                    : new Date(sampleTime).toLocaleTimeString();
            }

            if (elements.indicatorObservations && documentRef) {
                elements.indicatorObservations.replaceChildren();
                const obs = analysis.observations || {};
                Object.keys(OBSERVATION_LABELS).forEach(key => {
                    const item = documentRef.createElement('div');
                    item.className = 'indicator-observation';
                    const label = documentRef.createElement('strong');
                    label.textContent = `${OBSERVATION_LABELS[key]}: `;
                    const value = documentRef.createElement('span');
                    value.textContent = obs[key] ? obs[key] : 'Not clearly visible';
                    item.append(label, value);
                    elements.indicatorObservations.appendChild(item);
                });
            }

            if (elements.analysisUncertainties) {
                elements.analysisUncertainties.textContent = Array.isArray(analysis.uncertainties) && analysis.uncertainties.length
                    ? `Notes: ${analysis.uncertainties.join(' ')}`
                    : '';
            }

            if (analysis && analysis.audit) {
                signalAuditLog.unshift(analysis.audit);
                if (signalAuditLog.length > 100) signalAuditLog.pop();
            }

            const activeController = notificationController ||
                (windowRef && windowRef.notificationController);
            if (activeController && typeof activeController.notifyLiveAnalysis === 'function') {
                activeController.notifyLiveAnalysis(analysis, sampleTime);
            }
        }

        async function triggerFrameAnalysis(sampleTime) {
            if (analyzing || !monitoring) return;
            if (typeof captureHighResFrame !== 'function' || typeof fetchImpl !== 'function') return;

            let dataUrl;
            try {
                dataUrl = captureHighResFrame();
            } catch (err) {
                logger.error('Failed to capture frame snapshot:', err);
                return;
            }
            if (!dataUrl) return;

            analyzing = true;
            hasAnalyzedInitial = true;
            lastAnalysisStartAt = now();
            if (elements.analysisStartTime) {
                elements.analysisStartTime.textContent = new Date(lastAnalysisStartAt).toLocaleTimeString();
            }
            if (!localChartExtractor) {
                if (elements.frameFreshness) {
                    elements.frameFreshness.textContent = 'Analyzing frame…';
                    elements.frameFreshness.className = 'telemetry-val delayed';
                }
                setAiStatus('Inference in-progress (qwen3-vl:4b)…');
                setMonitoringStatus('AI analyzing visible chart with local Ollama qwen3-vl:4b…');
            } else {
                setAiStatus('Vision verifying in background (qwen3-vl:4b)…');
            }
            if (elements.visionInferenceLatency) {
                elements.visionInferenceLatency.textContent = 'Running in background…';
            }

            try {
                const response = await fetchImpl('/api/analyze-frame', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        dataUrl,
                        frameTimestamp: sampleTime,
                        analysis_type: 'LIVE_SCREEN_VISUAL'
                    })
                });
                const analysis = await response.json();
                if (!response.ok) {
                    throw new Error(analysis.error || `HTTP ${response.status}`);
                }
                if (!monitoring) return;

                lastAnalysisCompleteAt = now();
                const latencyMs = lastAnalysisCompleteAt - lastAnalysisStartAt;
                lastInferenceLatencyMs = latencyMs;
                const frameAgeMs = lastAnalysisCompleteAt - sampleTime;

                if (elements.analysisCompleteTime) {
                    elements.analysisCompleteTime.textContent = new Date(lastAnalysisCompleteAt).toLocaleTimeString();
                }
                if (elements.inferenceLatency) {
                    elements.inferenceLatency.textContent = `${(latencyMs / 1000).toFixed(1)}s`;
                }
                if (elements.visionInferenceLatency) {
                    elements.visionInferenceLatency.textContent = `${(latencyMs / 1000).toFixed(1)}s`;
                }

                // FRESHNESS CHECK: Detect stale frames and reject outdated directional signals
                const isStale = frameAgeMs > MAX_STALENESS_MS;
                if (isStale) {
                    if (elements.frameFreshness) {
                        elements.frameFreshness.textContent = `STALE (${(frameAgeMs / 1000).toFixed(0)}s old)`;
                        elements.frameFreshness.className = 'telemetry-val stale';
                    }
                    setAiStatus(`DELAYED ANALYSIS — Expired (${(frameAgeMs / 1000).toFixed(1)}s old)`);
                    analysis.direction = 'WAIT';
                    analysis.stale = true;
                    analysis.explanation = `WAIT — DELAYED ANALYSIS (Latency: ${(latencyMs / 1000).toFixed(1)}s, Frame age: ${(frameAgeMs / 1000).toFixed(1)}s). The captured chart frame is outdated and no longer actionable in live market.`;
                    latestVisionResult = null;
                } else {
                    if (elements.frameFreshness) {
                        elements.frameFreshness.textContent = `Fresh (${(frameAgeMs / 1000).toFixed(1)}s)`;
                        elements.frameFreshness.className = 'telemetry-val fresh';
                    }
                    setAiStatus('Ready · Monitoring live chart');
                    latestVisionResult = analysis;
                }

                if (localChartExtractor && localTechnicalEngine && finalSignalValidator && latestLocalResult) {
                    const revalidated = finalSignalValidator.validate({
                        localResult: latestLocalResult,
                        visionResult: isStale ? null : latestVisionResult,
                        frameAgeMs: isStale ? frameAgeMs : 0,
                        now: now(),
                        telemetry: {
                            visionLatencyMs: latencyMs
                        }
                    });
                    renderAnalysis(revalidated, sampleTime);
                } else {
                    renderAnalysis(analysis, sampleTime);
                }
            } catch (error) {
                if (!monitoring) return;
                logger.warn('Frame analysis failed:', error);
                latestVisionResult = null;
                const isOffline = /failed to fetch|unreachable|not responding/i.test(error.message);
                const msg = isOffline
                    ? 'Local Ollama is unreachable. Ensure Ollama is running at http://127.0.0.1:11434 with qwen3-vl:4b.'
                    : `Analysis error: ${error.message}`;
                setWait(`WAIT — ${msg}`);
                setAiStatus(`Error · ${error.message}`);
                setMonitoringStatus(`AI error: ${error.message}`);
                if (elements.visionInferenceLatency) {
                    elements.visionInferenceLatency.textContent = 'Error / Offline';
                }
                // Only update frameFreshness to Error if in pure vision mode with no local extractor.
                // In hybrid mode, frameFreshness tracks the live screen video frame, which is still active!
                if (!localChartExtractor && elements.frameFreshness) {
                    elements.frameFreshness.textContent = 'Error';
                    elements.frameFreshness.className = 'telemetry-val stale';
                }
            } finally {
                analyzing = false;
                if (monitoring) {
                    setMonitoringStatus(`Monitoring locally every ${samplingIntervalMs / 1000}s · Ready`);
                }
            }
        }

        function sampleFrame() {
            if (!monitoring || !videoTrack || videoTrack.readyState !== 'live') return;
            if (videoTrack.muted) {
                onTrackMuted();
                return;
            }
            if (!video || video.readyState < 2) {
                const gapMs = lastFrameAt === null ? 0 : now() - lastFrameAt;
                setMonitoringStatus(gapMs > samplingIntervalMs * 3
                    ? `Capture interrupted — no usable frame for ${Math.round(gapMs / 1000)} seconds.`
                    : 'Waiting for a usable shared video frame.');
                setWait('WAIT — Waiting for a usable shared chart frame.');
                if (elements.frameFreshness && lastFrameAt === null) {
                    elements.frameFreshness.textContent = 'No frames received';
                    elements.frameFreshness.className = 'telemetry-val stale';
                }
                setAiStatus('Analysis waiting');
                return;
            }
            const sampleTime = now();
            diagMetrics.framesReceived += 1;
            const resumedAfterGap = lastFrameAt !== null &&
                sampleTime - lastFrameAt > samplingIntervalMs * 3;
            if (resumedAfterGap && typeof resetObserver === 'function') resetObserver();
            try {
                const captureStart = sampleTime;
                const frame = captureFrame();
                const captureDone = now();
                const captureLatencyMs = Math.max(0, captureDone - captureStart);
                if (!frame) {
                    diagMetrics.framesRejected += 1;
                    diagMetrics.waitReason = 'Waiting for usable video frame.';
                    updateDiagnosticsUI();
                    setMonitoringStatus('Waiting for the first shared video frame.');
                    if (elements.frameFreshness && lastFrameAt === null) {
                        elements.frameFreshness.textContent = 'No frames received';
                        elements.frameFreshness.className = 'telemetry-val stale';
                    }
                    setAiStatus('Analysis waiting');
                    return;
                }
                const observation = observeFrame(frame, sampleTime);
                lastFrameAt = sampleTime;
                if (elements.lastFrameTimestamp) {
                    elements.lastFrameTimestamp.textContent = new Date(sampleTime).toLocaleTimeString();
                }
                describeObservation(observation, resumedAfterGap);

                if (!observation.chartVisibleCandidate) {
                    diagMetrics.framesRejected += 1;
                    diagMetrics.waitReason = 'Chart area not detected. Focus or switch to the Quotex chart tab.';
                    updateDiagnosticsUI();
                    setWait('WAIT — Chart area not detected. Focus or switch to the Quotex chart tab.');
                    return;
                }

                if (observation.unchangedForMs >= 3000 && observation.frameDifference < 0.012 && hasAnalyzedInitial) {
                    if (elements.observationStatus) {
                        elements.observationStatus.textContent = 'Chart steady · Monitoring live candle development.';
                    }
                }

                if (localChartExtractor && localTechnicalEngine && finalSignalValidator) {
                    setAiStatus('Analysis running');
                    const startExtract = now();
                    let extracted;
                    try {
                        extracted = localChartExtractor.extract(frame, sampleTime);
                    } catch (err) {
                        logger.warn('Local chart extraction failed:', err);
                        extracted = { isValid: false, isReadable: false, reason: err.message };
                    }
                    const extractDone = now();
                    const extractionLatencyMs = Math.max(0, extractDone - startExtract);

                    const startEngine = now();
                    const localResult = localTechnicalEngine.evaluate(extracted, sampleTime);
                    const engineDone = now();
                    const engineLatencyMs = Math.max(0, engineDone - startEngine);

                    latestLocalResult = localResult;

                    // Track directional candidates
                    if (localResult && localResult.candidate === 'UP') {
                        directionalStats.totalUpCandidates += 1;
                    } else if (localResult && localResult.candidate === 'DOWN') {
                        directionalStats.totalDownCandidates += 1;
                    }

                    const startValidator = now();
                    const telemetry = {
                        captureLatencyMs,
                        extractionLatencyMs,
                        engineLatencyMs,
                        totalLocalLatencyMs: captureLatencyMs + extractionLatencyMs + engineLatencyMs,
                        visionStatus: analyzing ? 'Verifying in background' : latestVisionResult ? 'Verified' : 'Idle'
                    };

                    const finalAnalysis = finalSignalValidator.validate({
                        localResult,
                        visionResult: latestVisionResult,
                        frameAgeMs: now() - sampleTime,
                        now: sampleTime,
                        telemetry
                    });
                    const validatorDone = now();
                    const validationLatencyMs = Math.max(0, validatorDone - startValidator);
                    const totalLocalMs = captureLatencyMs + extractionLatencyMs + engineLatencyMs + validationLatencyMs;

                    // Track directional approvals and rejections
                    if (finalAnalysis.direction === 'UP') {
                        directionalStats.approvedUpSignals += 1;
                    } else if (localResult && localResult.candidate === 'UP') {
                        directionalStats.rejectedUpCandidates += 1;
                    }

                    if (finalAnalysis.direction === 'DOWN') {
                        directionalStats.approvedDownSignals += 1;
                    } else if (localResult && localResult.candidate === 'DOWN') {
                        directionalStats.rejectedDownCandidates += 1;
                    }

                    // Background audit candidate logging
                    if (typeof fetchImpl === 'function' && localResult && localResult.candidate && localResult.candidate !== 'WAIT') {
                        void fetchImpl('/api/candidate-audit', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                candidate: localResult.candidate,
                                approved: finalAnalysis.direction === localResult.candidate,
                                signalStrength: finalAnalysis.signal_strength || 'WAIT',
                                rejectionReason: finalAnalysis.direction !== localResult.candidate ? finalAnalysis.explanation : null,
                                candleId: localResult.candleId || null,
                                timestamp: new Date(sampleTime).toISOString()
                            })
                        }).catch(() => {});
                    }

                    if (elements.analysisStartTime) {
                        elements.analysisStartTime.textContent = new Date(startExtract).toLocaleTimeString();
                    }
                    if (elements.analysisCompleteTime) {
                        elements.analysisCompleteTime.textContent = new Date(validatorDone).toLocaleTimeString();
                    }
                    if (elements.inferenceLatency) {
                        elements.inferenceLatency.textContent = `${(totalLocalMs / 1000).toFixed(3)}s`;
                    }
                    if (elements.localEngineLatency) {
                        elements.localEngineLatency.textContent = `${totalLocalMs}ms`;
                    }
                    if (elements.frameCaptureLatency) {
                        elements.frameCaptureLatency.textContent = `${captureLatencyMs}ms`;
                    }
                    if (elements.localExtractionLatency) {
                        elements.localExtractionLatency.textContent = `${extractionLatencyMs}ms`;
                    }
                    if (elements.technicalEngineLatency) {
                        elements.technicalEngineLatency.textContent = `${engineLatencyMs}ms`;
                    }
                    if (elements.finalValidationLatency) {
                        elements.finalValidationLatency.textContent = `${validationLatencyMs}ms`;
                    }

                    // FRESHNESS: Calculate actual age of the captured frame
                    const currentFrameAgeMs = now() - sampleTime;
                    if (currentFrameAgeMs > MAX_STALENESS_MS) {
                        if (elements.frameFreshness) {
                            elements.frameFreshness.textContent = `STALE (${(currentFrameAgeMs / 1000).toFixed(0)}s old)`;
                            elements.frameFreshness.className = 'telemetry-val stale';
                        }
                    } else {
                        if (elements.frameFreshness) {
                            elements.frameFreshness.textContent = `Fresh (${(currentFrameAgeMs / 1000).toFixed(1)}s)`;
                            elements.frameFreshness.className = 'telemetry-val fresh';
                        }
                    }

                    // Live Diagnostic Dashboard Metrics Update
                    diagMetrics.candlesDetected = (extracted && extracted.candlesCount) || 0;
                    if (extracted && extracted.candleCompleted) {
                        diagMetrics.completedCandles += 1;
                    }
                    const rsiZone = (extracted && extracted.rsiVisualZone) || 'OFF';
                    const rsiSlope = (extracted && extracted.rsiSlope) || 'FLAT';
                    const rsiStr = rsiZone !== 'UNAVAILABLE' && (rsiZone !== 'NEUTRAL' || rsiSlope !== 'FLAT') ? `RSI:${rsiZone}` : 'RSI:OFF';
                    const bbStr = extracted && extracted.bollingerPosition && extracted.bollingerPosition !== 'UNAVAILABLE' ? `BB:${extracted.bollingerPosition}` : 'BB:OFF';
                    const emaStr = extracted && extracted.movingAverage ? `EMA:${extracted.movingAverage}` : 'EMA:FLAT';
                    diagMetrics.indicatorAvailability = `${rsiStr} | ${bbStr} | ${emaStr}`;
                    diagMetrics.engineState = (localResult && (localResult.signalState || localResult.candidate)) || 'WAIT';
                    diagMetrics.validatorState = (finalAnalysis && (finalAnalysis.signalState || finalAnalysis.direction)) || 'WAIT';
                    diagMetrics.waitReason = (finalAnalysis && finalAnalysis.explanation) || (localResult && localResult.waitReason) || 'WAIT — Evaluating live candle structure';
                    diagMetrics.lastEvalTime = sampleTime;
                    updateDiagnosticsUI();

                    setAiStatus(analyzing
                        ? 'Vision verifying in background (qwen3-vl:4b)…'
                        : 'Ready · Local Fast Engine Active');

                    renderAnalysis(finalAnalysis, sampleTime);

                    if (outcomeTracker && (finalAnalysis.direction === 'UP' || finalAnalysis.direction === 'DOWN')) {
                        void outcomeTracker.trackSignal(finalAnalysis, {
                            entryPrice: extracted ? extracted.currentPrice : null,
                            expiryDuration: 60
                        });
                    }

                    if (outcomeTracker && typeof outcomeTracker.recordCandidateAudit === 'function' && localResult) {
                        void outcomeTracker.recordCandidateAudit({
                            candidate: localResult.candidate,
                            approved: finalAnalysis.direction === 'UP' || finalAnalysis.direction === 'DOWN',
                            signalStrength: finalAnalysis.signal_strength || 'WAIT',
                            rejectionReason: finalAnalysis.explanation || localResult.waitReason || null,
                            candleId: localResult.candleId || null,
                            timestamp: new Date(sampleTime).toISOString()
                        });
                    }

                    if (outcomeTracker && typeof outcomeTracker.checkPendingExpiries === 'function') {
                        void outcomeTracker.checkPendingExpiries(sampleTime, extracted.lastCompletedCandle, extracted.currentPrice);
                    }

                    // CONDITIONAL VISION TRIGGER:
                    // Only invoke Qwen3-VL conditionally when:
                    // 1. Technical engine detects candidate UP or DOWN
                    // 2. Ollama is not already busy
                    const candidateIsDirectional = localResult.candidate === 'UP' || localResult.candidate === 'DOWN';
                    if (candidateIsDirectional && !analyzing && typeof captureHighResFrame === 'function') {
                        void triggerFrameAnalysis(sampleTime);
                    }
                    return;
                }

                if (analyzing) {
                    if (elements.observationStatus) {
                        elements.observationStatus.textContent = 'Ollama qwen3-vl:4b is analyzing chart development…';
                    }
                    return;
                }

                void triggerFrameAnalysis(sampleTime);
            } catch (error) {
                logger.error('Live screen sampling failed:', error);
                stopMonitoring(`Stopped — frame sampling failed: ${error.message}`);
                setConnectionStatus('Connected — preview only');
            }
        }

        async function checkVisionStatus() {
            if (typeof fetchImpl !== 'function') return;
            try {
                const response = await fetchImpl('/api/vision-status');
                const status = await response.json();
                if (elements.visionModelStatus) {
                    elements.visionModelStatus.textContent = status && status.configured
                        ? `Ollama ready · ${status.model}`
                        : 'Ollama unavailable';
                }
                if (elements.visionSetupDetails) {
                    elements.visionSetupDetails.textContent = status && status.message
                        ? status.message
                        : 'Status unknown.';
                }
            } catch (err) {
                if (elements.visionModelStatus) elements.visionModelStatus.textContent = 'Ollama offline';
                if (elements.visionSetupDetails) elements.visionSetupDetails.textContent = err.message;
            }
        }

        async function connect(connectOptions = {}) {
            if (connecting || (videoTrack && videoTrack.readyState === 'live')) return false;
            userExplicitlyStopped = false;
            if (!mediaDevices || typeof mediaDevices.getDisplayMedia !== 'function') {
                setConnectionStatus('Screen sharing unsupported');
                setMonitoringStatus('Unavailable in this browser or context.');
                setWait('WAIT — LIVE PRICE NOT VERIFIED. This browser does not support screen sharing here.');
                updateButtons();
                return false;
            }

            connecting = true;
            updateButtons();
            setConnectionStatus('Requesting screen permission…');
            if (elements.frameFreshness) {
                elements.frameFreshness.textContent = 'Waiting for permission';
                elements.frameFreshness.className = 'telemetry-val';
            }
            setWait('WAIT — Waiting for user to select Quotex tab from the browser sharing prompt.');
            try {
                screenStream = await mediaDevices.getDisplayMedia({ video: true, audio: false });
                videoTrack = screenStream.getVideoTracks()[0] || null;
                if (!videoTrack || videoTrack.readyState !== 'live') {
                    throw new Error('The selected source did not provide a live video track.');
                }
                videoTrack.addEventListener('ended', onTrackEnded, { once: true });
                videoTrack.addEventListener('mute', onTrackMuted);
                videoTrack.addEventListener('unmute', onTrackUnmuted);
                video.srcObject = screenStream;
                await video.play();
                if (!videoTrack || videoTrack.readyState !== 'live') {
                    throw new Error('Screen sharing ended before the preview was ready.');
                }
                if (preview) preview.hidden = false;
                if (elements.intervalSelect) elements.intervalSelect.disabled = false;

                const shouldAutoStart = connectOptions.autoStart !== undefined
                    ? connectOptions.autoStart
                    : autoStart;

                // PART 2: Check for first usable frame and automatically start live monitoring
                if (shouldAutoStart && !userExplicitlyStopped) {
                    const firstFrame = typeof captureFrame === 'function' ? captureFrame() : null;
                    if (firstFrame || (video.readyState >= 2 && video.videoWidth > 0)) {
                        startMonitoring();
                        setConnectionStatus('LIVE MONITORING ACTIVE');
                        setMonitoringStatus('LIVE MONITORING ACTIVE (Auto-started after screen sharing).');
                        if (elements.frameFreshness) {
                            elements.frameFreshness.textContent = 'Fresh (0.0s)';
                            elements.frameFreshness.className = 'telemetry-val fresh';
                        }
                        updateButtons();
                        return true;
                    }
                }

                setConnectionStatus('Connected — local preview');
                if (elements.frameFreshness) {
                    elements.frameFreshness.textContent = 'Screen connected';
                    elements.frameFreshness.className = 'telemetry-val';
                }
                setMonitoringStatus('Connected; press Start Monitoring when ready.');
                resetObservation();
                setWait('WAIT — Screen connected. Click START MONITORING to begin live AI analysis.');
                updateButtons();
                return true;
            } catch (error) {
                logger.warn('Could not connect live screen:', error);
                if (screenStream) screenStream.getTracks().forEach(track => track.stop());
                screenStream = null;
                videoTrack = null;
                if (video) video.srcObject = null;
                if (preview) preview.hidden = true;
                const reason = error.name === 'NotAllowedError' || error.name === 'SecurityError'
                    ? 'Screen sharing was denied or the picker was cancelled.'
                    : `Could not connect the selected screen: ${error.message}`;
                setConnectionStatus(error.name === 'NotAllowedError' ? 'Permission denied' : 'Not connected');
                if (elements.frameFreshness) {
                    elements.frameFreshness.textContent = error.name === 'NotAllowedError' ? 'Permission denied' : 'Screen disconnected';
                    elements.frameFreshness.className = 'telemetry-val stale';
                }
                setMonitoringStatus(reason);
                setWait(`WAIT — LIVE PRICE NOT VERIFIED. ${reason}`);
                if (elements.connectButton && elements.connectButton.dataset) {
                    elements.connectButton.dataset.reconnect = 'true';
                }
                return false;
            } finally {
                connecting = false;
                updateButtons();
            }
        }

        function startMonitoring() {
            if (!videoTrack || videoTrack.readyState !== 'live' || monitoring) return false;
            userExplicitlyStopped = false;
            const requestedInterval = Number(elements.intervalSelect && elements.intervalSelect.value);
            samplingIntervalMs = [1000, 1500, 2000].includes(requestedInterval) ? requestedInterval : 1500;
            monitoring = true;
            hasAnalyzedInitial = false;
            if (elements.intervalSelect) elements.intervalSelect.disabled = true;
            setConnectionStatus('LIVE MONITORING ACTIVE');
            setMonitoringStatus(`LIVE MONITORING ACTIVE (Sampling every ${samplingIntervalMs / 1000}s).`);
            setWait('WAIT — Initializing live AI chart analysis with local Ollama…');
            updateButtons();
            samplingTimer = setIntervalFn(sampleFrame, samplingIntervalMs);
            sampleFrame();
            return monitoring;
        }

        function handleVisibilityChange() {
            pageHidden = Boolean(documentRef && documentRef.visibilityState === 'hidden');
            if (!monitoring) return;
            if (pageHidden) {
                setMonitoringStatus('Monitoring continues when possible; browser background throttling may delay frames.');
                return;
            }
            if (lastFrameAt !== null && now() - lastFrameAt > samplingIntervalMs * 3) {
                if (typeof resetObserver === 'function') resetObserver();
            }
            setMonitoringStatus('Monitoring locally; checking for resumed frames.');
        }

        if (elements.connectButton && typeof elements.connectButton.addEventListener === 'function') {
            elements.connectButton.addEventListener('click', () => { void connect({ autoStart: true }); });
        }
        if (elements.startButton && typeof elements.startButton.addEventListener === 'function') {
            elements.startButton.addEventListener('click', startMonitoring);
        }
        if (elements.stopButton && typeof elements.stopButton.addEventListener === 'function') {
            elements.stopButton.addEventListener('click', () => stopMonitoring('Stopped by user.', true));
        }
        if (elements.intervalSelect && typeof elements.intervalSelect.addEventListener === 'function') {
            elements.intervalSelect.addEventListener('change', () => {
                samplingIntervalMs = Number(elements.intervalSelect.value) || 1500;
            });
        }
        if (documentRef && typeof documentRef.addEventListener === 'function') {
            documentRef.addEventListener('visibilitychange', handleVisibilityChange);
        }
        if (windowRef && typeof windowRef.addEventListener === 'function') {
            windowRef.addEventListener('pagehide', () => finishSharing('Stopped because the page is closing.'));
        }
        if (elements.visionInferenceLatency && !elements.visionInferenceLatency.textContent) {
            elements.visionInferenceLatency.textContent = 'Not invoked';
        }
        updateButtons();
        void checkVisionStatus();

        return {
            connect,
            startMonitoring,
            stopMonitoring,
            disconnect: finishSharing,
            sampleFrame,
            checkVisionStatus,
            getAuditLog: () => signalAuditLog.slice(),
            getDirectionalStats: () => ({ ...directionalStats }),
            getState: () => ({
                connected: Boolean(videoTrack && videoTrack.readyState === 'live'),
                monitoring,
                connecting,
                analyzing,
                samplingIntervalMs,
                lastFrameAt,
                lastAnalysisStartAt,
                lastAnalysisCompleteAt,
                lastInferenceLatencyMs
            })
        };
    }

    function mount(windowRef) {
        if (!windowRef || !windowRef.document || !windowRef.LiveChartObserver) return null;
        const documentRef = windowRef.document;
        const byId = id => documentRef.getElementById(id);
        const video = byId('liveScreenPreview');
        const preview = byId('livePreviewContainer');
        const canvas = documentRef.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const observer = windowRef.LiveChartObserver.createObserver();
        const extractor = windowRef.LocalChartExtractor ? windowRef.LocalChartExtractor.createExtractor() : null;
        const engine = windowRef.LocalTechnicalEngine ? windowRef.LocalTechnicalEngine.createEngine() : null;
        const validator = windowRef.FinalSignalValidator ? windowRef.FinalSignalValidator.createValidator() : null;
        const elements = {
            connectButton: byId('connectLiveScreenBtn'),
            startButton: byId('startMonitoringBtn'),
            stopButton: byId('stopMonitoringBtn'),
            intervalSelect: byId('frameIntervalSelect'),
            connectionStatus: byId('liveConnectionStatus'),
            monitoringStatus: byId('monitoringStatus'),
            lastFrameTimestamp: byId('lastFrameTimestamp'),
            observationStatus: byId('chartObservationStatus'),
            signalDirection: byId('signalDirection'),
            signalStatus: byId('marketDataStatus'),
            indicatorObservations: byId('indicatorObservations'),
            analysisUncertainties: byId('analysisUncertainties'),
            signalTimestamp: byId('signalTimestamp'),
            visionModelStatus: byId('visionModelStatus'),
            visionSetupDetails: byId('visionSetupDetails'),
            analysisStartTime: byId('analysisStartTime'),
            analysisCompleteTime: byId('analysisCompleteTime'),
            inferenceLatency: byId('inferenceLatency'),
            frameFreshness: byId('frameFreshness'),
            aiProcessingStatus: byId('aiProcessingStatus'),
            visionInferenceLatency: byId('visionInferenceLatency'),
            localEngineLatency: byId('localEngineLatency'),
            frameCaptureLatency: byId('frameCaptureLatency'),
            localExtractionLatency: byId('localExtractionLatency'),
            technicalEngineLatency: byId('technicalEngineLatency'),
            finalValidationLatency: byId('finalValidationLatency'),
            signalStrengthBadge: byId('signalStrengthBadge'),
            trendDirectionBadge: byId('trendDirectionBadge'),
            momentumDirectionBadge: byId('momentumDirectionBadge'),
            volatilityDirectionBadge: byId('volatilityDirectionBadge'),
            upCandidatesCount: byId('upCandidatesCount'),
            downCandidatesCount: byId('downCandidatesCount'),
            upApprovedCount: byId('upApprovedCount'),
            downApprovedCount: byId('downApprovedCount'),
            // New timing elements
            signalStatusBadge: byId('signalStatusBadge'),
            entryWindowCountdown: byId('entryWindowCountdown'),
            candleCloseTimestamp: byId('candleCloseTimestamp'),
            // Precision Diagnostics Elements
            diagLastEvalTime: byId('diagLastEvalTime'),
            diagFramesReceived: byId('diagFramesReceived'),
            diagFramesRejected: byId('diagFramesRejected'),
            diagCandlesDetected: byId('diagCandlesDetected'),
            diagCompletedCandles: byId('diagCompletedCandles'),
            diagIndicatorAvailability: byId('diagIndicatorAvailability'),
            diagEngineState: byId('diagEngineState'),
            diagValidatorState: byId('diagValidatorState'),
            diagWaitReason: byId('diagWaitReason')
        };
        if (Object.values(elements).slice(0, 10).some(element => !element) || !video || !preview || !context) return null;

        const tracker = windowRef.SignalOutcomeTracker
            ? windowRef.SignalOutcomeTracker.createTracker({
                fetchImpl: windowRef.fetch ? windowRef.fetch.bind(windowRef) : null,
                storage: windowRef.localStorage
            })
            : null;

        return createMonitor({
            mediaDevices: windowRef.navigator && windowRef.navigator.mediaDevices,
            video,
            preview,
            elements,
            documentRef,
            windowRef,
            fetchImpl: windowRef.fetch ? windowRef.fetch.bind(windowRef) : null,
            notificationController: windowRef.notificationController,
            autoStart: true,
            outcomeTracker: tracker,
            captureFrame: () => {
                if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return null;
                canvas.width = 320;
                canvas.height = 180;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                try {
                    return context.getImageData(0, 0, canvas.width, canvas.height);
                } finally {
                    context.clearRect(0, 0, canvas.width, canvas.height);
                }
            },
            captureHighResFrame: () => {
                if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return null;
                const highCanvas = documentRef.createElement('canvas');
                const targetWidth = Math.min(640, video.videoWidth);
                const targetHeight = Math.round(targetWidth * (video.videoHeight / video.videoWidth));
                highCanvas.width = targetWidth;
                highCanvas.height = targetHeight;
                const highCtx = highCanvas.getContext('2d');
                highCtx.imageSmoothingEnabled = true;
                highCtx.imageSmoothingQuality = 'high';
                highCtx.drawImage(video, 0, 0, highCanvas.width, highCanvas.height);
                const dataUrl = highCanvas.toDataURL('image/jpeg', 0.82);
                highCanvas.width = 0;
                highCanvas.height = 0;
                return dataUrl;
            },
            observeFrame: (frame, sampleTime) => observer.observe(frame, sampleTime),
            resetObserver: () => observer.reset(),
            clearFrameCanvas: () => {
                canvas.width = 0;
                canvas.height = 0;
            },
            localChartExtractor: extractor,
            localTechnicalEngine: engine,
            finalSignalValidator: validator
        });
    }

    return { createMonitor, mount, OBSERVATION_LABELS };
});