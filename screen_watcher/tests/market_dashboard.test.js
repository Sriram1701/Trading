'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'public', 'market_dashboard.js');
const dashboardSource = fs.readFileSync(sourcePath, 'utf8');

function createDashboard(responses) {
    const calls = [];
    const elements = new Map();
    const ids = [
        'marketTypeSelect', 'marketCategorySelect', 'marketAssetSelect', 'marketTimeframeSelect',
        'refreshMarketDataBtn', 'marketApiStatus', 'marketDataStatus', 'marketDataTimestamp',
        'marketCandleChart', 'marketTimeframeSummary', 'marketIndicators',
        'signalDirection', 'signalTimestamp'
    ];

    class FakeElement {
        constructor(id) {
            this.id = id;
            this.value = id === 'marketTypeSelect' ? 'REGULAR' : id === 'marketTimeframeSelect' ? '1m' : '';
            this.textContent = '';
            this.disabled = false;
            this.children = [];
            this.listeners = {};
            this.classList = { toggle() {} };
            this.width = 900;
            this.height = 320;
            this.clientWidth = 900;
            this.context = {
                scale() {}, clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {},
                lineTo() {}, stroke() {}, fillText() {}
            };
        }

        addEventListener(name, callback) {
            this.listeners[name] = callback;
        }

        async dispatch(name) {
            if (this.listeners[name]) await this.listeners[name]();
        }

        replaceChildren(...children) {
            this.children = children;
            if (!children.some(child => child.value === this.value)) {
                this.value = children.length ? children[0].value : '';
            }
        }

        append(...children) {
            this.children.push(...children);
        }

        appendChild(child) {
            this.children.push(child);
            return child;
        }

        getContext() {
            return this.context;
        }
    }

    class FakeOption {
        constructor(label, value) {
            this.textContent = label;
            this.value = value;
        }
    }

    ids.forEach(id => elements.set(id, new FakeElement(id)));
    const context = {
        document: {
            getElementById: id => elements.get(id) || null,
            createElement: () => new FakeElement('generated')
        },
        window: { devicePixelRatio: 1, addEventListener() {} },
        Option: FakeOption,
        URLSearchParams,
        fetch: async (url, options) => {
            calls.push({ url, options });
            const body = responses(url);
            return { ok: true, status: 200, json: async () => body };
        },
        console
    };
    vm.runInNewContext(dashboardSource, context, { filename: sourcePath });
    return { calls, elements };
}

test('market dashboard uses GET-only public data and keeps decisions WAIT', async () => {
    const dashboard = createDashboard(url => {
        if (url.includes('/categories')) return { categories: ['CRYPTO'] };
        if (url.includes('/assets')) return {
            count: 1,
            assets: [{ asset_id: 'binance_spot:BTCUSDT:REGULAR', symbol: 'BTCUSDT', name: 'BTC/USDT' }]
        };
        if (url.includes('/analysis')) return {
            decision: 'WAIT',
            decision_code: 'ANALYSIS_NOT_VALIDATED',
            source: 'binance_spot',
            retrieval_timestamp: '2025-01-01T00:01:00Z',
            data_quality_status: 'QUALITY_PASSED',
            diagnostics: [],
            candles: [],
            analysis: {
                decision: 'WAIT',
                market_condition: 'INSUFFICIENT_HISTORY',
                indicators: {},
                candlestick_patterns: [],
                diagnostics: []
            },
            multi_timeframe: {}
        };
    });

    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    const asset = dashboard.elements.get('marketAssetSelect');
    asset.value = 'binance_spot:BTCUSDT:REGULAR';
    await asset.dispatch('change');
    const requested = dashboard.calls.find(call => call.url.includes('/analysis'));
    assert.ok(requested);
    assert.match(requested.url, /^http:\/\/127\.0\.0\.1:8000\/api\/v1\/analysis/);
    assert.equal(requested.options.method || 'GET', 'GET');
    assert.ok(!requested.url.includes('localhost:3001'));
    assert.equal(dashboard.elements.get('signalDirection').textContent, 'WAIT');
    assert.match(dashboard.elements.get('marketDataStatus').textContent, /WAIT — SIGNAL NOT VALIDATED/);
});

test('dashboard labels OTC unverified and does not request OTC asset listings', async () => {
    const dashboard = createDashboard(url => {
        if (url.includes('/categories')) return { categories: ['CRYPTO'] };
        if (url.includes('/assets')) return { count: 0, assets: [] };
        if (url.includes('/analysis')) return {
            decision: 'WAIT',
            decision_code: 'OTC_DATA_UNVERIFIED',
            source: null,
            retrieval_timestamp: '2025-01-01T00:00:00Z',
            data_quality_status: 'UNVERIFIED',
            diagnostics: ['No verified OTC feed.'],
            candles: [],
            analysis: { decision: 'WAIT', market_condition: 'UNVERIFIED', indicators: {}, diagnostics: [] },
            multi_timeframe: {}
        };
        return {};
    });
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    const marketType = dashboard.elements.get('marketTypeSelect');
    marketType.value = 'OTC';
    await marketType.dispatch('change');
    await dashboard.elements.get('refreshMarketDataBtn').dispatch('click');
    assert.ok(!dashboard.calls.some(call => call.url.includes('/assets?') && call.url.includes('OTC')));
    const analysis = dashboard.calls.find(call => call.url.includes('/analysis'));
    assert.ok(analysis);
    assert.match(analysis.url, /market_type=OTC/);
    assert.equal(analysis.options.method || 'GET', 'GET');
    assert.equal(dashboard.elements.get('signalDirection').textContent, 'WAIT');
    assert.match(dashboard.elements.get('marketDataStatus').textContent, /WAIT — DATA NOT VERIFIED/);
});

test('quality-rejected candles remain WAIT and display an unverified-data message', async () => {
    const dashboard = createDashboard(url => {
        if (url.includes('/categories')) return { categories: ['CRYPTO'] };
        if (url.includes('/assets')) return {
            count: 1,
            assets: [{ asset_id: 'binance_spot:BTCUSDT:REGULAR', symbol: 'BTCUSDT', name: 'BTC/USDT' }]
        };
        if (url.includes('/analysis')) return {
            decision: 'WAIT',
            decision_code: 'STALE_DATA',
            source: 'binance_spot',
            retrieval_timestamp: '2025-01-01T00:01:00Z',
            data_quality_status: 'REJECTED',
            diagnostics: ['STALE_DATA: latest candle is stale.'],
            candles: [],
            analysis: { decision: 'WAIT', indicators: {}, diagnostics: [] },
            multi_timeframe: {}
        };
        return {};
    });

    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    const asset = dashboard.elements.get('marketAssetSelect');
    asset.value = 'binance_spot:BTCUSDT:REGULAR';
    await asset.dispatch('change');
    assert.equal(dashboard.elements.get('signalDirection').textContent, 'WAIT');
    assert.match(dashboard.elements.get('marketDataStatus').textContent, /WAIT — DATA NOT VERIFIED/);
    assert.equal(dashboard.elements.get('signalTimestamp').textContent, '2025-01-01T00:01:00Z');
});
