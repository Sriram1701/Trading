(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.LiveChartObserver = api;
    }
})(typeof globalThis === 'object' ? globalThis : this, function () {
    const GRID_WIDTH = 32;
    const GRID_HEIGHT = 18;

    function createObserver() {
        let previousLuminance = null;
        let previousLayout = null;
        let previousRowProfile = null;
        let lastChangedAt = null;

        function reset() {
            previousLuminance = null;
            previousLayout = null;
            previousRowProfile = null;
            lastChangedAt = null;
        }

        function observe(imageData, now = Date.now()) {
            if (!imageData || !Number.isInteger(imageData.width) ||
                !Number.isInteger(imageData.height) || imageData.width < 1 ||
                imageData.height < 1 || !imageData.data ||
                imageData.data.length < imageData.width * imageData.height * 4) {
                throw new TypeError('A valid RGBA frame is required for visual observation.');
            }

            const luminance = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
            const layout = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
            const columnColorCounts = new Uint32Array(GRID_WIDTH);
            const tileRedGreen = new Uint16Array(GRID_WIDTH * GRID_HEIGHT);
            const tileLuminance = new Uint32Array(GRID_WIDTH * GRID_HEIGHT);
            const tilePixelCounts = new Uint16Array(GRID_WIDTH * GRID_HEIGHT);
            let coloredPixels = 0;
            let minColorX = GRID_WIDTH;
            let minColorY = GRID_HEIGHT;
            let maxColorX = -1;
            let maxColorY = -1;

            // Chart area bounds (exclude top header bar, left icon bar, and right trade buttons)
            const chartBoundaryMinX = Math.floor(GRID_WIDTH * 0.05);
            const chartBoundaryMaxX = Math.floor(GRID_WIDTH * 0.85);
            const chartBoundaryMinY = Math.floor(GRID_HEIGHT * 0.06);
            const chartBoundaryMaxY = Math.floor(GRID_HEIGHT * 0.82);

            let fallbackColoredPixels = 0;
            let fallbackMinColorX = GRID_WIDTH;
            let fallbackMinColorY = GRID_HEIGHT;
            let fallbackMaxColorX = -1;
            let fallbackMaxColorY = -1;

            for (let y = 0; y < imageData.height; y += 1) {
                const gridY = Math.min(GRID_HEIGHT - 1, Math.floor(y * GRID_HEIGHT / imageData.height));
                for (let x = 0; x < imageData.width; x += 1) {
                    const gridX = Math.min(GRID_WIDTH - 1, Math.floor(x * GRID_WIDTH / imageData.width));
                    const offset = (y * imageData.width + x) * 4;
                    const red = imageData.data[offset];
                    const green = imageData.data[offset + 1];
                    const blue = imageData.data[offset + 2];
                    const index = gridY * GRID_WIDTH + gridX;
                    tileLuminance[index] += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
                    tilePixelCounts[index] += 1;

                    const isRed = red > 100 && red > green * 1.25 && red > blue * 1.15;
                    const isGreen = green > 100 && green > red * 1.15 && green > blue * 0.85;
                    if (isRed || isGreen) {
                        fallbackColoredPixels += 1;
                        fallbackMinColorX = Math.min(fallbackMinColorX, gridX);
                        fallbackMinColorY = Math.min(fallbackMinColorY, gridY);
                        fallbackMaxColorX = Math.max(fallbackMaxColorX, gridX);
                        fallbackMaxColorY = Math.max(fallbackMaxColorY, gridY);

                        const inChartArea = gridX >= chartBoundaryMinX && gridX <= chartBoundaryMaxX &&
                                            gridY >= chartBoundaryMinY && gridY <= chartBoundaryMaxY;
                        if (inChartArea) {
                            coloredPixels += 1;
                            columnColorCounts[gridX] += 1;
                            tileRedGreen[index] = 1;
                            minColorX = Math.min(minColorX, gridX);
                            minColorY = Math.min(minColorY, gridY);
                            maxColorX = Math.max(maxColorX, gridX);
                            maxColorY = Math.max(maxColorY, gridY);
                        }
                    }
                }
            }

            if (maxColorX < 0 && fallbackMaxColorX >= 0) {
                minColorX = fallbackMinColorX;
                minColorY = fallbackMinColorY;
                maxColorX = fallbackMaxColorX;
                maxColorY = fallbackMaxColorY;
                coloredPixels = fallbackColoredPixels;
            }

            let contrastTotal = 0;
            let edgeCount = 0;
            let layoutChanges = 0;
            let frameDifference = 1;
            for (let gridY = 0; gridY < GRID_HEIGHT; gridY += 1) {
                for (let gridX = 0; gridX < GRID_WIDTH; gridX += 1) {
                    const index = gridY * GRID_WIDTH + gridX;
                    luminance[index] = tilePixelCounts[index]
                        ? Math.round(tileLuminance[index] / tilePixelCounts[index])
                        : 0;
                    let localEdges = 0;
                    if (gridX > 0 && Math.abs(luminance[index] - luminance[index - 1]) > 28) {
                        localEdges += 1;
                    }
                    if (gridY > 0 && Math.abs(luminance[index] - luminance[index - GRID_WIDTH]) > 28) {
                        localEdges += 1;
                    }
                    edgeCount += localEdges;
                    layout[index] = tileRedGreen[index]
                        ? 8
                        : localEdges > 0
                            ? 7
                            : Math.floor(luminance[index] / 32);
                    contrastTotal += luminance[index];
                }
            }

            const sampleCount = luminance.length;
            const averageLuminance = contrastTotal / sampleCount;
            let variance = 0;
            for (const value of luminance) variance += (value - averageLuminance) ** 2;
            const contrast = Math.sqrt(variance / sampleCount);

            // High-sensitivity vertical profile sampling across central chart area
            const sampleRowStep = Math.max(1, Math.floor(imageData.height / 72));
            const sampleRowCount = Math.floor(imageData.height / sampleRowStep);
            const rowProfile = new Uint32Array(sampleRowCount);
            const scanMinX = Math.floor(imageData.width * 0.06);
            const scanMaxX = Math.floor(imageData.width * 0.84);
            const scanXStep = Math.max(1, Math.floor((scanMaxX - scanMinX) / 64));

            for (let rIdx = 0; rIdx < sampleRowCount; rIdx += 1) {
                const y = rIdx * sampleRowStep;
                let rSum = 0;
                const rowOff = y * imageData.width * 4;
                for (let x = scanMinX; x < scanMaxX; x += scanXStep) {
                    const off = rowOff + x * 4;
                    rSum += imageData.data[off] + imageData.data[off + 1] + imageData.data[off + 2];
                }
                rowProfile[rIdx] = rSum;
            }

            let rowDiffTotal = 0;
            if (previousRowProfile && previousRowProfile.length === sampleRowCount) {
                for (let i = 0; i < sampleRowCount; i += 1) {
                    rowDiffTotal += Math.abs(rowProfile[i] - previousRowProfile[i]);
                }
            }

            if (previousLuminance) {
                let differenceTotal = 0;
                for (let index = 0; index < sampleCount; index += 1) {
                    const diff = Math.abs(luminance[index] - previousLuminance[index]);
                    differenceTotal += diff;
                    if (layout[index] !== previousLayout[index]) layoutChanges += 1;
                }
                const tileDiff = differenceTotal / sampleCount / 255;
                const rowDiff = rowDiffTotal > 0 ? (rowDiffTotal / (sampleRowCount * 255 * 30)) : 0;
                frameDifference = Math.max(tileDiff, rowDiff);

                // Any genuine price tick or tile luminance change updates lastChangedAt
                if (differenceTotal >= 2 || rowDiffTotal >= 10 || frameDifference > 0.0001) {
                    lastChangedAt = now;
                }
            } else {
                lastChangedAt = now;
            }

            const coloredColumns = Array.from(columnColorCounts).filter(count => count >= 2).length;
            const chartVisibleCandidate = coloredPixels >= 10 && coloredColumns >= 3 && contrast >= 8;
            const edgeDensity = edgeCount / (sampleCount * 2);
            const readable = chartVisibleCandidate && (contrast >= 12 || coloredColumns >= 4);
            const unchangedForMs = Math.max(0, now - lastChangedAt);
            const layoutChangeRatio = previousLayout
                ? layoutChanges / sampleCount
                : 0;

            const visualQuality = readable
                ? (coloredColumns >= 8 ? 'GOOD — chart active' : 'MODERATE — visual estimate')
                : 'UNCLEAR';

            const observation = {
                chartVisibleCandidate,
                readable,
                visualQuality,
                coloredColumns,
                chartRegionCandidate: maxColorX < 0 ? null : {
                    x: minColorX / GRID_WIDTH,
                    y: minColorY / GRID_HEIGHT,
                    width: (maxColorX - minColorX + 1) / GRID_WIDTH,
                    height: (maxColorY - minColorY + 1) / GRID_HEIGHT
                },
                frameDifference,
                unchangedForMs,
                possibleLayoutChange: Boolean(previousLayout && layoutChangeRatio >= 0.55 && frameDifference >= 0.15)
            };

            previousLuminance = luminance;
            previousLayout = layout;
            previousRowProfile = rowProfile;
            return observation;
        }

        return { observe, reset };
    }

    return { createObserver };
});
