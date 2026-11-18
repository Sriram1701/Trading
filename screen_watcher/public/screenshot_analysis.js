(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) root.ScreenshotAnalysis = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
    const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
    const OBSERVATION_LABELS = {
        ema9: 'EMA 9',
        ema21: 'EMA 21',
        bollingerBands: 'Bollinger Bands',
        rsi14: 'RSI 14',
        macd: 'MACD 12/26/9',
        candles: 'Candles',
        trend: 'Trend',
        supportResistance: 'Support / resistance'
    };

    function createController({
        elements,
        fetchImpl,
        readFile,
        createObjectURL,
        revokeObjectURL,
        onAnalysis = () => {},
        logger = console
    }) {
        let previewUrl = null;
        let busy = false;

        function setDirection(direction) {
            elements.signalDirection.textContent = direction;
            elements.signalDirection.dataset.direction = direction;
        }

        function showSetupStatus(status) {
            const message = status && status.message
                ? status.message
                : 'Ollama availability could not be checked. Start or restart the local server.';
            const unavailableStatus = /not responding/i.test(message)
                ? 'Ollama not running'
                : /not available/i.test(message)
                    ? 'Ollama model unavailable'
                    : /vision capability/i.test(message)
                        ? 'Model lacks vision capability'
                        : 'Ollama unavailable';
            elements.visionModelStatus.textContent = status && status.configured
                ? `Ollama ready · ${status.model}`
                : unavailableStatus;
            elements.visionSetupDetails.textContent = message;
            if (!status || !status.configured) {
                setDirection('WAIT');
                elements.marketDataStatus.textContent = message;
                elements.analysisStatus.textContent = message;
            }
        }

        async function refreshModelStatus() {
            try {
                const response = await fetchImpl('/api/vision-status', {
                    headers: { Accept: 'application/json' },
                    cache: 'no-store'
                });
                const status = await response.json();
                if (!response.ok) throw new Error(status.error || `HTTP ${response.status}`);
                showSetupStatus(status);
                return status;
            } catch (error) {
                logger.error('Could not check screenshot vision model setup:', error);
                showSetupStatus({
                    configured: false,
                    message: `Vision model setup is unavailable: ${error.message}`
                });
                return null;
            }
        }

        function renderAnalysis(analysis) {
            setDirection(analysis.direction);
            elements.marketDataStatus.textContent = analysis.explanation;
            elements.signalTimestamp.textContent = analysis.analyzed_at
                ? new Date(analysis.analyzed_at).toLocaleString()
                : 'Not available';
            elements.indicatorObservations.replaceChildren();
            Object.keys(OBSERVATION_LABELS).forEach(key => {
                const item = elements.documentRef.createElement('div');
                item.className = 'indicator-observation';
                const label = elements.documentRef.createElement('strong');
                label.textContent = `${OBSERVATION_LABELS[key]}: `;
                const value = elements.documentRef.createElement('span');
                value.textContent = analysis.observations && analysis.observations[key]
                    ? analysis.observations[key]
                    : 'Not clearly readable';
                item.append(label, value);
                elements.indicatorObservations.appendChild(item);
            });
            elements.analysisUncertainties.textContent = Array.isArray(analysis.uncertainties) &&
                analysis.uncertainties.length
                ? `Uncertainties: ${analysis.uncertainties.join(' ')}`
                : '';
        }

        async function analyze(file) {
            if (busy) return false;
            busy = true;
            elements.screenshotInput.disabled = true;
            setDirection('WAIT');
            elements.signalTimestamp.textContent = 'Analyzing…';
            elements.analysisStatus.textContent = 'Analyzing locally with Ollama qwen3-vl:4b. This may take a few minutes on this computer…';
            elements.marketDataStatus.textContent = 'Analyzing the uploaded screenshot locally…';
            if (elements.analysisStatus.classList) elements.analysisStatus.classList.add('is-loading');
            elements.indicatorObservations.replaceChildren();
            elements.analysisUncertainties.textContent = '';
            try {
                const dataUrl = await readFile(file);
                const response = await fetchImpl('/api/analyze-screenshot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ dataUrl })
                });
                const body = await response.json();
                if (!response.ok) throw new Error(body.error || `Screenshot analysis failed (HTTP ${response.status}).`);
                if (!body || !['UP', 'DOWN', 'WAIT'].includes(body.direction) ||
                    typeof body.explanation !== 'string' || typeof body.id !== 'string' ||
                    body.analysis_type !== 'SCREENSHOT_VISUAL' ||
                    body.validation_status !== 'NOT_VALIDATED') {
                    throw new Error('Vision model returned an invalid screenshot-analysis response.');
                }
                renderAnalysis(body);
                elements.visionModelStatus.textContent = `Ollama ready · ${body.model}`;
                elements.visionSetupDetails.textContent =
                    `Local Ollama accepted the image and returned a screenshot analysis: ${body.model}.`;
                elements.analysisStatus.textContent =
                    'Analysis complete. This visual impression is not a validated strategy or verified market data.';
                onAnalysis(body);
                return true;
            } catch (error) {
                logger.error('Screenshot analysis failed:', error);
                setDirection('WAIT');
                elements.marketDataStatus.textContent = error.message;
                elements.analysisStatus.textContent = error.message;
                elements.signalTimestamp.textContent = 'Not available';
                elements.indicatorObservations.replaceChildren();
                elements.analysisUncertainties.textContent = '';
                if (/ollama.*not responding|could not reach local ollama/i.test(error.message)) {
                    elements.visionModelStatus.textContent = 'Ollama not running';
                    elements.visionSetupDetails.textContent = error.message;
                } else if (/not available/i.test(error.message) && /qwen3-vl:4b|ollama/i.test(error.message)) {
                    elements.visionModelStatus.textContent = 'Ollama model unavailable';
                    elements.visionSetupDetails.textContent = error.message;
                } else if (/vision capability/i.test(error.message)) {
                    elements.visionModelStatus.textContent = 'Model lacks vision capability';
                    elements.visionSetupDetails.textContent = error.message;
                }
                return false;
            } finally {
                busy = false;
                elements.screenshotInput.disabled = false;
                elements.screenshotInput.value = '';
                if (elements.analysisStatus.classList) elements.analysisStatus.classList.remove('is-loading');
            }
        }

        async function handleFile(file) {
            if (!file) return false;
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                elements.analysisStatus.textContent = 'Choose a PNG, JPEG, or WebP screenshot.';
                setDirection('WAIT');
                elements.marketDataStatus.textContent = elements.analysisStatus.textContent;
                elements.signalTimestamp.textContent = 'Not available';
                elements.indicatorObservations.replaceChildren();
                elements.analysisUncertainties.textContent = '';
                elements.screenshotInput.value = '';
                return false;
            }
            if (file.size > MAX_IMAGE_BYTES) {
                elements.analysisStatus.textContent = 'Screenshot exceeds the 8 MB limit.';
                setDirection('WAIT');
                elements.marketDataStatus.textContent = elements.analysisStatus.textContent;
                elements.signalTimestamp.textContent = 'Not available';
                elements.indicatorObservations.replaceChildren();
                elements.analysisUncertainties.textContent = '';
                elements.screenshotInput.value = '';
                return false;
            }
            if (previewUrl) revokeObjectURL(previewUrl);
            previewUrl = createObjectURL(file);
            elements.screenshotPreview.src = previewUrl;
            elements.screenshotPreviewContainer.hidden = false;
            return analyze(file);
        }

        async function handleFileChange() {
            const file = elements.screenshotInput.files && elements.screenshotInput.files[0];
            return handleFile(file);
        }

        elements.screenshotInput.addEventListener('change', () => { void handleFileChange(); });
        if (elements.dropZone) {
            elements.dropZone.addEventListener('dragover', event => {
                event.preventDefault();
                if (elements.dropZone.classList) elements.dropZone.classList.add('is-dragging');
            });
            elements.dropZone.addEventListener('dragleave', event => {
                event.preventDefault();
                if (elements.dropZone.classList) elements.dropZone.classList.remove('is-dragging');
            });
            elements.dropZone.addEventListener('drop', event => {
                event.preventDefault();
                if (elements.dropZone.classList) elements.dropZone.classList.remove('is-dragging');
                const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
                return handleFile(file);
            });
        }
        void refreshModelStatus();

        return { refreshModelStatus, analyze, handleFile, handleFileChange };
    }

    function mount(windowRef) {
        const documentRef = windowRef && windowRef.document;
        if (!documentRef || typeof windowRef.fetch !== 'function') return null;
        const byId = id => documentRef.getElementById(id);
        const elements = {
            documentRef,
            dropZone: byId('screenshotDropZone'),
            screenshotInput: byId('screenshotInput'),
            screenshotPreview: byId('screenshotPreview'),
            screenshotPreviewContainer: byId('screenshotPreviewContainer'),
            analysisStatus: byId('analysisStatus'),
            visionModelStatus: byId('visionModelStatus'),
            visionSetupDetails: byId('visionSetupDetails'),
            signalDirection: byId('signalDirection'),
            marketDataStatus: byId('marketDataStatus'),
            signalTimestamp: byId('signalTimestamp'),
            indicatorObservations: byId('indicatorObservations'),
            analysisUncertainties: byId('analysisUncertainties')
        };
        if (Object.values(elements).some(element => !element)) return null;

        const notificationController = windowRef.SignalNotifications
            ? windowRef.SignalNotifications.createController({
                onScreenshotAnalysis: analysis => {
                    if (typeof windowRef.showScreenshotNotification === 'function') {
                        windowRef.showScreenshotNotification(analysis);
                    }
                },
                playSound: (direction, id) => {
                    if (typeof windowRef.playSignalSound === 'function') {
                        windowRef.playSignalSound(direction, id);
                    }
                }
            })
            : null;

        return createController({
            elements,
            fetchImpl: windowRef.fetch.bind(windowRef),
            readFile: file => new Promise((resolve, reject) => {
                const reader = new windowRef.FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Could not read the selected screenshot.'));
                reader.readAsDataURL(file);
            }),
            createObjectURL: file => windowRef.URL.createObjectURL(file),
            revokeObjectURL: url => windowRef.URL.revokeObjectURL(url),
            onAnalysis: analysis => {
                if (analysis.direction !== 'WAIT' && notificationController) {
                    notificationController.notifyScreenshotAnalysis(analysis);
                }
            }
        });
    }

    return { createController, mount, MAX_IMAGE_BYTES };
});
