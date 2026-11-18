'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const zlib = require('node:zlib');
const { createServer } = require('../server.js');
const { createVisionService, MODEL, OLLAMA_URL, SYSTEM_PROMPT } = require('../vision_provider.js');

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    typeBytes.copy(chunk, 4);
    data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
    return chunk;
}

function createSolidPng() {
    const width = 64;
    const height = 64;
    const rowLength = width * 3 + 1;
    const pixels = Buffer.alloc(rowLength * height);
    for (let y = 0; y < height; y += 1) {
        pixels[y * rowLength] = 0;
        pixels.fill(128, y * rowLength + 1, (y + 1) * rowLength);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 2;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', zlib.deflateSync(pixels)),
        pngChunk('IEND', Buffer.alloc(0))
    ]);
}

const solidPngBase64 = createSolidPng().toString('base64');
const mockAnswer = {
    direction: 'UP',
    explanation: 'MOCKED: visible chart features lean upward; this is not validated.',
    observations: {
        ema9: 'MOCKED: line appears above EMA 21',
        ema21: 'MOCKED: visible',
        bollingerBands: null,
        rsi14: 'MOCKED: unreadable',
        macd: null,
        candles: 'MOCKED: recent candles appear upward',
        trend: 'MOCKED: rising',
        supportResistance: null
    },
    uncertainties: ['MOCKED: numeric indicator values are not legible.']
};

function showResponse(capabilities = ['completion', 'vision']) {
    return {
        ok: true,
        async json() {
            return { capabilities };
        }
    };
}

test('Ollama status reports unavailable server and unavailable model clearly', async () => {
    const offline = createVisionService({ fetchImpl: async () => {
        throw new Error('Ollama not running');
    } });
    const offlineStatus = await offline.getStatus();
    assert.equal(offlineStatus.configured, false);
    assert.match(offlineStatus.message, /Ollama is not responding/);

    const missingModel = createVisionService({ fetchImpl: async () => ({ status: 404, ok: false }) });
    const missingStatus = await missingModel.getStatus();
    assert.equal(missingStatus.configured, false);
    assert.ok(missingStatus.message.includes(MODEL));
    assert.match(missingStatus.message, /not available/);
});

test('Ollama status checks the required local model vision capability', async () => {
    const service = createVisionService({
        fetchImpl: async url => {
            assert.equal(url, `${OLLAMA_URL}/api/show`);
            return showResponse();
        }
    });
    assert.deepEqual(await service.getStatus(), {
        configured: true,
        model: MODEL,
        provider: 'Local Ollama',
        message: `Ollama is available and ${MODEL} reports image/vision capability.`
    });

    const noVision = createVisionService({ fetchImpl: async () => showResponse(['completion']) });
    assert.match((await noVision.getStatus()).message, /does not report image\/vision capability/);
});

test('MOCKED Ollama integration posts the uploaded image as Base64 in the images array', async () => {
    const calls = [];
    const service = createVisionService({
        createId: () => 'mock-analysis-id',
        fetchImpl: async (url, options) => {
            calls.push({ url: String(url), options });
            if (String(url).endsWith('/api/show')) return showResponse();
            return {
                ok: true,
                async json() {
                    return { message: { content: JSON.stringify(mockAnswer) } };
                }
            };
        }
    });

    const result = await service.analyzeScreenshot({ dataUrl: `data:image/png;base64,${solidPngBase64}` });
    const showCall = calls[0];
    const chatCall = calls[1];
    const sentBody = JSON.parse(chatCall.options.body);
    assert.equal(showCall.url, `${OLLAMA_URL}/api/show`);
    assert.equal(chatCall.url, `${OLLAMA_URL}/api/chat`);
    assert.equal(chatCall.options.method, 'POST');
    assert.equal(sentBody.model, 'qwen3-vl:4b');
    assert.equal(sentBody.stream, false);
    assert.equal(sentBody.think, false);
    assert.equal(sentBody.messages[1].images[0], solidPngBase64);
    assert.match(SYSTEM_PROMPT, /Bollinger Bands \(20,2\)/);
    assert.equal(result.id, 'mock-analysis-id');
    assert.equal(result.direction, 'UP');
    assert.equal(result.analysis_type, 'SCREENSHOT_VISUAL');
    assert.equal(result.validation_status, 'NOT_VALIDATED');
    assert.equal(result.observations.bollingerBands, null);
});

