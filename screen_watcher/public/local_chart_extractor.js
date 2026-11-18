/**
 * local_chart_extractor.js
 * Fast pixel-level chart feature extractor for Quotex live screen frames.
 *
 * NOTE ON DATA RELIABILITY & LIMITATIONS:
 * Exact numerical OHLC and indicator values cannot be determined from screen pixels
 * without a direct broker API connection. All values extracted by this module are
 * visual estimates based on color thresholds, coordinate distributions, and geometric slopes.
 * This module NEVER fabricates exact numerical values. Unidentifiable components are
 * explicitly marked as 'unavailable' or 'visually_estimated'.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.LocalChartExtractor = api;
    }
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';

    function createExtractor() {
        let candleSeq = 0;
        let trackedFormingCandle = null;
        let lastClosedCandle = null;
        let previousCandlesCount = 0;
        let previousPenultimateX = null;
        let previousRightmostX = null;

        function reset() {
            candleSeq = 0;
            trackedFormingCandle = null;
            lastClosedCandle = null;
            previousCandlesCount = 0;
            previousPenultimateX = null;
            previousRightmostX = null;
        }

        /**
         * Scans canvas ImageData to extract candle shapes, colors, column positions,
         * indicator tracks, and candle completion state.
         *
         * @param {ImageData} imageData RGBA pixel data
         * @param {number} now Current timestamp
         * @returns {Object} Structured visual extraction
         */
        function extract(imageData, now = Date.now()) {
            if (!imageData || !imageData.width || !imageData.height || !imageData.data) {
                return {
                    isValid: false,
                    isReadable: false,
                    dataQuality: 'INVALID_FRAME',
                    exactValuesAvailable: false,
                    reason: 'Invalid or missing image buffer'
                };
            }

            const width = imageData.width;
            const height = imageData.height;
            const data = imageData.data;

            // Chart area bounds: strictly isolates the central candlestick chart
            // Excludes top header/asset bar (y < 7%), left navigation bar (x < 5%),
            // right trade execution buttons/panel (x > 84%), and bottom oscillator panel (y > 78%)
            const chartStartX = Math.floor(width * 0.05);
            const chartEndX = Math.floor(width * 0.84);
            const chartStartY = Math.floor(height * 0.07);
            const chartEndY = Math.floor(height * 0.78); // Upper 78% is main chart; bottom 22% is sub-panel (RSI/MACD)
            const subPanelStartY = Math.floor(height * 0.79);
            const subPanelEndY = Math.floor(height * 0.96);

            let greenPixels = 0;
            let redPixels = 0;
            let indicatorPixels = 0;
            let subPanelPixels = 0;

            // Scan column by column to detect candle bodies & wicks
            const columnColorDensity = new Array(width).fill(0);
            const columnGreenCount = new Array(width).fill(0);
            const columnRedCount = new Array(width).fill(0);
            const columnMinY = new Array(width).fill(height);
            const columnMaxY = new Array(width).fill(-1);

            // Sub-panel tracking for RSI / MACD
            const subPanelCurveY = [];

            for (let y = chartStartY; y < chartEndY; y += 1) {
                for (let x = chartStartX; x < chartEndX; x += 1) {
                    const offset = (y * width + x) * 4;
                    const r = data[offset];
                    const g = data[offset + 1];
                    const b = data[offset + 2];

                    // Green candle detection (Quotex bullish candles: bright green / teal)
                    const isGreen = g > 110 && g > r * 1.15 && g > b * 0.85;
                    // Red candle detection (Quotex bearish candles: bright red / pinkish red)
                    const isRed = r > 110 && r > g * 1.25 && r > b * 1.15;

                    if (isGreen) {
                        greenPixels += 1;
                        columnGreenCount[x] += 1;
                        columnColorDensity[x] += 1;
                        columnMinY[x] = Math.min(columnMinY[x], y);
                        columnMaxY[x] = Math.max(columnMaxY[x], y);
                    } else if (isRed) {
                        redPixels += 1;
                        columnRedCount[x] += 1;
                        columnColorDensity[x] += 1;
                        columnMinY[x] = Math.min(columnMinY[x], y);
                        columnMaxY[x] = Math.max(columnMaxY[x], y);
                    } else {
                        // Indicator line detection: distinct hues such as yellow (r>150, g>150, b<100) or cyan (r<100, g>150, b>150)
                        const isYellowOrCyan = (r > 150 && g > 150 && b < 100) || (r < 100 && g > 150 && b > 150);
                        if (isYellowOrCyan) {
                            indicatorPixels += 1;
                        }
                    }
                }
            }

            // Sub-panel scan for RSI / Oscillator curve (bottom 20%)
            for (let x = chartStartX; x < chartEndX; x += 2) {
                let foundY = -1;
                for (let y = subPanelStartY; y < subPanelEndY; y += 1) {
                    const offset = (y * width + x) * 4;
                    const r = data[offset];
                    const g = data[offset + 1];
                    const b = data[offset + 2];
                    // Sub-panel line or histogram pixels (often purple, blue, cyan or yellow)
                    const isSubCurve = (b > 130 && r > 100) || (g > 140 && b > 140 && r < 100) || (r > 160 && g > 160 && b < 120);
                    if (isSubCurve) {
                        foundY = y;
                        subPanelPixels += 1;
                    }
                }
                if (foundY !== -1) {
                    subPanelCurveY.push({ x, y: foundY });
                }
            }

            const totalCandlePixels = greenPixels + redPixels;
            if (totalCandlePixels < 40) {
                return {
                    isValid: true,
                    isReadable: false,
                    dataQuality: 'INSUFFICIENT_DATA',
                    exactValuesAvailable: false,
                    reason: 'No clear candlestick patterns detected in chart area.'
                };
            }

            // Cluster contiguous columns into individual candles
            const candles = [];
            let inCandle = false;
            let currentCandle = null;
            const maxCandleWidth = Math.max(12, Math.floor(width * 0.08));

            function finalizeCandle(c) {
                if (!c) return;
                const candleWidth = c.endX - c.startX + 1;
                const candleHeight = c.maxY - c.minY + 1;
                // Exclude wide UI elements, horizontal banners, and small noise
                if (candleWidth > maxCandleWidth || candleHeight < 3) return;

                c.polarity = c.greenCount > c.redCount ? 'BULLISH' : 'BEARISH';
                c.width = candleWidth;
                c.height = candleHeight;
                c.centerX = Math.round((c.startX + c.endX) / 2);

                // Analyze body vs wick vertical geometry
                let maxRowWidth = 0;
                const spanY = c.maxY - c.minY + 1;
                const rowWidths = new Array(spanY).fill(0);
                for (let y = c.minY; y <= c.maxY; y += 1) {
                    let rowColored = 0;
                    for (let x = c.startX; x <= c.endX; x += 1) {
                        const off = (y * width + x) * 4;
                        const r = data[off];
                        const g = data[off + 1];
                        const b = data[off + 2];
                        if ((g > 100 && g > r * 1.15 && g > b * 0.85) ||
                            (r > 100 && r > g * 1.25 && r > b * 1.15)) {
                            rowColored += 1;
                        }
                    }
                    const idx = y - c.minY;
                    rowWidths[idx] = rowColored;
                    if (rowColored > maxRowWidth) maxRowWidth = rowColored;
                }

                const bodyThreshold = Math.max(2, Math.floor(maxRowWidth * 0.5));
                let firstBodyIdx = -1;
                let lastBodyIdx = -1;
                for (let i = 0; i < rowWidths.length; i += 1) {
                    if (rowWidths[i] >= bodyThreshold) {
                        if (firstBodyIdx === -1) firstBodyIdx = i;
                        lastBodyIdx = i;
                    }
                }

                const bodyTop = firstBodyIdx !== -1 ? c.minY + firstBodyIdx : c.minY;
                const bodyBottom = lastBodyIdx !== -1 ? c.minY + lastBodyIdx : c.maxY;
                const bodyHeight = Math.max(1, bodyBottom - bodyTop + 1);
                const upperWick = Math.max(0, bodyTop - c.minY);
                const lowerWick = Math.max(0, c.maxY - bodyBottom);

                let pattern = 'NORMAL';
                if (bodyHeight <= 2 && (upperWick >= 2 || lowerWick >= 2)) {
                    pattern = 'DOJI';
                } else if (lowerWick >= bodyHeight * 1.8 && upperWick <= Math.max(2, bodyHeight * 0.6)) {
                    pattern = 'HAMMER';
                } else if (upperWick >= bodyHeight * 1.8 && lowerWick <= Math.max(2, bodyHeight * 0.6)) {
                    pattern = 'SHOOTING_STAR';
                }

                c.body = { top: bodyTop, bottom: bodyBottom, height: bodyHeight };
                c.wicks = { upper: upperWick, lower: lowerWick };
                c.pattern = pattern;

                candles.push(c);
            }

            for (let x = chartStartX; x < chartEndX; x += 1) {
                if (columnColorDensity[x] >= 2) {
                    if (!inCandle) {
                        inCandle = true;
                        currentCandle = {
                            startX: x,
                            endX: x,
                            greenCount: columnGreenCount[x],
                            redCount: columnRedCount[x],
                            minY: columnMinY[x],
                            maxY: columnMaxY[x]
                        };
                    } else {
                        currentCandle.endX = x;
                        currentCandle.greenCount += columnGreenCount[x];
                        currentCandle.redCount += columnRedCount[x];
                        currentCandle.minY = Math.min(currentCandle.minY, columnMinY[x]);
                        currentCandle.maxY = Math.max(currentCandle.maxY, columnMaxY[x]);
                    }
                } else if (inCandle) {
                    inCandle = false;
                    finalizeCandle(currentCandle);
                    currentCandle = null;
                }
            }
            if (currentCandle) {
                finalizeCandle(currentCandle);
                currentCandle = null;
            }

            if (candles.length < 2) {
                return {
                    isValid: true,
                    isReadable: false,
                    dataQuality: 'INSUFFICIENT_DATA',
                    exactValuesAvailable: false,
                    reason: 'Less than 2 distinct candles detected; unable to establish trend.'
                };
            }

            // Identify rightmost forming candle vs completed candles
            const rightmostCandle = candles[candles.length - 1];
            const currentPenultimate = candles[candles.length - 2];
            const recentCandles = candles.slice(-5);

            // 1. Calculate established candle stride (median distance between consecutive historical candles)
            let stride = 16;
            if (candles.length >= 3) {
                const deltas = [];
                for (let i = 0; i < candles.length - 2; i += 1) {
                    deltas.push(candles[i + 1].centerX - candles[i].centerX);
                }
                deltas.sort((a, b) => a - b);
                stride = Math.max(6, deltas[Math.floor(deltas.length / 2)] || 16);
            } else {
                stride = Math.max(6, currentPenultimate.centerX - candles[0].centerX || 16);
            }

            // 2. Stable Candle Identity and Completion Tracking (Fix 2)
            // A candle may become completed only when reliable evidence confirms the previous active candle closed.
            // Horizontal scrolling or minor wick jitter must never falsely trigger completion.
            let candleCompleted = false;

            if (!trackedFormingCandle) {
                // First observation: initialize forming candle with stable identity. It is actively forming: candleCompleted is false.
                candleSeq += 1;
                trackedFormingCandle = {
                    id: `candle_${candleSeq}`,
                    centerX: rightmostCandle.centerX,
                    width: rightmostCandle.width,
                    height: rightmostCandle.height,
                    minY: rightmostCandle.minY,
                    maxY: rightmostCandle.maxY,
                    polarity: rightmostCandle.polarity,
                    body: rightmostCandle.body,
                    wicks: rightmostCandle.wicks,
                    pattern: rightmostCandle.pattern,
                    isCompleted: false
                };
                candleCompleted = false;
            } else {
                let isNewCandleFormed = false;

                if (candles.length > previousCandlesCount) {
                    // A new candle column has been added to the right
                    isNewCandleFormed = true;
                } else if (candles.length === previousCandlesCount) {
                    // Same number of candles: check if chart scrolled or if a new candle formed and one scrolled off left
                    const deltaScroll = previousPenultimateX !== null ? currentPenultimate.centerX - previousPenultimateX : 0;
                    const expectedX = previousRightmostX !== null ? previousRightmostX + deltaScroll : trackedFormingCandle.centerX;
                    const actualAdvance = rightmostCandle.centerX - expectedX;

                    if (actualAdvance >= stride * 0.65) {
                        isNewCandleFormed = true;
                    } else {
                        // Same candle: update forming coordinates
                        trackedFormingCandle.centerX = rightmostCandle.centerX;
                        trackedFormingCandle.width = rightmostCandle.width;
                        trackedFormingCandle.height = rightmostCandle.height;
                        trackedFormingCandle.minY = rightmostCandle.minY;
                        trackedFormingCandle.maxY = rightmostCandle.maxY;
                        trackedFormingCandle.polarity = rightmostCandle.polarity;
                        trackedFormingCandle.body = rightmostCandle.body;
                        trackedFormingCandle.wicks = rightmostCandle.wicks;
                        trackedFormingCandle.pattern = rightmostCandle.pattern;
                        trackedFormingCandle.isCompleted = false;
                        candleCompleted = false;
                    }
                } else {
                    isNewCandleFormed = false;
                    candleCompleted = false;
                }

                if (isNewCandleFormed) {
                    // The previous forming candle has officially closed
                    lastClosedCandle = {
                        id: trackedFormingCandle.id,
                        centerX: trackedFormingCandle.centerX,
                        width: trackedFormingCandle.width,
                        height: trackedFormingCandle.height,
                        minY: trackedFormingCandle.minY,
                        maxY: trackedFormingCandle.maxY,
                        polarity: trackedFormingCandle.polarity,
                        body: trackedFormingCandle.body,
                        wicks: trackedFormingCandle.wicks,
                        pattern: trackedFormingCandle.pattern,
                        isCompleted: true
                    };

                    // Newly forming candle is initialized with a new identity
                    candleSeq += 1;
                    trackedFormingCandle = {
                        id: `candle_${candleSeq}`,
                        centerX: rightmostCandle.centerX,
                        width: rightmostCandle.width,
                        height: rightmostCandle.height,
                        minY: rightmostCandle.minY,
                        maxY: rightmostCandle.maxY,
                        polarity: rightmostCandle.polarity,
                        body: rightmostCandle.body,
                        wicks: rightmostCandle.wicks,
                        pattern: rightmostCandle.pattern,
                        isCompleted: false
                    };
                    candleCompleted = true;
                }
            }

            previousCandlesCount = candles.length;
            previousPenultimateX = currentPenultimate.centerX;
            previousRightmostX = rightmostCandle.centerX;

            // Indicator Visual Slope & Position Estimation
            // 1. Moving Averages / Trend
            let visualTrend = 'NEUTRAL';
            let consecutiveBullish = 0;
            let consecutiveBearish = 0;
            for (let i = Math.max(0, candles.length - 4); i < candles.length; i += 1) {
                if (candles[i].polarity === 'BULLISH') consecutiveBullish += 1;
                if (candles[i].polarity === 'BEARISH') consecutiveBearish += 1;
            }
            if (consecutiveBullish >= 3) visualTrend = 'BULLISH';
            else if (consecutiveBearish >= 3) visualTrend = 'BEARISH';

            // Price position relative to chart height (normalized 0.0 bottom to 1.0 top)
            const chartHeightSpan = chartEndY - chartStartY;
            const evalCandle = lastClosedCandle || currentPenultimate;
            const lastPriceNorm = (chartEndY - ((evalCandle.minY + evalCandle.maxY) / 2)) / chartHeightSpan;

            // 2. Bollinger Band Visual Position
            let bollingerPosition = 'MIDDLE';
            if (lastPriceNorm >= 0.80) {
                bollingerPosition = 'UPPER_BAND_TEST'; // Overbought / upper rejection zone
            } else if (lastPriceNorm <= 0.20) {
                bollingerPosition = 'LOWER_BAND_TEST'; // Oversold / lower support zone
            }

            // 3. Sub-panel RSI / Oscillator Visual Zone
            let rsiVisualZone = 'NEUTRAL';
            let rsiSlope = 'FLAT';
            if (subPanelCurveY.length >= 4) {
                const recentSub = subPanelCurveY.slice(-6);
                const subPanelSpan = subPanelEndY - subPanelStartY;
                const avgSubY = recentSub.reduce((acc, pt) => acc + pt.y, 0) / recentSub.length;
                // Higher Y in pixel coords means lower value on the indicator oscillator
                const rsiHeightRatio = (subPanelEndY - avgSubY) / subPanelSpan;

                if (rsiHeightRatio >= 0.70) rsiVisualZone = 'OVERBOUGHT';
                else if (rsiHeightRatio <= 0.30) rsiVisualZone = 'OVERSOLD';
                else rsiVisualZone = 'NEUTRAL';

                const firstSubY = recentSub[0].y;
                const lastSubY = recentSub[recentSub.length - 1].y;
                if (firstSubY - lastSubY > 2) rsiSlope = 'RISING'; // Upward on chart
                else if (lastSubY - firstSubY > 2) rsiSlope = 'FALLING';
            }

            return {
                isValid: true,
                isReadable: true,
                dataQuality: 'VISUAL_ESTIMATE',
                exactValuesAvailable: false,
                limitations: 'Exact numerical OHLC, EMA and RSI values are not directly queryable from pixels; extracted features represent geometric and color estimates.',
                candlesCount: candles.length,
                formingCandle: {
                    id: trackedFormingCandle.id,
                    polarity: trackedFormingCandle.polarity,
                    height: trackedFormingCandle.height,
                    centerX: trackedFormingCandle.centerX,
                    body: trackedFormingCandle.body,
                    wicks: trackedFormingCandle.wicks,
                    pattern: trackedFormingCandle.pattern,
                    isCompleted: false
                },
                lastCompletedCandle: lastClosedCandle ? {
                    id: lastClosedCandle.id,
                    polarity: lastClosedCandle.polarity,
                    height: lastClosedCandle.height,
                    minY: lastClosedCandle.minY,
                    maxY: lastClosedCandle.maxY,
                    body: lastClosedCandle.body,
                    wicks: lastClosedCandle.wicks,
                    pattern: lastClosedCandle.pattern,
                    isCompleted: true
                } : {
                    id: 'historical_penultimate',
                    polarity: currentPenultimate.polarity,
                    height: currentPenultimate.height,
                    minY: currentPenultimate.minY,
                    maxY: currentPenultimate.maxY,
                    body: currentPenultimate.body,
                    wicks: currentPenultimate.wicks,
                    pattern: currentPenultimate.pattern,
                    isCompleted: false
                },
                candleCompleted,
                visualTrend,
                bollingerPosition,
                rsiVisualZone,
                rsiSlope,
                indicatorPixelsDetected: indicatorPixels,
                extractedAt: now
            };
        }

        return { extract, reset };
    }

    return { createExtractor };
});
