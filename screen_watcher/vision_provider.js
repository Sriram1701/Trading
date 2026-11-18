'use strict';

const crypto = require('crypto');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const ALTERNATE_OLLAMA_URL = OLLAMA_URL.includes('127.0.0.1')
    ? OLLAMA_URL.replace('127.0.0.1', 'localhost')
    : OLLAMA_URL.replace('localhost', '127.0.0.1');
const MODEL = 'qwen3-vl:4b';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Map([
    ['image/png', bytes => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))],
    ['image/jpeg', bytes => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff],
    ['image/webp', bytes => bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP']
]);

const SYSTEM_PROMPT = `Analyze only the attached chart frame from Quotex. You are an expert, disciplined technical chart observer. Never invent prices, OHLC, volume, timestamps, or indicator values; use null when unreadable.
Inspect visible technical factors:
1. EMA 9 and EMA 21 (slopes, relative positioning, and crossovers)
2. Bollinger Bands (20,2) (band width, upper/lower band bounces, touches, squeezes)
3. RSI 14 (70/30 levels: oversold recovery above 30, overbought rejection below 70, momentum)
4. MACD (12, 26, 9) (histogram bar expansion, centerline / signal line crossovers)
5. Candlestick patterns & Price Action (completed candle confirmation: hammer, engulfing, pin bar, rejection wicks)
6. Clearly identifiable Support and Resistance levels
7. Current Trend and Momentum direction

SIGNAL RULES:
- UP: Return UP ONLY when MULTIPLE independent technical factors (e.g. support/lower band bounce, bullish EMA 9>21 alignment, RSI turning up, MACD bullish crossover/histogram) all confirm a bullish move AND there is completed candle confirmation.
- DOWN: Return DOWN ONLY when MULTIPLE independent technical factors (e.g. resistance/upper band rejection, bearish EMA 9<21 alignment, RSI turning down, MACD bearish crossover/histogram) all confirm a bearish move AND there is completed candle confirmation.
- WAIT: Return WAIT whenever:
  * Indicators conflict or give mixed signals.
  * Price is consolidating, in a tight range, or moving sideways.
  * Momentum is weak or choppy.
  * A breakout is unconfirmed or candle is mid-formation / incomplete.
  * The chart or indicators are unclear or unreadable.
  * There is insufficient multi-factor confluence.

Never claim guaranteed profit or guaranteed prediction accuracy. No confidence percentages.
Return ONLY concise JSON in this exact structure:
{"direction":"UP|DOWN|WAIT","explanation":"concise multi-factor reason","observations":{"ema9":null,"ema21":null,"bollingerBands":null,"rsi14":null,"macd":null,"candles":null,"trend":null,"supportResistance":null},"uncertainties":[]}`;

