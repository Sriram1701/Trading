'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createVisionService } = require('./vision_provider.js');
const { getPerformanceDB } = require('./performance_db.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_REQUEST_BYTES = 11 * 1024 * 1024;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
};

function sendJson(res, statusCode, body) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(body));
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let bodyBytes = 0;
        let tooLarge = false;
        req.setEncoding('utf8');
        req.on('data', chunk => {
            if (tooLarge) return;
            bodyBytes += Buffer.byteLength(chunk, 'utf8');
            if (bodyBytes > MAX_REQUEST_BYTES) {
                tooLarge = true;
                body = '';
                return;
            }
            body += chunk;
        });
        req.on('end', () => {
            if (tooLarge) {
                reject(Object.assign(new Error('Screenshot upload is too large.'), { statusCode: 413 }));
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch {
                reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 }));
            }
        });
        req.on('error', reject);
    });
}

function createServer(visionService = createVisionService(), performanceDB = null) {
    let isAnalyzingOllama = false;
    const db = performanceDB || getPerformanceDB();

    return http.createServer(async (req, res) => {
        const requestUrl = new URL(req.url, 'http://127.0.0.1');
        if (requestUrl.pathname === '/api/vision-status' && req.method === 'GET') {
            sendJson(res, 200, await visionService.getStatus());
            return;
        }

        if (requestUrl.pathname === '/api/performance' && req.method === 'GET') {
            try {
                const metrics = db.getPerformanceMetrics();
                sendJson(res, 200, metrics);
            } catch (err) {
                sendJson(res, 500, { error: err.message });
            }
            return;
        }

        if (requestUrl.pathname === '/api/strategy/versions' && req.method === 'GET') {
            try {
                const versions = db.getStrategyVersions();
                sendJson(res, 200, { versions });
            } catch (err) {
                sendJson(res, 500, { error: err.message });
            }
            return;
        }

        if (requestUrl.pathname === '/api/strategy/rollback' && req.method === 'POST') {
            try {
                const body = await readJsonBody(req);
                const result = db.rollbackStrategy(body.targetVersion);
                sendJson(res, 200, result);
            } catch (err) {
                sendJson(res, 400, { error: err.message });
            }
            return;
        }

        if (requestUrl.pathname === '/api/signals' && req.method === 'POST') {
            try {
                const body = await readJsonBody(req);
                const saved = db.saveSignal(body);
                sendJson(res, 200, { success: true, signal: saved });
            } catch (err) {
                sendJson(res, 400, { error: err.message });
            }
            return;
        }

        if (requestUrl.pathname === '/api/signals/outcome' && req.method === 'POST') {
            try {
                const body = await readJsonBody(req);
                const updated = db.recordOutcome(body.signalId, body);
                sendJson(res, 200, { success: true, signal: updated });
            } catch (err) {
                sendJson(res, 400, { error: err.message });
            }
            return;
        }

        if (requestUrl.pathname === '/api/signals/trade' && req.method === 'POST') {
            try {
                const body = await readJsonBody(req);
                const updated = db.updateTradeStatus(body.signalId, body.tradePlaced);
                sendJson(res, 200, { success: true, signal: updated });
            } catch (err) {
                sendJson(res, 400, { error: err.message });
            }
            return;
        }

        if (requestUrl.pathname === '/api/candidate-audit' && req.method === 'POST') {
            try {
                const body = await readJsonBody(req);
                db.recordCandidate(body);
                sendJson(res, 200, { success: true });
            } catch (err) {
                sendJson(res, 400, { error: err.message });
            }
            return;
        }

        if ((requestUrl.pathname === '/api/analyze-frame' || requestUrl.pathname === '/api/analyze-screenshot') && req.method === 'POST') {
            if (isAnalyzingOllama) {
                sendJson(res, 429, {
                    error: 'Ollama is currently busy processing an existing chart frame. Concurrent requests are prevented to protect system resources.',
                    busy: true
                });
                return;
            }
            isAnalyzingOllama = true;
            const startTime = Date.now();
            try {
                const body = await readJsonBody(req);
                const analysis = await visionService.analyzeScreenshot(body);
                const serverLatencyMs = Date.now() - startTime;
                analysis.server_latency_ms = serverLatencyMs;
                analysis.frame_timestamp = body.frameTimestamp || null;
                sendJson(res, 200, analysis);
            } catch (error) {
                const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 502;
                sendJson(res, statusCode, { error: error.message || 'Frame analysis failed.' });
            } finally {
                isAnalyzingOllama = false;
            }
            return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendJson(res, 405, { error: 'Method not allowed.' });
            return;
        }

        let relativePath;
        try {
            relativePath = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
        } catch {
            res.writeHead(400);
            res.end();
            return;
        }
        const filePath = path.resolve(PUBLIC_DIR, `.${relativePath}`);
        if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
            res.writeHead(403);
            res.end();
            return;
        }

        fs.readFile(filePath, (error, content) => {
            if (error) {
                if (error.code === 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end('<h1>404 Not Found</h1>', 'utf-8');
                } else {
                    res.writeHead(500);
                    res.end('Server error.', 'utf-8');
                }
                return;
            }

            res.writeHead(200, {
                'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
                'Cache-Control': 'no-store'
            });
            if (req.method === 'HEAD') res.end();
            else res.end(content);
        });
    });
}

if (require.main === module) {
    const visionService = createVisionService();
    const server = createServer(visionService);
    server.listen(PORT, '127.0.0.1', () => {
        console.log(`\nSignal Desk is available at http://127.0.0.1:${PORT}`);
        void visionService.getStatus().then(status => console.log(status.message));
    });
}

module.exports = { createServer };
