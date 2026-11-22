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
        let lastCandleCloseTimestamp = null; // Timestamp when last candle actually closed
        let previousCandlesCount = 0;
        let previousPenultimateX = null;
        let previousRightmostX = null;

        function reset() {
            candleSeq = 0;
            trackedFormingCandle = null;
            lastClosedCandle = null;
            lastCandleCloseTimestamp = null;
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
            // Excludes top header/asset bar & promotional banners (y < 24%), left navigation bar (x < 8%),
            // right trade execution buttons/panel (x > 84%), and bottom oscillator panel (y > 70%)
            const chartStartX = Math.floor(width * 0.08);
            const chartEndX = Math.floor(width * 0.83);
            const chartStartY = Math.floor(height * 0.24);
            const chartEndY = Math.floor(height * 0.70); // Upper chart area
            const subPanelStartY = Math.floor(height * 0.71);
            const subPanelEndY = Math.floor(height * 0.82);

            let greenPixels = 0;
            let redPixels = 0;
            let indicatorPixels = 0;
            let subPanelPixels = 0;

            const columnHasCandle = new Array(width).fill(false);
            const columnColor = new Array(width).fill(null);
            const columnTop = new Array(width).fill(height);
            const columnBottom = new Array(width).fill(-1);

            const minRun = Math.min(5, Math.max(3, Math.floor(height * 0.015)));
            const minSpan = Math.max(6, Math.floor(height * 0.012));

            for (let x = chartStartX; x < chartEndX; x += 1) {
                let maxG = 0, curG = 0;
                let maxR = 0, curR = 0;
                let topG = height, botG = -1;
                let topR = height, botR = -1;

                for (let y = chartStartY; y < chartEndY; y += 1) {
                    const offset = (y * width + x) * 4;
                    const r = data[offset];
                    const g = data[offset + 1];
                    const b = data[offset + 2];

                    const isGreen = g > 110 && g > r * 1.15 && g > b * 0.85;
                    const isRed = r > 110 && r > g * 1.25 && r > b * 1.15;

                    if (isGreen) {
                        greenPixels += 1;
                        curG += 1;
                        if (curG > maxG) maxG = curG;
                        if (y < topG) topG = y;
                        if (y > botG) botG = y;
                    } else {
                        curG = 0;
                    }

                    if (isRed) {
                        redPixels += 1;
                        curR += 1;
                        if (curR > maxR) maxR = curR;
                        if (y < topR) topR = y;
                        if (y > botR) botR = y;
                    } else {
                        curR = 0;
                    }

                    if (!isGreen && !isRed) {
                        const isYellowOrCyan = (r > 150 && g > 150 && b < 100) || (r < 100 && g > 150 && b > 150);
                        if (isYellowOrCyan) {
                            indicatorPixels += 1;
                        }
                    }
                }

                const spanG = botG >= topG ? botG - topG + 1 : 0;
                const spanR = botR >= topR ? botR - topR + 1 : 0;

                if (maxG >= minRun && spanG >= minSpan && maxG >= maxR) {
                    columnHasCandle[x] = true;
                    columnColor[x] = 'BULLISH';
                    columnTop[x] = topG;
                    columnBottom[x] = botG;
                } else if (maxR >= minRun && spanR >= minSpan && maxR > maxG) {
                    columnHasCandle[x] = true;
                    columnColor[x] = 'BEARISH';
                    columnTop[x] = topR;
                    columnBottom[x] = botR;
                }
            }

            // Sub-panel scan for RSI / Oscillator curve (bottom ~11%)
            // Filter out static toolbar/time axis rows by requiring horizontal variance & valid curve points
            const subPanelCurveY = [];
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

            // GHOST RSI REJECTION: Verify sub-panel curve has true dynamic vertical variation
            // Static time axis markings or bottom toolbar borders sit horizontally at nearly the same Y
            if (subPanelCurveY.length >= 8) {
                const subYs = subPanelCurveY.map(pt => pt.y);
                const minSubY = Math.min(...subYs);
                const maxSubY = Math.max(...subYs);
                // If vertical range is less than 3px or if all points are glued to the top edge, it's not a real oscillator
                if (maxSubY - minSubY < 3 || minSubY <= subPanelStartY + 2) {
                    subPanelCurveY.length = 0; // Invalidate false sub-panel curve
                }
            } else {
                subPanelCurveY.length = 0;
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
            let cur = null;
            const maxCandleWidth = Math.max(12, Math.floor(width * 0.06));

            function finalizeCandle(c) {
                if (!c) return;
                const candleWidth = c.endX - c.startX + 1;
                const candleHeight = c.maxY - c.minY + 1;
                // Exclude wide UI elements, horizontal banners, and small 1-2px noise
                if (candleWidth > maxCandleWidth || candleWidth < 3 || candleHeight < 4) return;

                c.polarity = c.color;
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
                } else if (candles.length > 0) {
                    const prev = candles[candles.length - 1];
                    if (prev.body) {
                        const isPrevBearish = prev.polarity === 'BEARISH';
                        const isPrevBullish = prev.polarity === 'BULLISH';
                        const isCurrBullish = c.polarity === 'BULLISH';
                        const isCurrBearish = c.polarity === 'BEARISH';

                        if (isPrevBearish && isCurrBullish && bodyTop <= prev.body.top && bodyBottom >= prev.body.bottom && bodyHeight > prev.body.height) {
                            pattern = 'BULLISH_ENGULFING';
                        } else if (isPrevBullish && isCurrBearish && bodyTop <= prev.body.top && bodyBottom >= prev.body.bottom && bodyHeight > prev.body.height) {
                            pattern = 'BEARISH_ENGULFING';
                        }
                    }
                }

                c.body = { top: bodyTop, bottom: bodyBottom, height: bodyHeight };
                c.wicks = { upper: upperWick, lower: lowerWick };
                c.pattern = pattern;
                c.x = c.centerX;
                c.id = `candle_${candles.length + 1}`;

                candles.push(c);
            }

            for (let x = chartStartX; x < chartEndX; x += 1) {
                if (columnHasCandle[x]) {
                    if (!cur) {
                        cur = { startX: x, endX: x, color: columnColor[x], minY: columnTop[x], maxY: columnBottom[x] };
                    } else if (cur.color !== columnColor[x]) {
                        finalizeCandle(cur);
                        cur = { startX: x, endX: x, color: columnColor[x], minY: columnTop[x], maxY: columnBottom[x] };
                    } else {
                        cur.endX = x;
                        cur.minY = Math.min(cur.minY, columnTop[x]);
                        cur.maxY = Math.max(cur.maxY, columnBottom[x]);
                    }
                } else if (cur) {
                    finalizeCandle(cur);
                    cur = null;
                }
            }
            if (cur) {
                finalizeCandle(cur);
                cur = null;
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
                    // Only accept as a newly formed candle if the rightmost candle is positioned to the right of previous forming candle by >= stride * 0.65
                    const actualAdvance = rightmostCandle.centerX - trackedFormingCandle.centerX;
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
                    lastCandleCloseTimestamp = now; // Capture exact close timestamp
                }
            }

            previousCandlesCount = candles.length;
            previousPenultimateX = currentPenultimate.centerX;
            previousRightmostX = rightmostCandle.centerX;

            // Indicator Visual Slope & Position Estimation
            // 1. Moving Averages, Sequence & Price Structure Progression
            let visualTrend = 'NEUTRAL';
            let consecutiveBullish = 0;
            let consecutiveBearish = 0;
            for (let i = Math.max(0, candles.length - 4); i < candles.length; i += 1) {
                if (candles[i].polarity === 'BULLISH') consecutiveBullish += 1;
                if (candles[i].polarity === 'BEARISH') consecutiveBearish += 1;
            }
            if (consecutiveBullish >= 3) visualTrend = 'BULLISH';
            else if (consecutiveBearish >= 3) visualTrend = 'BEARISH';

            // Price Structure: Higher Highs & Higher Lows vs Lower Highs & Lower Lows
            let priceStructure = 'SIDEWAYS';
            if (candles.length >= 3) {
                let higherHighs = true;
                let higherLows = true;
                let lowerHighs = true;
                let lowerLows = true;
                const sample = candles.slice(-4);
                for (let i = 0; i < sample.length - 1; i += 1) {
                    const c1 = sample[i];
                    const c2 = sample[i + 1];
                    // In canvas coords, lower Y is higher price
                    if (c2.minY > c1.minY) higherHighs = false;
                    if (c2.maxY > c1.maxY) higherLows = false;
                    if (c2.minY < c1.minY) lowerHighs = false;
                    if (c2.maxY < c1.maxY) lowerLows = false;
                }
                if (higherHighs && higherLows) priceStructure = 'HIGHER_HIGHS_HIGHER_LOWS';
                else if (lowerHighs && lowerLows) priceStructure = 'LOWER_HIGHS_LOWER_LOWS';
            }

            // Moving Average Slope (Fast MA vs Slow MA of candle midpoints)
            let movingAverage = 'FLAT';
            if (candles.length >= 3) {
                const recentForMa = candles.slice(-5);
                const fastMa = (recentForMa.slice(-2).reduce((acc, c) => acc + (c.minY + c.maxY) / 2, 0)) / 2;
                const slowMa = (recentForMa.reduce((acc, c) => acc + (c.minY + c.maxY) / 2, 0)) / recentForMa.length;
                if (fastMa < slowMa - 2) movingAverage = 'BULLISH'; // lower canvas Y = higher price
                else if (fastMa > slowMa + 2) movingAverage = 'BEARISH';
            }

            // Price position relative to chart height (normalized 0.0 bottom to 1.0 top)
            const chartHeightSpan = chartEndY - chartStartY;
            const evalCandle = lastClosedCandle || currentPenultimate;
            const lastPriceNorm = (chartEndY - ((evalCandle.minY + evalCandle.maxY) / 2)) / chartHeightSpan;

            // 2. Dynamic Bollinger Band Visual Position
            // Symmetrically distinguishes between Trend Continuation (Band Walk) and Mean Reversion (Band Rejection)
            let bollingerPosition = 'MIDDLE';
            const evalBodyHeight = (evalCandle.body && evalCandle.body.height) || 5;
            const evalUpperWick = (evalCandle.wicks && evalCandle.wicks.upper) || 0;
            const evalLowerWick = (evalCandle.wicks && evalCandle.wicks.lower) || 0;

            if (indicatorPixels < 15) {
                bollingerPosition = 'UNAVAILABLE';
            } else if (lastPriceNorm >= 0.78) {
                // High band zone
                if (evalCandle.polarity === 'BULLISH' && evalUpperWick <= evalBodyHeight * 0.7) {
                    bollingerPosition = 'UPPER_BAND_WALK'; // Bullish trend breakout / expansion
                } else if (evalCandle.polarity === 'BEARISH' && (evalCandle.pattern === 'SHOOTING_STAR' || evalUpperWick >= evalBodyHeight * 0.8)) {
                    bollingerPosition = 'UPPER_BAND_REJECTION'; // Bearish rejection / resistance pullback requires rejection pattern or upper wick
                } else {
                    bollingerPosition = 'UPPER_BAND_TEST'; // General upper band boundary
                }
            } else if (lastPriceNorm <= 0.22) {
                // Low band zone
                if (evalCandle.polarity === 'BEARISH' && evalLowerWick <= evalBodyHeight * 0.7) {
                    bollingerPosition = 'LOWER_BAND_WALK'; // Bearish trend breakdown / expansion
                } else if (evalCandle.polarity === 'BULLISH' && (evalCandle.pattern === 'HAMMER' || evalLowerWick >= evalBodyHeight * 0.8)) {
                    bollingerPosition = 'LOWER_BAND_BOUNCE'; // Bullish bounce / support mean reversion requires rejection pattern or lower wick
                } else {
                    bollingerPosition = 'LOWER_BAND_TEST'; // General lower band boundary
                }
            }

            // 3. Sub-panel RSI / Oscillator Visual Zone
            let rsiVisualZone = 'NEUTRAL';
            let rsiSlope = 'FLAT';
            if (subPanelCurveY.length >= 6) {
                const recentSub = subPanelCurveY.slice(-8);
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
                candles: candles,
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
                    isCompleted: true,
                    candleClosedAt: lastCandleCloseTimestamp
                } : {
                    id: 'historical_penultimate',
                    polarity: currentPenultimate.polarity,
                    height: currentPenultimate.height,
                    minY: currentPenultimate.minY,
                    maxY: currentPenultimate.maxY,
                    body: currentPenultimate.body,
                    wicks: currentPenultimate.wicks,
                    pattern: currentPenultimate.pattern,
                    isCompleted: false,
                    candleClosedAt: null
                },
                candleCompleted,
                candleClosedAt: lastCandleCloseTimestamp,
                visualTrend,
                priceStructure,
                movingAverage,
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