function createVisionService({
    fetchImpl = globalThis.fetch,
    createId = () => crypto.randomUUID()
} = {}) {
    async function getStatus() {
        if (typeof fetchImpl !== 'function') {
            return {
                configured: false,
                model: MODEL,
                provider: 'Local Ollama',
                message: 'This Node.js version does not support fetch; use Node.js 18 or newer.'
            };
        }

        let response;
        try {
            response = await fetchImpl(`${OLLAMA_URL}/api/show`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(5000),
                body: JSON.stringify({ model: MODEL })
            });
        } catch (firstErr) {
            try {
                response = await fetchImpl(`${ALTERNATE_OLLAMA_URL}/api/show`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(5000),
                    body: JSON.stringify({ model: MODEL })
                });
            } catch {
                return {
                    configured: false,
                    model: MODEL,
                    provider: 'Local Ollama',
                    message: `Ollama is not responding at ${OLLAMA_URL}. Start Ollama; screenshots are processed locally only.`
                };
            }
        }

        if (response.status === 404) {
            return {
                configured: false,
                model: MODEL,
                provider: 'Local Ollama',
                message: `Ollama is running, but ${MODEL} is not available. Install that model in Ollama, then retry.`
            };
        }
        if (!response.ok) {
            return {
                configured: false,
                model: MODEL,
                provider: 'Local Ollama',
                message: `Ollama model check failed (HTTP ${response.status}).`
            };
        }

        let details;
        try {
            details = await response.json();
        } catch {
            return {
                configured: false,
                model: MODEL,
                provider: 'Local Ollama',
                message: 'Ollama returned an unreadable model status response.'
            };
        }
        if (!Array.isArray(details.capabilities) || !details.capabilities.includes('vision')) {
            return {
                configured: false,
                model: MODEL,
                provider: 'Local Ollama',
                message: `${MODEL} is installed, but Ollama does not report image/vision capability for it.`
            };
        }
        return {
            configured: true,
            model: MODEL,
            provider: 'Local Ollama',
            message: `Ollama is available and ${MODEL} reports image/vision capability.`
        };
    }

    function decodeImage(input) {
        if (!input || typeof input.dataUrl !== 'string') {
            throw Object.assign(new Error('Choose a PNG, JPEG, or WebP screenshot first.'), { statusCode: 400 });
        }
        const match = input.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
        if (!match) {
            throw Object.assign(new Error('Screenshot must be a PNG, JPEG, or WebP image.'), { statusCode: 400 });
        }
        const mimeType = match[1];
        const bytes = Buffer.from(match[2], 'base64');
        const expectedLength = Math.floor(match[2].length * 3 / 4) -
            (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
        if (bytes.length !== expectedLength || bytes.length === 0) {
            throw Object.assign(new Error('Screenshot image data is invalid.'), { statusCode: 400 });
        }
        if (bytes.length > MAX_IMAGE_BYTES) {
            throw Object.assign(new Error('Screenshot exceeds the 8 MB limit.'), { statusCode: 413 });
        }
        if (!IMAGE_TYPES.get(mimeType)(bytes)) {
            throw Object.assign(new Error('Image content does not match its declared file type.'), { statusCode: 400 });
        }
        return { mimeType, bytes };
    }

    function parseModelAnswer(content) {
        const text = typeof content === 'string'
            ? content
            : Array.isArray(content)
                ? content.map(part => part && part.text).filter(Boolean).join('\n')
                : '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Ollama did not return the required analysis format.');
        let answer;
        try {
            answer = JSON.parse(jsonMatch[0]);
        } catch {
            throw new Error('Ollama returned unreadable analysis data.');
        }
        if (!answer || !['UP', 'DOWN', 'WAIT'].includes(answer.direction) ||
            typeof answer.explanation !== 'string') {
            throw new Error('Ollama returned an invalid direction or explanation.');
        }

        const observationNames = [
            'ema9', 'ema21', 'bollingerBands', 'rsi14', 'macd', 'candles', 'trend', 'supportResistance'
        ];
        const observations = {};
        observationNames.forEach(name => {
            const value = answer.observations && answer.observations[name];
            observations[name] = typeof value === 'string' ? value.slice(0, 200) : null;
        });
        const uncertainties = Array.isArray(answer.uncertainties)
            ? answer.uncertainties.filter(item => typeof item === 'string').slice(0, 8).map(item => item.slice(0, 200))
            : [];
        let direction = answer.direction;
        let explanation = answer.explanation.slice(0, 600);
        const hasReadableCandles = Boolean(observations.candles);
        const readableFactorsCount = [
            observations.ema9,
            observations.ema21,
            observations.bollingerBands,
            observations.rsi14,
            observations.macd,
            observations.trend,
            observations.supportResistance
        ].filter(Boolean).length;

        if (direction !== 'WAIT' && (!hasReadableCandles || readableFactorsCount < 2)) {
            direction = 'WAIT';
            explanation = 'WAIT — the model did not return both readable candle evidence and multiple independent technical factors (at least 2 indicators/levels and completed candle confirmation).';
        }
        if (direction !== 'WAIT' && observations.candles && /incomplete|forming|unclosed|mid-candle|in progress/i.test(observations.candles)) {
            direction = 'WAIT';
            explanation = 'WAIT — candle is incomplete or mid-formation. Awaiting completed candle confirmation.';
        }
        if (direction !== 'WAIT' && uncertainties.some(u => /conflict|diverg|unclear|sideways|consolidat|choppy|incomplete/i.test(u))) {
            direction = 'WAIT';
            explanation = `WAIT — indicators conflict or market condition unclear (${uncertainties.join('; ')}).`;
        }
        return { direction, explanation, observations, uncertainties };
    }

    async function analyzeScreenshot(input) {
        const status = await getStatus();
        if (!status.configured) {
            throw Object.assign(new Error(status.message), { statusCode: 503 });
        }
        const { bytes } = decodeImage(input);

        const requestBody = JSON.stringify({
            model: MODEL,
            stream: false,
            format: 'json',
            keep_alive: '10m',
            think: false,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: 'Analyze only the attached chart frame. Return the requested JSON.',
                    images: [bytes.toString('base64')]
                }
            ],
            options: { temperature: 0.1, num_predict: 350 }
        });

        let response;
        try {
            response = await fetchImpl(`${OLLAMA_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(600000),
                body: requestBody
            });
        } catch (firstError) {
            if (firstError && firstError.name === 'TimeoutError') {
                throw Object.assign(new Error('Ollama chart analysis timed out.'), { statusCode: 502 });
            }
            try {
                response = await fetchImpl(`${ALTERNATE_OLLAMA_URL}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(600000),
                    body: requestBody
                });
            } catch (secondError) {
                const isTimeout = (secondError && secondError.name === 'TimeoutError');
                throw Object.assign(new Error(isTimeout
                    ? 'Ollama chart analysis timed out.'
                    : `Could not reach local Ollama at ${OLLAMA_URL}. Start Ollama and retry; no external service was used.`), { statusCode: 502 });
            }
        }

        if (!response.ok) {
            let detail = '';
            try {
                const errorBody = await response.json();
                if (typeof errorBody.error === 'string') detail = ` ${errorBody.error.slice(0, 240)}`;
            } catch {
                detail = '';
            }
            const message = response.status === 404
                ? `${MODEL} is not available in Ollama. Install the model and retry.`
                : `Ollama chart analysis failed (HTTP ${response.status}).${detail}`;
            throw Object.assign(new Error(message), { statusCode: 502 });
        }
        let responseBody;
        try {
            responseBody = await response.json();
        } catch {
            throw Object.assign(new Error('Ollama returned an invalid response.'), { statusCode: 502 });
        }
        if (responseBody.done_reason === 'length') {
            throw Object.assign(new Error('Ollama response was cut off before analysis completed. Try again.'), { statusCode: 502 });
        }
        const content = responseBody && responseBody.message && responseBody.message.content;
        let analysis;
        try {
            analysis = parseModelAnswer(content);
        } catch (error) {
            throw Object.assign(error, { statusCode: 502 });
        }
        return {
            id: createId(),
            analysis_type: (input && input.analysis_type) || 'SCREENSHOT_VISUAL',
            validation_status: 'NOT_VALIDATED',
            model: MODEL,
            analyzed_at: new Date().toISOString(),
            ...analysis
        };
    }

    return { getStatus, analyzeScreenshot, analyzeFrame: analyzeScreenshot };
}

module.exports = { createVisionService, MAX_IMAGE_BYTES, MODEL, OLLAMA_URL, SYSTEM_PROMPT };