test('invalid images and invalid model output are rejected without fake directional results', async () => {
    let chatCount = 0;
    const service = createVisionService({
        fetchImpl: async url => {
            if (String(url).endsWith('/api/show')) return showResponse();
            chatCount += 1;
            return {
                ok: true,
                async json() {
                    return { message: { content: '{"direction":"BUY","explanation":"wrong"}' } };
                }
            };
        }
    });

    await assert.rejects(
        service.analyzeScreenshot({ dataUrl: `data:image/jpeg;base64,${solidPngBase64}` }),
        /does not match/
    );
    await assert.rejects(
        service.analyzeScreenshot({ dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }),
        /PNG, JPEG, or WebP/
    );
    assert.equal(chatCount, 0);
    await assert.rejects(
        service.analyzeScreenshot({ dataUrl: `data:image/png;base64,${solidPngBase64}` }),
        error => error.statusCode === 502 && /invalid direction/.test(error.message)
    );
    assert.equal(chatCount, 1);
});

test('MOCKED directional output falls back to WAIT without readable candles and indicators', async () => {
    const service = createVisionService({
        fetchImpl: async url => {
            if (String(url).endsWith('/api/show')) return showResponse();
            return {
                ok: true,
                async json() {
                    return {
                        message: {
                            content: JSON.stringify({
                                direction: 'UP',
                                explanation: 'MOCKED: bullish.',
                                observations: { candles: null, ema9: null },
                                uncertainties: ['MOCKED: chart is unreadable.']
                            })
                        }
                    };
                }
            };
        }
    });

    const result = await service.analyzeScreenshot({ dataUrl: `data:image/png;base64,${solidPngBase64}` });
    assert.equal(result.direction, 'WAIT');
    assert.match(result.explanation, /readable candle evidence/);
});

test('MOCKED local HTTP integration exposes Ollama status and screenshot analysis', async t => {
    const server = createServer({
        async getStatus() {
            return { configured: true, model: MODEL, provider: 'Local Ollama', message: 'MOCKED Ollama status' };
        },
        async analyzeScreenshot(input) {
            assert.equal(input.dataUrl, `data:image/png;base64,${solidPngBase64}`);
            return {
                id: 'mock-http-id',
                analysis_type: 'SCREENSHOT_VISUAL',
                validation_status: 'NOT_VALIDATED',
                model: MODEL,
                analyzed_at: '2026-01-01T00:00:00.000Z',
                direction: 'WAIT',
                explanation: 'MOCKED: image details are unclear.',
                observations: {},
                uncertainties: ['MOCKED: chart text is too small.']
            };
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;

    const statusResponse = await fetch(`${origin}/api/vision-status`);
    assert.equal((await statusResponse.json()).model, MODEL);
    const analysisResponse = await fetch(`${origin}/api/analyze-screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: `data:image/png;base64,${solidPngBase64}` })
    });
    const result = await analysisResponse.json();
    assert.equal(analysisResponse.status, 200);
    assert.equal(result.direction, 'WAIT');
    assert.match(result.explanation, /MOCKED/);
});

test('REAL local Ollama image-input integration (solid-color smoke image, not a chart)', {
    skip: process.env.RUN_OLLAMA_INTEGRATION !== '1' &&
        'Set RUN_OLLAMA_INTEGRATION=1 to run the slow real-model smoke test.'
}, async t => {
    const service = createVisionService();
    const status = await service.getStatus();
    if (!status.configured) {
        t.skip(status.message);
        return;
    }
    const result = await service.analyzeScreenshot({
        dataUrl: `data:image/png;base64,${solidPngBase64}`
    });
    assert.equal(result.direction, 'WAIT');
    assert.equal(result.analysis_type, 'SCREENSHOT_VISUAL');
    assert.equal(result.validation_status, 'NOT_VALIDATED');
    assert.equal(result.model, MODEL);
});
