'use strict';

(() => {
    const API_ROOT = 'http://127.0.0.1:8000/api/v1';
    const elements = {
        marketType: document.getElementById('marketTypeSelect'),
        category: document.getElementById('marketCategorySelect'),
        asset: document.getElementById('marketAssetSelect'),
        timeframe: document.getElementById('marketTimeframeSelect'),
        refresh: document.getElementById('refreshMarketDataBtn'),
        apiStatus: document.getElementById('marketApiStatus'),
        status: document.getElementById('marketDataStatus'),
        signalDirection: document.getElementById('signalDirection'),
        signalTimestamp: document.getElementById('signalTimestamp'),
        timestamp: document.getElementById('marketDataTimestamp'),
        chart: document.getElementById('marketCandleChart'),
        mtf: document.getElementById('marketTimeframeSummary'),
        indicators: document.getElementById('marketIndicators')
    };
    if (Object.values(elements).some(element => !element)) return;
    let currentCandles = [];
    const notificationController = window.SignalNotifications
        ? window.SignalNotifications.createController({
            onWait: message => {
                elements.signalDirection.textContent = 'WAIT';
                elements.status.textContent = message;
            },
            onSignal: () => {
                elements.signalDirection.textContent = 'WAIT';
            },
            playSound: (direction, signalId) => {
                if (typeof window.playSignalSound === 'function') {
                    window.playSignalSound(direction, signalId);
                }
            }
        })
        : null;

    function setStatus(message, online) {
        const monitorState = window.liveScreenMonitor &&
            typeof window.liveScreenMonitor.getState === 'function'
            ? window.liveScreenMonitor.getState()
            : null;
        if (monitorState && monitorState.connected) {
            message = 'WAIT — LIVE PRICE NOT VERIFIED. Screen sharing does not verify the selected Quotex instrument, market, price, or OHLC data.';
        }
        if (notificationController) notificationController.notifyWait(message);
        else {
            elements.signalDirection.textContent = 'WAIT';
            elements.status.textContent = message;
        }
        if (typeof online === 'boolean') {
            elements.apiStatus.textContent = online ? 'API connected' : 'API offline';
            elements.apiStatus.classList.toggle('market-api-online', online);
        }
    }

    function clearAnalysis(message) {
        currentCandles = [];
        drawCandles([]);
        elements.timestamp.textContent = message;
        elements.signalTimestamp.textContent = 'Not available';
        elements.mtf.textContent = 'Higher-timeframe summaries are unavailable.';
        elements.indicators.textContent = 'Indicator values require verified, quality-passed provider candles.';
    }

    async function request(path) {
        const response = await fetch(`${API_ROOT}${path}`, {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        });
        const body = await response.json();
        if (!response.ok) {
            const detail = body && body.detail;
            let message = detail && detail.message ? detail.message : `Market API returned HTTP ${response.status}.`;
            if (detail && Number.isFinite(detail.retry_after_seconds)) {
                message += ` Retry after ${detail.retry_after_seconds} seconds.`;
            }
            throw new Error(message);
        }
        return body;
    }

    function replaceOptions(select, entries, placeholder) {
        const options = [new Option(placeholder, '')];
        entries.forEach(entry => options.push(new Option(entry.label, entry.value)));
        select.replaceChildren(...options);
    }

    async function loadCategories() {
        const marketType = elements.marketType.value;
        elements.category.disabled = true;
        elements.asset.disabled = true;
        clearAnalysis(marketType === 'OTC'
            ? 'Not available — OTC data is unverified.'
            : 'No market data loaded.');
        replaceOptions(elements.category, [], marketType === 'OTC' ? 'Not available for unverified OTC' : 'All categories');
        replaceOptions(elements.asset, [], marketType === 'OTC' ? 'OTC data unverified' : 'Select an asset');
        if (marketType === 'OTC') {
            setStatus('WAIT — DATA NOT VERIFIED. No verified Quotex OTC candle source is configured.');
            return;
        }
        try {
            const result = await request(`/categories?market_type=${encodeURIComponent(marketType)}`);
            replaceOptions(elements.category, result.categories.map(value => ({ value, label: value })), 'All categories');
            elements.category.disabled = false;
            await loadAssets();
        } catch (error) {
            setStatus(`Market data unavailable: ${error.message}`);
        }
    }

    async function loadAssets(refresh = false) {
        if (elements.marketType.value !== 'REGULAR') return;
        const selectedAsset = elements.asset.value;
        const params = new URLSearchParams({ market_type: elements.marketType.value });
        if (elements.category.value) params.set('category', elements.category.value);
        if (refresh) params.set('refresh', 'true');
        try {
            const result = await request(`/assets?${params.toString()}`);
            replaceOptions(
                elements.asset,
                result.assets.map(asset => ({
                    value: asset.asset_id,
                    label: `${asset.symbol} — ${asset.name}`
                })),
                result.count ? 'Choose a discovered asset' : 'No assets discovered'
            );
            if (result.assets.some(asset => asset.asset_id === selectedAsset)) {
                elements.asset.value = selectedAsset;
            }
            elements.asset.disabled = result.assets.length === 0;
            setStatus('Public crypto API connected; asset prices are not verified Quotex data. Select an asset.', true);
            if (elements.asset.value) await loadMarketData();
        } catch (error) {
            replaceOptions(elements.asset, [], 'Asset discovery failed');
            setStatus(`Asset discovery failed: ${error.message}`);
        }
    }

    function drawCandles(candles) {
        currentCandles = candles;
        const canvas = elements.chart;
        const context = canvas.getContext('2d');
        const width = canvas.clientWidth || canvas.width;
        const height = 260;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        context.scale(ratio, ratio);
        context.clearRect(0, 0, width, height);
        context.fillStyle = '#080d18';
        context.fillRect(0, 0, width, height);
        if (!candles.length) {
            context.fillStyle = '#94a3b8';
            context.font = '14px sans-serif';
            context.fillText('No verified, quality-passed candles available.', 16, 28);
            return;
        }

        const visible = candles.slice(-100);
        const low = Math.min(...visible.map(candle => Number(candle.low)));
        const high = Math.max(...visible.map(candle => Number(candle.high)));
        const span = high - low || 1;
        const padding = 18;
        const plotHeight = height - padding * 2;
        const slot = width / visible.length;
        const bodyWidth = Math.max(2, Math.min(9, slot * 0.65));
        const y = price => padding + ((high - price) / span) * plotHeight;
        visible.forEach((candle, index) => {
            const center = index * slot + slot / 2;
            const rising = Number(candle.close) >= Number(candle.open);
            const color = rising ? '#00e676' : '#ff1744';
            context.strokeStyle = color;
            context.fillStyle = color;
            context.beginPath();
            context.moveTo(center, y(Number(candle.high)));
            context.lineTo(center, y(Number(candle.low)));
            context.stroke();
            const top = y(Math.max(Number(candle.open), Number(candle.close)));
            const bottom = y(Math.min(Number(candle.open), Number(candle.close)));
            context.fillRect(center - bodyWidth / 2, top, bodyWidth, Math.max(1, bottom - top));
        });
    }

    function showAnalysis(result) {
        const analysis = result.analysis || {};
        const indicators = analysis.indicators || {};
        const retrievedAt = result.retrieval_timestamp || 'unavailable';
        elements.timestamp.textContent = `Source: ${result.source || 'none'} • Retrieved: ${retrievedAt} • Quality: ${result.data_quality_status}`;
        elements.signalTimestamp.textContent = retrievedAt;
        elements.mtf.replaceChildren();
        const heading = document.createElement('strong');
        heading.textContent = 'Higher-timeframe checks: ';
        elements.mtf.appendChild(heading);
        const timeframes = result.multi_timeframe || {};
        if (Object.keys(timeframes).length === 0) {
            elements.mtf.append('Unavailable for this market or timeframe.');
        } else {
            Object.entries(timeframes).forEach(([timeframe, summary]) => {
                const item = document.createElement('span');
                item.className = 'market-mtf-item';
                item.textContent = `${timeframe}: ${summary.market_condition} / EMA ${summary.ema_alignment} / ${summary.data_quality_status}`;
                elements.mtf.appendChild(item);
            });
        }
        const values = [
            ['Decision', 'WAIT - NO HIGH-QUALITY SETUP'],
            ['Latest provider close', result.candles && result.candles.length
                ? formatValue(Number(result.candles[result.candles.length - 1].close))
                : 'Unavailable'],
            ['Market condition', analysis.market_condition || 'Unavailable'],
            ['EMA 9 / 20 / 50', [indicators.ema_9, indicators.ema_20, indicators.ema_50].map(formatValue).join(' / ')],
            ['RSI 14', formatValue(indicators.rsi_14)],
            ['MACD 12/26/9', formatMacd(indicators.macd_12_26_9)],
            ['Bollinger 20,2', formatBollinger(indicators.bollinger_20_2)],
            ['ATR 14 / ADX 14', `${formatValue(indicators.atr_14)} / ${formatValue(indicators.adx_14)}`],
            ['UTC-day VWAP', formatValue(indicators.vwap_utc_day)],
            ['Support / resistance (50-bar range)', formatLevels(indicators.support_resistance_50)],
            ['Previous-bar pivot', formatValue(indicators.previous_bar_pivots && indicators.previous_bar_pivots.pivot)],
            ['Latest candle patterns', (analysis.candlestick_patterns || []).join(', ') || 'None detected']
        ];
        elements.indicators.replaceChildren(...values.map(([label, value]) => {
            const line = document.createElement('div');
            line.textContent = `${label}: ${value}`;
            return line;
        }));
        const diagnostics = (result.diagnostics || []).concat(analysis.diagnostics || []);
        if (diagnostics.length) {
            const diagnostic = document.createElement('div');
            diagnostic.className = 'market-data-diagnostic';
            diagnostic.textContent = diagnostics.join(' ');
            elements.indicators.appendChild(diagnostic);
        }
    }

    function formatValue(value) {
        return typeof value === 'number' && Number.isFinite(value) ? value.toPrecision(6) : 'Unavailable';
    }

    function formatMacd(value) {
        if (!value) return 'Unavailable';
        return `${formatValue(value.line)} / ${formatValue(value.signal)} / ${formatValue(value.histogram)}`;
    }

    function formatBollinger(value) {
        if (!value) return 'Unavailable';
        return `${formatValue(value.lower)} / ${formatValue(value.middle)} / ${formatValue(value.upper)}`;
    }

    function formatLevels(value) {
        if (!value) return 'Unavailable';
        return `${formatValue(value.support)} / ${formatValue(value.resistance)}`;
    }

    async function loadMarketData() {
        const marketType = elements.marketType.value;
        elements.signalTimestamp.textContent = 'Checking data…';
        const params = new URLSearchParams({
            market_type: marketType,
            timeframe: elements.timeframe.value,
            limit: '200'
        });
        if (marketType === 'REGULAR') {
            if (!elements.asset.value) {
                setStatus('Select a dynamically discovered regular-market asset first.');
                drawCandles([]);
                elements.signalTimestamp.textContent = 'Not available';
                return;
            }
            params.set('asset_id', elements.asset.value);
        }
        setStatus('Fetching completed candles; no trade will be generated.');
        try {
            const result = await request(`/analysis?${params.toString()}`);
            drawCandles(result.candles || []);
            showAnalysis(result);
            const diagnostics = (result.diagnostics || []).join(' ');
            if (marketType === 'OTC' || result.decision_code === 'OTC_DATA_UNVERIFIED') {
                setStatus('WAIT — DATA NOT VERIFIED. No verified Quotex OTC candle source is configured.', true);
            } else if (result.data_quality_status !== 'QUALITY_PASSED') {
                setStatus(`WAIT — DATA NOT VERIFIED. ${diagnostics || result.decision_code || 'Candle quality checks did not pass.'}`, true);
            } else {
                setStatus(
                    `WAIT — SIGNAL NOT VALIDATED. Provider candles passed quality checks, but no directional strategy has passed validation.${diagnostics ? ` ${diagnostics}` : ''}`,
                    true
                );
            }
        } catch (error) {
            drawCandles([]);
            elements.signalTimestamp.textContent = 'Not available — request failed.';
            setStatus(`WAIT — DATA UNAVAILABLE. Market-data request failed: ${error.message}`, false);
        }
    }

    elements.marketType.addEventListener('change', loadCategories);
    elements.category.addEventListener('change', () => loadAssets());
    elements.refresh.addEventListener('click', async () => {
        if (elements.marketType.value === 'OTC') {
            await loadMarketData();
            return;
        }
        await loadAssets(true);
        await loadMarketData();
    });
    elements.timeframe.addEventListener('change', loadMarketData);
    elements.asset.addEventListener('change', loadMarketData);
    window.addEventListener('resize', () => drawCandles(currentCandles));
    loadCategories();
})();
