'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const screenshotAnalysis = require('../public/screenshot_analysis.js');

class FakeElement {
    constructor(id) {
        this.id = id;
        this.textContent = '';
        this.disabled = false;
        this.hidden = id === 'screenshotPreviewContainer';
        this.dataset = {};
        this.files = [];
        this.children = [];
        this.listeners = {};
        this.classList = {
            values: new Set(),
            add: value => this.classList.values.add(value),
            remove: value => this.classList.values.delete(value)
        };
    }

    addEventListener(name, callback) {
        this.listeners[name] = callback;
    }

    append(label, value) {
        this.children.push(label, value);
    }

    appendChild(child) {
        this.children.push(child);
    }

    replaceChildren(...children) {
        this.children = children;
    }
}

function createHarness(fetchImpl, overrides = {}) {
    const ids = [
        'dropZone', 'screenshotInput', 'screenshotPreview', 'screenshotPreviewContainer',
        'analysisStatus', 'visionModelStatus', 'visionSetupDetails', 'signalDirection',
        'marketDataStatus', 'signalTimestamp', 'indicatorObservations', 'analysisUncertainties'
    ];
    const elements = Object.fromEntries(ids.map(id => [id, new FakeElement(id)]));
    const analyses = [];
    elements.documentRef = { createElement: () => new FakeElement('generated') };
    const controller = screenshotAnalysis.createController({
        elements,
        fetchImpl,
        readFile: async () => 'data:image/png;base64,actual-image-bytes',
        createObjectURL: () => 'blob:local-preview',
        revokeObjectURL() {},
        onAnalysis: result => analyses.push(result),
        logger: { error() {} },
        ...overrides
    });
    return { controller, elements, analyses };
}

test('MOCKED screenshot UI integration sends the selected image and renders actual endpoint response', async () => {
    const calls = [];
    const response = {
        id: 'mock-screenshot-id',
        analysis_type: 'SCREENSHOT_VISUAL',
        validation_status: 'NOT_VALIDATED',
        model: 'mock-vision',
        analyzed_at: '2026-01-01T00:00:00.000Z',
        direction: 'DOWN',
        explanation: 'MOCKED: visible chart bias is downward; not validated.',
        observations: { ema9: 'MOCKED: below EMA 21', rsi14: null },
        uncertainties: ['MOCKED: indicator labels are small.']
    };
    const harness = createHarness(async (url, options) => {
        calls.push({ url, options });
        if (url === '/api/vision-status') {
            return { ok: true, async json() { return { configured: true, model: 'mock-vision' }; } };
        }
        return { ok: true, async json() { return response; } };
    });
    harness.elements.screenshotInput.files = [{
        type: 'image/png',
        size: 12,
        name: 'chart.png'
    }];

    assert.equal(await harness.controller.handleFileChange(), true);
    assert.deepEqual(calls.map(call => call.url), ['/api/vision-status', '/api/analyze-screenshot']);
    assert.equal(JSON.parse(calls[1].options.body).dataUrl, 'data:image/png;base64,actual-image-bytes');
    assert.equal(harness.elements.signalDirection.textContent, 'DOWN');
    assert.match(harness.elements.marketDataStatus.textContent, /MOCKED/);
    assert.deepEqual(harness.analyses.map(item => item.id), ['mock-screenshot-id']);
    assert.equal(harness.elements.screenshotPreview.src, 'blob:local-preview');
});

test('missing vision setup remains explicit WAIT and never invents an analysis', async () => {
    const harness = createHarness(async url => ({
        ok: url === '/api/vision-status',
        status: 503,
        async json() {
            return { error: 'Ollama is not responding at http://localhost:11434.' };
        }
    }));
    await Promise.resolve();
    harness.elements.screenshotInput.files = [{ type: 'image/png', size: 100 }];

    assert.equal(await harness.controller.handleFileChange(), false);
    assert.equal(harness.elements.signalDirection.textContent, 'WAIT');
    assert.match(harness.elements.marketDataStatus.textContent, /Ollama/);
    assert.deepEqual(harness.analyses, []);
});

test('unsupported and oversized files are rejected before upload', async () => {
    let postCount = 0;
    const harness = createHarness(async url => {
        if (url === '/api/analyze-screenshot') postCount += 1;
        return { ok: true, async json() { return { configured: false, message: 'Vision setup missing.' }; } };
    });
    harness.elements.screenshotInput.files = [{ type: 'image/gif', size: 10 }];
    assert.equal(await harness.controller.handleFileChange(), false);
    harness.elements.screenshotInput.files = [{ type: 'image/png', size: screenshotAnalysis.MAX_IMAGE_BYTES + 1 }];
    assert.equal(await harness.controller.handleFileChange(), false);
    assert.equal(postCount, 0);
});

test('primary UI exposes live screen monitor and notification controls', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.match(html, /id="desktopNotificationsToggle"/);
    assert.match(html, /id="chimeEnabledToggle"/);
    assert.match(html, /id="connectLiveScreenBtn"/);
    assert.match(html, /id="startMonitoringBtn"/);
    assert.match(html, /id="stopMonitoringBtn"/);
    assert.match(html, /live_screen_monitor\.js/);
});

test('MOCKED drag-and-drop upload automatically starts local screenshot analysis', async () => {
    let uploadedDataUrl;
    const response = {
        id: 'drop-analysis-1',
        analysis_type: 'SCREENSHOT_VISUAL',
        validation_status: 'NOT_VALIDATED',
        model: 'qwen3-vl:4b',
        analyzed_at: '2026-01-01T00:00:00.000Z',
        direction: 'WAIT',
        explanation: 'MOCKED: chart is unclear.',
        observations: {},
        uncertainties: ['MOCKED: indicators are not readable.']
    };
    const harness = createHarness(async (url, options) => {
        if (url === '/api/vision-status') {
            return { ok: true, async json() { return { configured: true, model: 'qwen3-vl:4b' }; } };
        }
        uploadedDataUrl = JSON.parse(options.body).dataUrl;
        return { ok: true, async json() { return response; } };
    }, { readFile: async () => 'data:image/png;base64,dropped-image' });
    const event = {
        prevented: false,
        dataTransfer: { files: [{ type: 'image/png', size: 12, name: 'chart.png' }] },
        preventDefault() { this.prevented = true; }
    };

    await harness.elements.dropZone.listeners.dragover(event);
    assert.equal(harness.elements.dropZone.classList.values.has('is-dragging'), true);
    assert.equal(await harness.elements.dropZone.listeners.drop(event), true);
    assert.equal(event.prevented, true);
    assert.equal(uploadedDataUrl, 'data:image/png;base64,dropped-image');
    assert.equal(harness.elements.signalDirection.textContent, 'WAIT');
    assert.equal(harness.elements.analysisStatus.classList.values.has('is-loading'), false);
});
