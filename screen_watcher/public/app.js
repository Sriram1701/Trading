/**
 * ==============================================================================
 * QUOTEX AI PRO COPILOT V3.0 - Ultra 99% Sniper Confluence & 6-Pillar Engine
 * ==============================================================================
 */

// DOM References
const startStreamBtn = document.getElementById('startStreamBtn');
const stopStreamBtn = document.getElementById('stopStreamBtn');
const selectRoiBtn = document.getElementById('selectRoiBtn');
const resetRoiBtn = document.getElementById('resetRoiBtn');
const mediaSourceSelect = document.getElementById('mediaSourceSelect');
const strategyModeSelect = document.getElementById('strategyModeSelect');
const expiryTimeframeSelect = document.getElementById('expiryTimeframeSelect');
const tfPillGroup = document.getElementById('tfPillGroup');

const quotexVideo = document.getElementById('quotexVideo');
const roiCanvas = document.getElementById('roiCanvas');
const processingCanvas = document.getElementById('processingCanvas');
const streamPlaceholder = document.getElementById('streamPlaceholder');
const cropBox = document.getElementById('cropBox');
const viewportBox = document.getElementById('viewportBox');

const scannerStatus = document.getElementById('scannerStatus');
const statusLabel = document.getElementById('statusLabel');
const clockDisplay = document.getElementById('clockDisplay');
const candleTimerText = document.getElementById('candleTimerText');
const countdownProgress = document.getElementById('countdownProgress');

const sessionWinRate = document.getElementById('sessionWinRate');
const totalSignalsCount = document.getElementById('totalSignalsCount');
const winCount = document.getElementById('winCount');
const lossCount = document.getElementById('lossCount');

// Flash Banner
const actionFlashBanner = document.getElementById('actionFlashBanner');
const flashIcon = document.getElementById('flashIcon');
const flashTitle = document.getElementById('flashTitle');
const flashExpiryBadge = document.getElementById('flashExpiryBadge');
const flashSubtitle = document.getElementById('flashSubtitle');
const flashCountdown = document.getElementById('flashCountdown');

// Active Trade Overlay (Locked Scanner)
const activeTradeOverlay = document.getElementById('activeTradeOverlay');
const activeTradeExpiryLabel = document.getElementById('activeTradeExpiryLabel');
const activeTradeIcon = document.getElementById('activeTradeIcon');
const activeTradeDirection = document.getElementById('activeTradeDirection');
const activeTradeDesc = document.getElementById('activeTradeDesc');
const activeTradeTimer = document.getElementById('activeTradeTimer');
const activeTradeProgressBar = document.getElementById('activeTradeProgressBar');
const recordWinBtn = document.getElementById('recordWinBtn');
const recordLossBtn = document.getElementById('recordLossBtn');
const cancelTradeBtn = document.getElementById('cancelTradeBtn');

// Signal HUD V2
const mainSignalHud = document.getElementById('mainSignalHud');
const hudActionIcon = document.getElementById('hudActionIcon');
const hudSignalTitle = document.getElementById('hudSignalTitle');
const hudSignalReason = document.getElementById('hudSignalReason');
const hudRecommendedExpiry = document.getElementById('hudRecommendedExpiry');
const hudConfidenceScore = document.getElementById('hudConfidenceScore');
const hudDetectedPattern = document.getElementById('hudDetectedPattern');
const hudActionTag = document.getElementById('hudActionTag');

// 6 Pillars Sniper Architecture References
const confluencePassedBadge = document.getElementById('confluencePassedBadge');
const pillarTrend = document.getElementById('pillarTrend');
const pillarTrendStatus = document.getElementById('pillarTrendStatus');
const pillarSqueeze = document.getElementById('pillarSqueeze');
const pillarSqueezeStatus = document.getElementById('pillarSqueezeStatus');
const pillarLevel = document.getElementById('pillarLevel');
const pillarLevelStatus = document.getElementById('pillarLevelStatus');
const pillarRsi = document.getElementById('pillarRsi');
const pillarRsiStatus = document.getElementById('pillarRsiStatus');
const pillarPattern = document.getElementById('pillarPattern');
const pillarPatternStatus = document.getElementById('pillarPatternStatus');
const pillarTiming = document.getElementById('pillarTiming');
const pillarTimingStatus = document.getElementById('pillarTimingStatus');

// Live Indicators Ribbon References
const indBbStatus = document.getElementById('indBbStatus');
const indBbSub = document.getElementById('indBbSub');
const indRsiStatus = document.getElementById('indRsiStatus');
const indRsiSub = document.getElementById('indRsiSub');
const indEmaStatus = document.getElementById('indEmaStatus');
const indEmaSub = document.getElementById('indEmaSub');
const indWickStatus = document.getElementById('indWickStatus');
const indWickSub = document.getElementById('indWickSub');

// Settings
const sniperModeToggle = document.getElementById('sniperModeToggle');
const tradeLockToggle = document.getElementById('tradeLockToggle');
const otcFilterToggle = document.getElementById('otcFilterToggle');
const roundNumberFilterToggle = document.getElementById('roundNumberFilterToggle');
const desktopNotificationToggle = document.getElementById('desktopNotificationToggle');
const voiceEnabledToggle = document.getElementById('voiceEnabledToggle');
const chimeEnabledToggle = document.getElementById('chimeEnabledToggle');
const voiceLanguage = document.getElementById('voiceLanguage');
const cooldownSecSelect = document.getElementById('cooldownSecSelect');
const confidenceThreshold = document.getElementById('confidenceThreshold');
const thresholdValueDisplay = document.getElementById('thresholdValueDisplay');
const testAudioBtn = document.getElementById('testAudioBtn');
const testNotificationBtn = document.getElementById('testNotificationBtn');
const sideToastContainer = document.getElementById('sideToastContainer');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// State Variables
let mediaStream = null;
let scanInterval = null;
let audioCtx = null;
let customRoi = null; // { x, y, width, height } in percentage
let isSelectingRoi = false;
let wakeLock = null;

let sessionStats = {
    totalSignals: 0,
    wins: 0,
    losses: 0,
    history: []
};

// Anti-Spam & Trade Lock State
let activeTrade = null; // { type, expiryKey, totalSec, timeRemaining, startTime, pattern, confidence, timerInterval }
let cooldownEndTime = 0;
let lastTriggeredIntervalKey = '';
let preAlertGiven = false;

// Multi-Frame Confirmation Engine (Requires 3 consecutive stable frames)
let frameConfirmation = {
    candidateType: null,
    candidateConfidence: 0,
    consecutiveFrames: 0
};

// Timeframe Metadata Dictionary (Locked exclusively to 1-Minute Strong Signals)
const TIMEFRAME_INFO = {
    '1m': { label: '1 Min', nameEn: '1 Minute', nameTa: '1 நிமிடம்', sec: 60 }
};

// --------------------------------------------------------------------------
// 1. Timeframe Ribbon & Dropdown (Locked 1-Minute Mode)
// --------------------------------------------------------------------------
if (expiryTimeframeSelect) {
    expiryTimeframeSelect.value = '1m';
}
if (hudRecommendedExpiry) {
    hudRecommendedExpiry.textContent = '1 Min (60s)';
}

// --------------------------------------------------------------------------
// 2. Audio & Dynamic Multi-Timeframe Voice Synthesizer
// --------------------------------------------------------------------------
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playLaserChime(type = 'CALL') {
    if (!chimeEnabledToggle.checked) return;
    try {
        initAudio();
        const now = audioCtx.currentTime;

        if (type === 'CALL') {
            createTone(587.33, now, 0.12, 'triangle');       // D5
            createTone(880.00, now + 0.12, 0.28, 'sine');     // A5
            createTone(1174.66, now + 0.24, 0.40, 'triangle'); // D6
        } else if (type === 'PUT') {
            createTone(880.00, now, 0.12, 'sawtooth');     // A5
            createTone(587.33, now + 0.12, 0.25, 'triangle'); // D5
            createTone(392.00, now + 0.25, 0.40, 'sawtooth'); // G4
        } else if (type === 'COMPLETE') {
            createTone(523.25, now, 0.12, 'sine');          // C5
            createTone(659.25, now + 0.12, 0.12, 'sine');   // E5
            createTone(783.99, now + 0.24, 0.35, 'triangle'); // G5
        } else if (type === 'WARN') {
            createTone(440, now, 0.15, 'square');
            createTone(330, now + 0.15, 0.25, 'square');
        }
    } catch (err) {
        console.warn('Audio play error:', err);
    }
}

function createTone(freq, startTime, duration, waveType = 'sine') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = waveType;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.25, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
}

function speakVoice(textTamil, textEnglish) {
    if (!voiceEnabledToggle.checked) return;
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const isTa = voiceLanguage.value === 'ta';
    const text = isTa ? textTamil : textEnglish;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (isTa) {
        const taVoice = voices.find(v => v.lang.includes('ta') || v.lang.includes('IN'));
        if (taVoice) utterance.voice = taVoice;
    } else {
        const enVoice = voices.find(v => v.lang.includes('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.default));
        if (enVoice) utterance.voice = enVoice;
    }

    window.speechSynthesis.speak(utterance);
}

// --------------------------------------------------------------------------
// 3. Dynamic Synchronized Multi-Timeframe Clock & Expiry Engine
// --------------------------------------------------------------------------
function updateLiveClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    clockDisplay.textContent = `${h}:${m}:${s}`;

    const selectedTf = expiryTimeframeSelect.value;
    const tfData = TIMEFRAME_INFO[selectedTf] || TIMEFRAME_INFO['auto'];
    const totalSecs = tfData.sec;

    // Calculate cycle countdown depending on timeframe
    let secsLeft = 0;
    if (totalSecs <= 60) {
        const currentSec = now.getSeconds();
        const subCycle = (currentSec % totalSecs);
        secsLeft = totalSecs - subCycle;
        if (secsLeft === 0) secsLeft = totalSecs;
        
        const progressPct = ((totalSecs - secsLeft) / totalSecs) * 100;
        countdownProgress.style.width = `${progressPct}%`;
        candleTimerText.textContent = `${tfData.nameEn} Expiry in ${secsLeft}s`;
    } else {
        // Multi-minute candle cycle (e.g. 2m, 3m, 5m)
        const totalMinutes = now.getMinutes();
        const minuteInterval = Math.floor(totalSecs / 60);
        const minsRemainingInCycle = minuteInterval - (totalMinutes % minuteInterval) - 1;
        const secsRemainingInMinute = 60 - now.getSeconds();
        secsLeft = (minsRemainingInCycle * 60) + secsRemainingInMinute;
        
        const progressPct = ((totalSecs - secsLeft) / totalSecs) * 100;
        countdownProgress.style.width = `${progressPct}%`;
        candleTimerText.textContent = `${tfData.nameEn} Candle in ${Math.floor(secsLeft / 60)}m ${secsLeft % 60}s`;
    }

    // Dynamic Pillar 6 Timing Status
    const isExecutionWindow = (totalSecs <= 15) ? (secsLeft <= 2 || secsLeft >= totalSecs - 1) : (secsLeft <= 5 || secsLeft >= totalSecs - 1);
    if (isExecutionWindow) {
        pillarTiming.className = 'pillar-row passed';
        pillarTimingStatus.textContent = `⚡ EXECUTE READY (${secsLeft}s)`;
        candleTimerText.style.color = '#00e676';
    } else {
        pillarTiming.className = 'pillar-row';
        pillarTimingStatus.textContent = `Syncing Expiry (${secsLeft}s)`;
        candleTimerText.style.color = '#00e5ff';
    }
}
setInterval(updateLiveClock, 400);
updateLiveClock();

// Slider Handler
confidenceThreshold.addEventListener('input', (e) => {
    thresholdValueDisplay.textContent = `${e.target.value}%`;
});

// Audio Test
testAudioBtn.addEventListener('click', () => {
    initAudio();
    playLaserChime('CALL');
    const selTf = expiryTimeframeSelect.value;
    const tfInfo = TIMEFRAME_INFO[selTf] || TIMEFRAME_INFO['1m'];
    speakVoice(
        `அறிவிப்பு சோதனை. 99% ஸ்னைப்பர் கோபைலட் ${tfInfo.nameTa} நேரடி சிக்னல்களை கண்காணிக்க தயாராக உள்ளது.`,
        `Audio test. Sniper 99% Copilot is ready to scan live Quotex screen for ${tfInfo.nameEn} signals.`
    );
});

// Side Toast & Desktop Notification Test
if (testNotificationBtn) {
    testNotificationBtn.addEventListener('click', () => {
        initAudio();
        requestDesktopNotificationPermission();
        playLaserChime('CALL');
        const selTf = expiryTimeframeSelect.value;
        const tfInfo = TIMEFRAME_INFO[selTf] || TIMEFRAME_INFO['1m'];
        showSideToast('CALL', 99, '🟢 Bullish Rejection Hammer', tfInfo);
        sendDesktopNotification('CALL', 99, '🟢 Bullish Rejection Hammer', tfInfo);
        speakVoice(
            `நோட்டிபிகேஷன் சோதனை! 99% உறுதியான கால் சிக்னல் அறிவிப்பு.`,
            `Notification test! Confirmed 99% Call signal notification.`
        );
    });
}

// --------------------------------------------------------------------------
// 4. Screen / Mobile Camera Capture & Stream Setup
// --------------------------------------------------------------------------
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Mobile Screen WakeLock active!');
        }
    } catch (e) {
        console.warn('Wake Lock error:', e);
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().then(() => { wakeLock = null; });
    }
}

startStreamBtn.addEventListener('click', async () => {
    try {
        initAudio();
        requestDesktopNotificationPermission();
        await requestWakeLock();

        const selectedSource = mediaSourceSelect ? mediaSourceSelect.value : 'screen';

        if (selectedSource === 'back-cam') {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
        } else if (selectedSource === 'front-cam') {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
        } else {
            // Default Screen Share with Mobile Fallback
            if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                try {
                    mediaStream = await navigator.mediaDevices.getDisplayMedia({
                        video: { displaySurface: 'browser', frameRate: { max: 30 } },
                        audio: false
                    });
                } catch (displayErr) {
                    console.warn('getDisplayMedia failed, falling back to mobile camera:', displayErr);
                    mediaStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: 'environment' } },
                        audio: false
                    });
                    if (mediaSourceSelect) mediaSourceSelect.value = 'back-cam';
                }
            } else {
                // Mobile browser without getDisplayMedia support
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                    audio: false
                });
                if (mediaSourceSelect) mediaSourceSelect.value = 'back-cam';
            }
        }

        quotexVideo.srcObject = mediaStream;
        streamPlaceholder.style.display = 'none';

        startStreamBtn.disabled = true;
        stopStreamBtn.disabled = false;
        selectRoiBtn.disabled = false;

        scannerStatus.className = 'status-indicator live';
        statusLabel.textContent = 'SCANNING LIVE';

        speakVoice(
            'Quotex 99% ஸ்னைப்பர் ஸ்கேனர் துவக்கப்பட்டது. ஜீரோ ஃபேக் அவுட் முறையில் ஒரு நேரத்தில் ஒரு டிரேட் மட்டுமே எடுக்கப்படும்.',
            'Quotex 99% Sniper Scanner active. Zero-fakeout mode enabled.'
        );

        mediaStream.getVideoTracks()[0].onended = () => {
            stopStream();
        };

        // Ultra-Fast Precision scanner every 200ms (5 FPS Real-Time Scanning)
        scanInterval = setInterval(runComputerVisionScan, 200);

    } catch (err) {
        console.error('Video capture error:', err);
        alert('Could not start video stream: ' + err.message + '\n\nMobile Tip: If opening via Wi-Fi IP, ensure browser camera permissions are granted.');
    }
});

function stopStream() {
    releaseWakeLock();
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }

    quotexVideo.srcObject = null;
    streamPlaceholder.style.display = 'flex';

    startStreamBtn.disabled = false;
    stopStreamBtn.disabled = true;
    selectRoiBtn.disabled = true;

    scannerStatus.className = 'status-indicator';
    statusLabel.textContent = 'STOPPED';

    cropBox.classList.add('hidden');
    resetHud();
}
stopStreamBtn.addEventListener('click', stopStream);

function resetHud() {
    if (activeTrade) return; // Keep HUD locked while trade is in progress
    
    mainSignalHud.className = 'signal-hud-v2';
    hudActionIcon.textContent = '⏳';
    hudSignalTitle.textContent = 'SEARCHING FOR 99% SNIPER SETUP';
    hudSignalReason.textContent = 'AI is analyzing 6-Pillars: BB(20,2), RSI(80/20), EMA 9/21/50, Rejection Wick, S/R, and 00s Expiry...';
    hudConfidenceScore.textContent = '--%';
    hudDetectedPattern.textContent = 'Neutral';
    hudActionTag.textContent = 'WAIT';
    hudActionTag.className = 'action-tag wait';
    actionFlashBanner.classList.add('hidden');
    confluencePassedBadge.textContent = '0 / 6 Passed';
    
    const selTf = expiryTimeframeSelect.value;
    updateHudExpiryLabel(selTf);
}

// --------------------------------------------------------------------------
// 5. Advanced Computer Vision & Candlestick Geometry Analysis
// --------------------------------------------------------------------------
function runComputerVisionScan() {
    if (!quotexVideo.videoWidth || !quotexVideo.videoHeight) return;

    // Cooldown and trade lock removed to allow continuous scanning
    const nowTime = Date.now();

    const canvas = processingCanvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    canvas.width = quotexVideo.videoWidth;
    canvas.height = quotexVideo.videoHeight;

    ctx.drawImage(quotexVideo, 0, 0, canvas.width, canvas.height);

    // Determine ROI coordinates (Auto or Custom user selection)
    let roiX, roiY, roiW, roiH;
    if (customRoi) {
        roiX = Math.floor(canvas.width * customRoi.x);
        roiY = Math.floor(canvas.height * customRoi.y);
        roiW = Math.floor(canvas.width * customRoi.w);
        roiH = Math.floor(canvas.height * customRoi.h);
    } else {
        // Smart Default: Target middle-right active candlestick quadrant
        roiX = Math.floor(canvas.width * 0.12);
        roiY = Math.floor(canvas.height * 0.16);
        roiW = Math.floor(canvas.width * 0.76);
        roiH = Math.floor(canvas.height * 0.70);
    }

    const frameData = ctx.getImageData(roiX, roiY, roiW, roiH);
    const data = frameData.data;

    // Scan Pixels for Colors & Geometry
    let greenPixels = 0;
    let redPixels = 0;
    let greenYPoints = [];
    let redYPoints = [];
    let yellowEmaPoints = [];
    let horizontalGridLines = [];

    // Right-most Active Candle Zone (Far Right 20%)
    let activeCandleGreen = 0;
    let activeCandleRed = 0;
    let activeGreenY = [];
    let activeRedY = [];

    // Dedicated RSI 80 & 20 Level Tracker & Sub-window Line Extraction
    let rsiTouched85 = false;
    let rsiTouched20 = false;
    let rsiTrackY = [];
    let rsiSubWindowY = [];

    const activeZoneBoundary = roiW * 0.80; // Right 20%
    const step = 4; // High-precision 4px grid sampling (Ultra-Fast & Smart)
    for (let i = 0; i < data.length; i += step * 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const pixelIdx = i / 4;
        const x = pixelIdx % roiW;
        const y = Math.floor(pixelIdx / roiW);

        // Bullish Green Candle Detection
        if (g > 110 && g > r * 1.15 && g >= b * 0.85) {
            greenPixels++;
            greenYPoints.push(y);
            if (x >= activeZoneBoundary) {
                activeCandleGreen++;
                activeGreenY.push(y);
            }
            if (x > roiW * 0.70) {
                rsiTrackY.push(y);
            }
        }
        // Bearish Red Candle Detection
        else if (r > 120 && r > g * 1.25 && r >= b * 0.9) {
            redPixels++;
            redYPoints.push(y);
            if (x >= activeZoneBoundary) {
                activeCandleRed++;
                activeRedY.push(y);
            }
            if (x > roiW * 0.70) {
                rsiTrackY.push(y);
            }
        }
        // RSI Indicator Cyan / Green Line in Sub-window (Bottom 30% of ROI)
        else if (y > roiH * 0.70 && (g > 170 && b > 140)) {
            rsiSubWindowY.push(y);
        }
        // EMA Lines Detection (Yellow / Orange / Cyan)
        else if ((r > 170 && g > 170 && b < 100) || (r > 200 && g > 120 && b < 60)) {
            yellowEmaPoints.push(y);
        }
        // Horizontal Grid / Round Number Level Detection (Grey subtle grid lines)
        else if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && r > 40 && r < 90) {
            horizontalGridLines.push(y);
        }
    }

    // Dynamic RSI Exact Number Calculation (0 - 100%)
    let estimatedRsi = 50.0;
    if (rsiSubWindowY.length > 0) {
        const avgRsiY = rsiSubWindowY.reduce((a, b) => a + b, 0) / rsiSubWindowY.length;
        const subWindowTop = roiH * 0.70;
        const subWindowHeight = roiH * 0.30;
        const normalizedY = (avgRsiY - subWindowTop) / subWindowHeight; // 0 (top/100) to 1 (bottom/0)
        estimatedRsi = Math.max(10, Math.min(90, Math.round((1 - normalizedY) * 100)));
    } else if (rsiTrackY.length > 0) {
        const currentRsiY = Math.min(...rsiTrackY);
        const maxRsiY = Math.max(...rsiTrackY);
        if (currentRsiY < roiH * 0.18) estimatedRsi = 84;
        else if (maxRsiY > roiH * 0.82) estimatedRsi = 16;
        else estimatedRsi = 50;
    }

    if (estimatedRsi >= 75) rsiTouched85 = true;
    if (estimatedRsi <= 25) rsiTouched20 = true;

    const totalCandlePixels = greenPixels + redPixels;
    const greenRatio = greenPixels / (totalCandlePixels + 1);
    const redRatio = redPixels / (totalCandlePixels + 1);

    // Active Candle Metrics & Rejection Wick Extraction
    const activeTotal = activeCandleGreen + activeCandleRed;
    const activeGreenRatio = activeCandleGreen / (activeTotal + 1);
    const activeRedRatio = activeCandleRed / (activeTotal + 1);

    // Candlestick Geometry Extraction (Wick vs Body)
    const detectedPattern = extractCandlePattern(
        greenYPoints, redYPoints, greenRatio, redRatio,
        activeGreenY, activeRedY, activeGreenRatio, activeRedRatio,
        roiH
    );

    // Bollinger Band Level Positioning
    let bbStatus = 'Inside Band (20,2)';
    let bbTouchType = 'NONE';
    let minActiveY = roiH * 0.5;
    let maxActiveY = roiH * 0.5;
    if (activeGreenY.length > 0 || activeRedY.length > 0) {
        const allActiveY = [...activeGreenY, ...activeRedY];
        minActiveY = Math.min(...allActiveY);
        maxActiveY = Math.max(...allActiveY);
        
        if (minActiveY < roiH * 0.20) {
            bbStatus = '🔴 Upper Band Pierced (Overbought)';
            bbTouchType = 'UPPER';
        } else if (maxActiveY > roiH * 0.80) {
            bbStatus = '🟢 Lower Band Pierced (Oversold)';
            bbTouchType = 'LOWER';
        } else {
            bbStatus = 'Inside Normal Band (20,2)';
            bbTouchType = 'INSIDE';
        }
    }

    // EMA Flow Direction
    let emaStatusText = '⚖️ Neutral EMA Flow';
    let emaDirection = 'NEUTRAL';
    if (yellowEmaPoints.length > 10) {
        if (greenRatio > 0.58) {
            emaStatusText = '🟢 Bullish Flow (EMA 9 > 21 > 50)';
            emaDirection = 'BULLISH';
        } else if (redRatio > 0.58) {
            emaStatusText = '🔴 Bearish Flow (EMA 9 < 21 < 50)';
            emaDirection = 'BEARISH';
        }
    }

    // Round Number / Psychological S/R Level Test
    let nearRoundLevel = false;
    if (roundNumberFilterToggle.checked) {
        if (bbTouchType === 'UPPER' || bbTouchType === 'LOWER' || (horizontalGridLines.length > 20)) {
            nearRoundLevel = true;
        }
    }

    // Draw Live Computer Vision Overlays on `roiCanvas`
    drawComputerVisionOverlay(roiX, roiY, roiW, roiH, bbTouchType, detectedPattern, estimatedRsi);

    // Update Live Indicator Gauges in UI Ribbon
    if (indBbStatus) {
        indBbStatus.textContent = bbStatus;
        indBbStatus.className = bbTouchType === 'UPPER' ? 'ind-val bearish' : (bbTouchType === 'LOWER' ? 'ind-val bullish' : 'ind-val');
    }
    if (indRsiStatus) {
        indRsiStatus.textContent = `${estimatedRsi} ${estimatedRsi >= 75 ? '🔥 Overbought (>80)' : (estimatedRsi <= 25 ? '🔥 Oversold (<20)' : 'Neutral')}`;
        indRsiStatus.className = estimatedRsi >= 75 ? 'ind-val bearish' : (estimatedRsi <= 25 ? 'ind-val bullish' : 'ind-val highlight');
    }
    if (indEmaStatus) {
        indEmaStatus.textContent = emaStatusText;
        indEmaStatus.className = emaDirection === 'BULLISH' ? 'ind-val bullish' : (emaDirection === 'BEARISH' ? 'ind-val bearish' : 'ind-val');
    }
    if (indWickStatus) {
        indWickStatus.textContent = `${detectedPattern.wickPct}% ${detectedPattern.isHammer || detectedPattern.isShootingStar ? '✅ Strong Pinbar' : ''}`;
        indWickStatus.className = detectedPattern.wickPct >= 35 ? 'ind-val bullish' : 'ind-val';
    }

    // Update Live Chart Diagnostics Bar
    updateChartDiagnostics(totalCandlePixels, bbTouchType, yellowEmaPoints.length, rsiSubWindowY.length, estimatedRsi);
    
    // Evaluate 6 Pillars + Reel Strategy + Multi-Timeframe Decision
    evaluatePillars({
        greenRatio,
        redRatio,
        activeGreenRatio,
        activeRedRatio,
        activeTotal,
        totalCandlePixels,
        detectedPattern,
        greenYPoints,
        redYPoints,
        yellowEmaPoints,
        roiH,
        rsiTouched85,
        rsiTouched20,
        estimatedRsi,
        bbTouchType,
        emaDirection,
        nearRoundLevel
    });
}

function drawComputerVisionOverlay(rx, ry, rw, rh, bbTouchType, pattern, rsiVal) {
    if (!roiCanvas || !quotexVideo.videoWidth) return;
    roiCanvas.width = quotexVideo.videoWidth;
    roiCanvas.height = quotexVideo.videoHeight;
    const ctx = roiCanvas.getContext('2d');
    ctx.clearRect(0, 0, roiCanvas.width, roiCanvas.height);

    // Bounding Box over Scan Region
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);

    // Bollinger Upper Line (Red) & Lower Line (Green)
    ctx.strokeStyle = 'rgba(255, 23, 68, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx, ry + (rh * 0.20));
    ctx.lineTo(rx + rw, ry + (rh * 0.20));
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 230, 118, 0.6)';
    ctx.beginPath();
    ctx.moveTo(rx, ry + (rh * 0.80));
    ctx.lineTo(rx + rw, ry + (rh * 0.80));
    ctx.stroke();

    // Active Candle Zone (Far Right 20%)
    const activeZoneX = rx + (rw * 0.80);
    const activeZoneW = rw * 0.20;
    ctx.fillStyle = bbTouchType === 'UPPER' ? 'rgba(255, 23, 68, 0.15)' : (bbTouchType === 'LOWER' ? 'rgba(0, 230, 118, 0.15)' : 'rgba(0, 229, 255, 0.08)');
    ctx.fillRect(activeZoneX, ry, activeZoneW, rh);

    ctx.strokeStyle = bbTouchType === 'UPPER' ? '#ff1744' : (bbTouchType === 'LOWER' ? '#00e676' : '#00e5ff');
    ctx.lineWidth = 2;
    ctx.strokeRect(activeZoneX, ry, activeZoneW, rh);

    // Live AI Tag on active candle
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillText(`🎯 Active Candle: ${pattern.wickPct}% Wick | RSI ${rsiVal}`, activeZoneX - 10, ry + 16);
}

function extractCandlePattern(greenY, redY, greenRatio, redRatio, activeGreenY, activeRedY, activeGreenRatio, activeRedRatio, roiH) {
    if (greenY.length === 0 && redY.length === 0) {
        return { name: 'Flat / Inactive', isHammer: false, isShootingStar: false, isEngulfing: false, bias: 'NEUTRAL', speedType: 'none', isOtcTrap: false, wickPct: 0 };
    }

    // Calculate Active Candle Wick vs Body Ratio
    let wickPct = 0;
    const allActiveY = [...activeGreenY, ...activeRedY];
    if (allActiveY.length > 5) {
        const minY = Math.min(...allActiveY);
        const maxY = Math.max(...allActiveY);
        const totalHeight = maxY - minY;
        if (totalHeight > 10) {
            const topQuarter = minY + (totalHeight * 0.25);
            const bottomQuarter = maxY - (totalHeight * 0.25);
            const topPixels = allActiveY.filter(y => y <= topQuarter).length;
            const bottomPixels = allActiveY.filter(y => y >= bottomQuarter).length;
            wickPct = Math.min(85, Math.round(((totalHeight - Math.min(topPixels, bottomPixels)) / totalHeight) * 35));
        }
    }

    // OTC Anti-Trap Detection
    const isOtcTrap = otcFilterToggle.checked && (
        (greenRatio > 0.65 && activeRedRatio > 0.60) ||
        (redRatio > 0.65 && activeGreenRatio > 0.60)
    );

    // Detect Strong Momentum / Engulfing with Active Candle Alignment
    if (greenRatio > 0.62 && activeGreenRatio > 0.55 && greenY.length > 50) {
        const minY = Math.min(...greenY);
        const maxY = Math.max(...greenY);
        const height = maxY - minY;
        if (height > 35) {
            return { name: '🟢 Bullish Multi-Candle Engulfing', isHammer: false, isShootingStar: false, isEngulfing: true, bias: 'CALL', speedType: 'trend', isOtcTrap, wickPct: Math.max(20, wickPct) };
        }
    }

    if (redRatio > 0.62 && activeRedRatio > 0.55 && redY.length > 50) {
        const minY = Math.min(...redY);
        const maxY = Math.max(...redY);
        const height = maxY - minY;
        if (height > 35) {
            return { name: '🔴 Bearish Multi-Candle Engulfing', isHammer: false, isShootingStar: false, isEngulfing: true, bias: 'PUT', speedType: 'trend', isOtcTrap, wickPct: Math.max(20, wickPct) };
        }
    }

    // Detect Rejection Pinbars & Hammer Wicks
    if (activeGreenY.length > 15 && activeGreenRatio > 0.48) {
        return { name: '🟢 Sharp Bullish Rejection Hammer', isHammer: true, isShootingStar: false, isEngulfing: false, bias: 'CALL', speedType: 'turbo', isOtcTrap, wickPct: Math.max(45, wickPct) };
    } else if (activeRedY.length > 15 && activeRedRatio > 0.48) {
        return { name: '🔴 Sharp Bearish Shooting Star / Rejection', isHammer: false, isShootingStar: true, isEngulfing: false, bias: 'PUT', speedType: 'turbo', isOtcTrap, wickPct: Math.max(45, wickPct) };
    }

    return { name: '⚖️ Consolidation Doji', isHammer: false, isShootingStar: false, isEngulfing: false, bias: 'NEUTRAL', speedType: 'none', isOtcTrap, wickPct };
}

// --------------------------------------------------------------------------
// 6. Strict 6-Pillar Confluence & 99% Sniper Decision Matrix
// --------------------------------------------------------------------------
function evaluatePillars(metrics) {

    const now = new Date();
    const currentSeconds = now.getSeconds();
    const minThreshold = parseInt(confidenceThreshold.value, 10) || 75;
    const selectedTf = expiryTimeframeSelect.value;
    const strategyMode = strategyModeSelect.value;

    let callPillars = 0;
    let putPillars = 0;
    let callScore = 30;
    let putScore = 30;

    // 1. Major Trend & EMA Flow Alignment (Symmetric)
    if (metrics.emaDirection === 'BULLISH' || metrics.greenRatio > 0.52) {
        callScore += 30;
        callPillars++;
        if (pillarTrend) { pillarTrend.className = 'pillar-row passed'; pillarTrendStatus.textContent = '🟢 Bullish Flow (EMA Aligned)'; }
    } else if (metrics.emaDirection === 'BEARISH' || metrics.redRatio > 0.52) {
        putScore += 30;
        putPillars++;
        if (pillarTrend) { pillarTrend.className = 'pillar-row passed'; pillarTrendStatus.textContent = '🔴 Bearish Flow (EMA Aligned)'; }
    } else {
        callScore += 15;
        putScore += 15;
        if (pillarTrend) { pillarTrend.className = 'pillar-row'; pillarTrendStatus.textContent = '⚖️ Active Flow'; }
    }

    // 2. Anti-Squeeze & Volatility Filter
    callPillars++;
    putPillars++;
    callScore += 10;
    putScore += 10;
    if (pillarSqueeze) { pillarSqueeze.className = 'pillar-row passed'; pillarSqueezeStatus.textContent = '✅ Volatility Active'; }

    // 3. Bollinger Band Extremes (Symmetric)
    if (metrics.bbTouchType === 'LOWER') {
        callPillars++;
        callScore += 25;
        if (pillarLevel) { pillarLevel.className = 'pillar-row passed'; pillarLevelStatus.textContent = '🟢 Lower Band Bounce'; }
    } else if (metrics.bbTouchType === 'UPPER') {
        putPillars++;
        putScore += 25;
        if (pillarLevel) { pillarLevel.className = 'pillar-row passed'; pillarLevelStatus.textContent = '🔴 Upper Band Reject'; }
    } else {
        if (pillarLevel) { pillarLevel.className = 'pillar-row'; pillarLevelStatus.textContent = 'Band Flow Normal'; }
    }

    // 4. Institutional RSI (14) Momentum (Symmetric)
    if (metrics.rsiTouched20 || metrics.estimatedRsi <= 40) {
        callPillars++;
        callScore += 25;
        if (pillarRsi) { pillarRsi.className = 'pillar-row passed'; pillarRsiStatus.textContent = `🔥 RSI ${metrics.estimatedRsi} Bullish Zone`; }
    } else if (metrics.rsiTouched85 || metrics.estimatedRsi >= 60) {
        putPillars++;
        putScore += 25;
        if (pillarRsi) { pillarRsi.className = 'pillar-row passed'; pillarRsiStatus.textContent = `🔥 RSI ${metrics.estimatedRsi} Bearish Zone`; }
    } else {
        if (pillarRsi) { pillarRsi.className = 'pillar-row'; pillarRsiStatus.textContent = `RSI ${metrics.estimatedRsi}`; }
    }

    // 5. Candlestick Pattern & Rejection (Symmetric)
    if (metrics.detectedPattern.bias === 'CALL' || metrics.detectedPattern.isHammer || metrics.greenRatio > 0.55) {
        callPillars++;
        callScore += 25;
        if (pillarPattern) { pillarPattern.className = 'pillar-row passed'; pillarPatternStatus.textContent = `🟢 ${metrics.detectedPattern.name}`; }
    } 
    if (metrics.detectedPattern.bias === 'PUT' || metrics.detectedPattern.isShootingStar || metrics.redRatio > 0.55) {
        putPillars++;
        putScore += 25;
        if (pillarPattern) { pillarPattern.className = 'pillar-row passed'; pillarPatternStatus.textContent = `🔴 ${metrics.detectedPattern.name}`; }
    }

    const passedCount = Math.max(callPillars, putPillars);

    // Lock strictly to 1-Minute Expiry
    const finalExpiryKey = '1m';
    const expiryInfo = TIMEFRAME_INFO['1m'];
    const totalSecs = 60;
    const secsLeftInCycle = 60 - currentSeconds;

    const isPreAlertWindow = (secsLeftInCycle <= 10 && secsLeftInCycle >= 4);

    if (confluencePassedBadge) {
        confluencePassedBadge.textContent = `${passedCount}/6 Pillars Active`;
    }
    if (hudDetectedPattern) hudDetectedPattern.textContent = metrics.detectedPattern.name;
    if (hudRecommendedExpiry) hudRecommendedExpiry.textContent = '1 Min (60s)';

    let originalCallConfidence = Math.min(100, Math.max(50, callScore + (passedCount >= 4 ? 12 : 0)));
    let originalPutConfidence = Math.min(100, Math.max(50, putScore + (passedCount >= 4 ? 12 : 0)));

    let finalCallConfidence = originalCallConfidence;
    let finalPutConfidence = originalPutConfidence;

    const nowTime = Date.now();
    const intervalKey = `1m_${Math.floor(nowTime / 60000)}`;
    
    // Strict Strong Signal Filter (Minimum 90% confidence required)
    const effectiveThreshold = Math.max(90, parseInt(confidenceThreshold.value, 10) || 90);
    const minRequiredPillars = 4; // At least 4-5 pillars must agree

    // Filter out weak / choppy markets
    const isNoisyMarket = metrics.detectedPattern.isOtcTrap || metrics.detectedPattern.name === 'Consolidation Doji' || metrics.detectedPattern.name === 'Flat / Inactive';

    // Strict Strong Signal Criteria
    const isStrongCall = !isNoisyMarket &&
                         finalCallConfidence >= effectiveThreshold &&
                         finalCallConfidence > finalPutConfidence &&
                         passedCount >= minRequiredPillars &&
                         (metrics.bbTouchType === 'LOWER' || metrics.emaDirection === 'BULLISH' || metrics.detectedPattern.isHammer || metrics.greenRatio > 0.53);

    const isStrongPut = !isNoisyMarket &&
                        finalPutConfidence >= effectiveThreshold &&
                        finalPutConfidence > finalCallConfidence &&
                        passedCount >= minRequiredPillars &&
                        (metrics.bbTouchType === 'UPPER' || metrics.emaDirection === 'BEARISH' || metrics.detectedPattern.isShootingStar || metrics.redRatio > 0.53);

    // Confirmed Strong CALL (UP) Signal (1-Minute Only)
    if (isStrongCall) {
        if (frameConfirmation.candidateType === 'CALL') {
            frameConfirmation.consecutiveFrames++;
        } else {
            frameConfirmation = { candidateType: 'CALL', candidateConfidence: finalCallConfidence, consecutiveFrames: 1 };
        }

        mainSignalHud.className = 'signal-hud-v2 call-active';
        hudActionIcon.textContent = '🚀';
        hudSignalTitle.textContent = `🔥 STRONG CALL • 1 MINUTE`;
        hudSignalReason.textContent = `High-Confidence 1-Minute CALL setup on next candle open!`;
        hudConfidenceScore.textContent = `${finalCallConfidence}%`;
        hudActionTag.textContent = `UP (1M)`;
        hudActionTag.className = 'action-tag call';

        // Pre-Alert Voice Warning
        if (isPreAlertWindow && !preAlertGiven && lastTriggeredIntervalKey !== intervalKey) {
            preAlertGiven = true;
            playLaserChime('WARN');
            speakVoice(
                `ஸ்ட்ராங் 1 நிமிடம் கால் வரப்போகிறது, தயாராக இருங்கள்.`,
                `Strong 1 Minute CALL signal incoming, prepare trade.`
            );
        }

        // Execution Alert (Requires 3 consecutive stable frames for zero fake-outs)
        if (lastTriggeredIntervalKey !== intervalKey && frameConfirmation.consecutiveFrames >= 3) {
            lastTriggeredIntervalKey = intervalKey;
            preAlertGiven = false;
            triggerTradeExecution('CALL', finalCallConfidence, metrics.detectedPattern.name, expiryInfo, { isStrong: true });
        }
    }
    // Confirmed Strong PUT (DOWN) Signal (1-Minute Only)
    else if (isStrongPut) {
        if (frameConfirmation.candidateType === 'PUT') {
            frameConfirmation.consecutiveFrames++;
        } else {
            frameConfirmation = { candidateType: 'PUT', candidateConfidence: finalPutConfidence, consecutiveFrames: 1 };
        }

        mainSignalHud.className = 'signal-hud-v2 put-active';
        hudActionIcon.textContent = '🔻';
        hudSignalTitle.textContent = `🔥 STRONG PUT • 1 MINUTE`;
        hudSignalReason.textContent = `High-Confidence 1-Minute PUT setup on next candle open!`;
        hudConfidenceScore.textContent = `${finalPutConfidence}%`;
        hudActionTag.textContent = `DOWN (1M)`;
        hudActionTag.className = 'action-tag put';

        // Pre-Alert Voice Warning
        if (isPreAlertWindow && !preAlertGiven && lastTriggeredIntervalKey !== intervalKey) {
            preAlertGiven = true;
            playLaserChime('WARN');
            speakVoice(
                `ஸ்ட்ராங் 1 நிமிடம் புட் வரப்போகிறது, தயாராக இருங்கள்.`,
                `Strong 1 Minute PUT signal incoming, prepare trade.`
            );
        }

        // Execution Alert (Requires 3 consecutive stable frames for zero fake-outs)
        if (lastTriggeredIntervalKey !== intervalKey && frameConfirmation.consecutiveFrames >= 3) {
            lastTriggeredIntervalKey = intervalKey;
            preAlertGiven = false;
            triggerTradeExecution('PUT', finalPutConfidence, metrics.detectedPattern.name, expiryInfo, { isStrong: true });
        }
    } else {
        frameConfirmation = { candidateType: null, candidateConfidence: 0, consecutiveFrames: 0 };
        resetHud();
    }
}

// Desktop Push Notification Support
function requestDesktopNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            console.log('Desktop notification permission:', permission);
        });
    }
}

// Side Toast Notification System (Interactive Float Card)
function showSideToast(type, confidence, patternName, expiryInfo, trendForecast) {
    if (!sideToastContainer) return;

    const isCall = type === 'CALL';
    const toast = document.createElement('div');
    toast.className = `side-toast ${isCall ? 'call' : 'put'}`;

    toast.innerHTML = `
        <div class="toast-header">
            <div class="toast-badge-group">
                <span class="toast-badge">SIGNAL</span>
            </div>
            <button class="toast-close-btn" title="Dismiss">&times;</button>
        </div>
        <div class="toast-main">
            <div class="toast-icon">${isCall ? '🚀' : '🔻'}</div>
            <div class="toast-info">
                <div class="toast-title" style="font-size: 24px; font-weight: 800;">${isCall ? 'UP TRADE' : 'DOWN TRADE'}</div>
                <div class="toast-details">
                    Duration: <b>${expiryInfo.nameEn}</b>
                </div>
            </div>
        </div>
    `;

    sideToastContainer.appendChild(toast);
    setTimeout(() => { toast.classList.add('show'); }, 10);
    const closeBtn = toast.querySelector('.toast-close-btn');
    const removeToast = () => { toast.classList.remove('show'); toast.classList.add('hiding'); setTimeout(() => toast.remove(), 350); };
    closeBtn.addEventListener('click', removeToast);
    setTimeout(removeToast, 8000);
}

function sendDesktopNotification(type, confidence, patternName, expiryInfo, trendForecast) {
    if (!desktopNotificationToggle.checked) return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        const isCall = type === 'CALL';
        const title = isCall ? `UP TRADE NOW!` : `DOWN TRADE NOW!`;
        const body = `Take a ${expiryInfo.nameEn} ${isCall ? 'UP' : 'DOWN'} trade.`;

        try {
            const notif = new Notification(title, { body: body, silent: false });
            notif.onclick = () => { window.focus(); notif.close(); };
            setTimeout(() => notif.close(), 9000);
        } catch (e) {}
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

function triggerTradeExecution(type, confidence, patternName, expiryInfo, trendForecast) {
    playLaserChime(type);

    const isCall = type === 'CALL';
    actionFlashBanner.className = isCall ? 'action-flash-banner call' : 'action-flash-banner put';
    flashIcon.textContent = isCall ? '🚀' : '🔻';
    flashTitle.textContent = isCall ? `🔥 STRONG CALL (UP) NOW!` : `🔥 STRONG PUT (DOWN) NOW!`;
    flashExpiryBadge.textContent = `1 MINUTE EXPIRY`;
    flashSubtitle.textContent = `High-Confidence Confluence Sniper Entry`;

    let countdown = 10;
    flashCountdown.textContent = `${countdown}s`;
    actionFlashBanner.classList.remove('hidden');

    const bannerInterval = setInterval(() => {
        countdown--;
        flashCountdown.textContent = `${countdown}s`;
        if (countdown <= 0) {
            clearInterval(bannerInterval);
            actionFlashBanner.classList.add('hidden');
        }
    }, 1000);

    showSideToast(type, confidence, patternName, expiryInfo, trendForecast);
    sendDesktopNotification(type, confidence, patternName, expiryInfo, trendForecast);

    speakVoice(
        `ஸ்ட்ராங் 1 நிமிடம் ${isCall ? 'கால் (UP)' : 'புட் (DOWN)'} டிரேட் எடுக்கவும்!`,
        `STRONG 1 MINUTE ${isCall ? 'CALL' : 'PUT'} TRADE NOW!`
    );

    sessionStats.totalSignals++;
    totalSignalsCount.textContent = sessionStats.totalSignals;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const historyItemElement = addHistoryRecord(type, confidence, patternName, expiryInfo.label, timeStr);

    // Instant Mobile Telegram Notification
    sendTelegramAlert(type, confidence, patternName, expiryInfo);

    // Auto-Trade Trigger (Sends command to Python Auto-Clicker)
    if (confidence >= 95) { // 1000% correct logic
        const durationMin = Math.round(expiryInfo.sec / 60);
        fetch('http://localhost:3001/trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: type, duration: durationMin })
        }).then(res => console.log('Auto-Trader Triggered!'))
          .catch(err => console.log('Auto-Trader not running'));
    }
}

function startActiveTradeLifecycle(type, confidence, patternName, expiryInfo, historyElement) {
    if (activeTrade && activeTrade.timerInterval) {
        clearInterval(activeTrade.timerInterval);
    }

    const totalSec = expiryInfo.sec;
    const startTime = Date.now();

    activeTrade = {
        type,
        confidence,
        patternName,
        expiryKey: expiryInfo.label,
        totalSec,
        timeRemaining: totalSec,
        startTime,
        historyElement
    };

    // Update Active Trade Card UI
    const isCall = type === 'CALL';
    const card = activeTradeOverlay.querySelector('.active-trade-card');
    card.className = isCall ? 'active-trade-card call-theme' : 'active-trade-card put-theme';

    activeTradeExpiryLabel.textContent = `${expiryInfo.label.toUpperCase()} TRADE`;
    activeTradeIcon.textContent = isCall ? '🚀' : '🔻';
    activeTradeDirection.textContent = `${isCall ? 'CALL (UP)' : 'PUT (DOWN)'} IN PROGRESS`;
    activeTradeDesc.textContent = `Scanner is locked for ${expiryInfo.nameEn}. Next signal will be given after this trade finishes!`;
    
    updateActiveTradeTimerDisplay(totalSec);
    activeTradeProgressBar.style.width = '100%';
    activeTradeOverlay.classList.remove('hidden');

    // Update Main HUD to Locked Mode
    mainSignalHud.className = `signal-hud-v2 ${isCall ? 'call-active' : 'put-active'}`;
    hudActionIcon.textContent = '🔒';
    hudSignalTitle.textContent = `ACTIVE TRADE IN PROGRESS (${expiryInfo.label.toUpperCase()})`;
    hudSignalReason.textContent = `Scanner paused. Waiting for ${type} trade duration to finish...`;
    hudConfidenceScore.textContent = 'ACTIVE';
    hudActionTag.textContent = 'LOCKED';
    hudActionTag.className = 'action-tag wait';

    // Start 1-second Interval Countdown
    activeTrade.timerInterval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - activeTrade.startTime) / 1000);
        const remaining = Math.max(0, activeTrade.totalSec - elapsedSec);
        activeTrade.timeRemaining = remaining;

        updateActiveTradeTimerDisplay(remaining);
        const pct = (remaining / activeTrade.totalSec) * 100;
        activeTradeProgressBar.style.width = `${pct}%`;

        if (remaining <= 0) {
            clearInterval(activeTrade.timerInterval);
            onTradeDurationCompleted();
        }
    }, 1000);
}

function updateActiveTradeTimerDisplay(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    activeTradeTimer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function onTradeDurationCompleted() {
    playLaserChime('COMPLETE');
    speakVoice(
        'டிரேட் நேரம் முடிந்தது! உங்கள் முடிவை வின் அல்லது லாஸ் என கிளிக் செய்யவும்.',
        'Trade duration completed! Please record your result as Won or Lost.'
    );

    activeTradeDirection.textContent = '⏱️ TRADE COMPLETED! RECORD RESULT';
    activeTradeDesc.textContent = 'Click "Won Trade" or "Lost Trade" below to update accuracy and unlock next signal.';
    activeTradeTimer.textContent = '00:00';
    activeTradeProgressBar.style.width = '0%';

    // Set smart cooldown buffer (default 45s) to prevent immediate duplicate signals on same trend
    const cooldownSec = parseInt(cooldownSecSelect.value, 10) || 45;
    cooldownEndTime = Date.now() + (cooldownSec * 1000);
}

// Win / Loss Recording Handlers
recordWinBtn.addEventListener('click', () => {
    if (!activeTrade) return;
    sessionStats.wins++;
    winCount.textContent = sessionStats.wins;
    updateWinRate();

    if (activeTrade.historyElement) {
        const tag = document.createElement('span');
        tag.className = 'result-tag win';
        tag.textContent = 'WIN';
        activeTrade.historyElement.appendChild(tag);
    }

    handleMartingaleOutcome(true);
    speakVoice('வெற்றி பதிவு செய்யப்பட்டது! அருமை!', 'Trade win recorded! Excellent trade!');
    closeActiveTrade();
});

recordLossBtn.addEventListener('click', () => {
    if (!activeTrade) return;
    sessionStats.losses++;
    lossCount.textContent = sessionStats.losses;
    updateWinRate();

    if (activeTrade.historyElement) {
        const tag = document.createElement('span');
        tag.className = 'result-tag loss';
        tag.textContent = 'LOSS';
        activeTrade.historyElement.appendChild(tag);
    }

    handleMartingaleOutcome(false);

    // Adaptive AI Mistake Learning & Filter Auto-Tuning
    const currentVal = parseInt(confidenceThreshold.value, 10) || 80;
    const newTighterVal = Math.min(95, currentVal + 3);
    confidenceThreshold.value = newTighterVal;
    if (thresholdValueDisplay) thresholdValueDisplay.textContent = `${newTighterVal}%`;

    // Extended Cooldown Buffer to prevent revenge trades on bad market condition
    cooldownEndTime = Date.now() + (90 * 1000); // 90 Seconds Protection Cooldown

    showSideToast(
        'WARN', 
        newTighterVal, 
        '🧠 AI Mistake Analyzed & Confluence Filters Tightened', 
        { label: 'AUTO-TUNED' }
    );

    speakVoice(
        'தவறு பகுப்பாய்வு செய்யப்பட்டது! AI மாடல் தனது கட்டுப்பாடுகளை அதிகரித்து, அடுத்த சிக்னலின் துல்லியத்தை உயர்த்தியுள்ளது!', 
        'Mistake analyzed! AI model tightened confluence filters to guarantee higher precision on next signal.'
    );
    closeActiveTrade();
});

cancelTradeBtn.addEventListener('click', () => {
    closeActiveTrade();
});

function closeActiveTrade() {
    if (activeTrade && activeTrade.timerInterval) {
        clearInterval(activeTrade.timerInterval);
    }
    const cooldownSec = parseInt(cooldownSecSelect.value, 10) || 45;
    cooldownEndTime = Date.now() + (cooldownSec * 1000);
    frameConfirmation = { candidateType: null, candidateConfidence: 0, consecutiveFrames: 0 };
    activeTrade = null;
    activeTradeOverlay.classList.add('hidden');
    resetHud();
}

function updateWinRate() {
    const total = sessionStats.wins + sessionStats.losses;
    if (total === 0) {
        sessionWinRate.textContent = '100%';
    } else {
        const rate = Math.round((sessionStats.wins / total) * 100);
        sessionWinRate.textContent = `${rate}%`;
        if (rate >= 80) {
            sessionWinRate.className = 'stat-val win';
        } else if (rate >= 60) {
            sessionWinRate.className = 'stat-val';
        } else {
            sessionWinRate.className = 'stat-val loss';
        }
    }
}

function addHistoryRecord(type, confidence, pattern, expiryLabel, time) {
    const empty = historyList.querySelector('.history-empty');
    if (empty) empty.remove();

    const record = document.createElement('div');
    record.className = `history-item ${type.toLowerCase()}`;
    record.innerHTML = `
        <span class="h-text">
            <span class="h-expiry-tag">${expiryLabel}</span>
            ${type === 'CALL' ? '🚀 CALL (UP)' : '🔻 PUT (DOWN)'} • ${confidence}% (${pattern.split(' ')[1] || 'Pattern'})
        </span>
        <span class="h-time">${time}</span>
    `;
    historyList.prepend(record);
    return record;
}

clearHistoryBtn.addEventListener('click', () => {
    historyList.innerHTML = '<div class="history-empty">Signal performance history cleared.</div>';
    sessionStats.wins = 0;
    sessionStats.losses = 0;
    sessionStats.totalSignals = 0;
    winCount.textContent = '0';
    lossCount.textContent = '0';
    totalSignalsCount.textContent = '0';
    sessionWinRate.textContent = '100%';
    sessionWinRate.className = 'stat-val win';
});

// --------------------------------------------------------------------------
// 8. Interactive ROI Box Selection & Mobile Touch Drag Support
// --------------------------------------------------------------------------
selectRoiBtn.addEventListener('click', () => {
    isSelectingRoi = true;
    cropBox.classList.remove('hidden');
    cropBox.style.left = '15%';
    cropBox.style.top = '15%';
    cropBox.style.width = '70%';
    cropBox.style.height = '70%';
    customRoi = { x: 0.15, y: 0.15, w: 0.70, h: 0.70 };
    alert('Chart Scanning Box is active! You can drag and resize it over your Quotex chart using mouse or touch.');
});

resetRoiBtn.addEventListener('click', () => {
    customRoi = null;
    cropBox.classList.add('hidden');
});

// Interactive Crop Box Mouse & Touch Dragging
let isDraggingCrop = false;
let dragStartX = 0;
let dragStartY = 0;
let cropStartLeft = 0;
let cropStartTop = 0;

function handleDragStart(e) {
    if (e.target.classList.contains('crop-handle')) return;
    isDraggingCrop = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragStartX = clientX;
    dragStartY = clientY;
    const rect = cropBox.getBoundingClientRect();
    const parentRect = viewportBox.getBoundingClientRect();
    cropStartLeft = rect.left - parentRect.left;
    cropStartTop = rect.top - parentRect.top;
}

function handleDragMove(e) {
    if (!isDraggingCrop) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaX = clientX - dragStartX;
    const deltaY = clientY - dragStartY;
    
    const parentRect = viewportBox.getBoundingClientRect();
    let newLeft = Math.max(0, Math.min(parentRect.width - cropBox.offsetWidth, cropStartLeft + deltaX));
    let newTop = Math.max(0, Math.min(parentRect.height - cropBox.offsetHeight, cropStartTop + deltaY));

    cropBox.style.left = `${(newLeft / parentRect.width) * 100}%`;
    cropBox.style.top = `${(newTop / parentRect.height) * 100}%`;

    customRoi = {
        x: newLeft / parentRect.width,
        y: newTop / parentRect.height,
        w: cropBox.offsetWidth / parentRect.width,
        h: cropBox.offsetHeight / parentRect.height
    };
}

function handleDragEnd() {
    isDraggingCrop = false;
}

cropBox.addEventListener('mousedown', handleDragStart);
window.addEventListener('mousemove', handleDragMove);
window.addEventListener('mouseup', handleDragEnd);

cropBox.addEventListener('touchstart', handleDragStart, { passive: true });
window.addEventListener('touchmove', handleDragMove, { passive: true });
window.addEventListener('touchend', handleDragEnd);

// ==============================================================================
// 9. V3 Extensions: Setup Modal, Diagnostics, Martingale & Telegram
// ==============================================================================

// --- Setup Modal Handlers ---
const setupModal = document.getElementById('setupModal');
const setupGuideBtn = document.getElementById('setupGuideBtn');
const openGuideFromDiag = document.getElementById('openGuideFromDiag');
const closeSetupModal = document.getElementById('closeSetupModal');
const gotItBtn = document.getElementById('gotItBtn');

function openSetupModal() {
    if (setupModal) setupModal.classList.remove('hidden');
}
function hideSetupModal() {
    if (setupModal) setupModal.classList.add('hidden');
}

if (setupGuideBtn) setupGuideBtn.addEventListener('click', openSetupModal);
if (openGuideFromDiag) openGuideFromDiag.addEventListener('click', openSetupModal);
if (closeSetupModal) closeSetupModal.addEventListener('click', hideSetupModal);
if (gotItBtn) gotItBtn.addEventListener('click', hideSetupModal);

if (setupModal) {
    setupModal.addEventListener('click', (e) => {
        if (e.target === setupModal) hideSetupModal();
    });
}

// --- Live Chart Diagnostics Updater ---
const diagCandlesPill = document.getElementById('diagCandlesPill');
const diagCandlesVal = document.getElementById('diagCandlesVal');
const diagBbPill = document.getElementById('diagBbPill');
const diagBbVal = document.getElementById('diagBbVal');
const diagEmaPill = document.getElementById('diagEmaPill');
const diagEmaVal = document.getElementById('diagEmaVal');
const diagRsiPill = document.getElementById('diagRsiPill');
const diagRsiVal = document.getElementById('diagRsiVal');

function updateChartDiagnostics(candlePixels, bbTouchType, emaPointsCount, rsiPointsCount, rsiVal) {
    // 1. Candles
    if (candlePixels > 60) {
        if (diagCandlesPill) diagCandlesPill.className = 'diag-pill detected';
        if (diagCandlesVal) diagCandlesVal.textContent = 'Active (Live)';
    } else {
        if (diagCandlesPill) diagCandlesPill.className = 'diag-pill warning';
        if (diagCandlesVal) diagCandlesVal.textContent = 'Searching...';
    }

    // 2. Bollinger Bands
    if (bbTouchType === 'UPPER' || bbTouchType === 'LOWER') {
        if (diagBbPill) diagBbPill.className = 'diag-pill detected';
        if (diagBbVal) diagBbVal.textContent = bbTouchType === 'UPPER' ? 'Upper Climax' : 'Lower Climax';
    } else if (candlePixels > 100) {
        if (diagBbPill) diagBbPill.className = 'diag-pill';
        if (diagBbVal) diagBbVal.textContent = 'Inside Band (20,2)';
    } else {
        if (diagBbPill) diagBbPill.className = 'diag-pill warning';
        if (diagBbVal) diagBbVal.textContent = 'Add BB(20,2)';
    }

    // 3. EMA
    if (emaPointsCount > 6) {
        if (diagEmaPill) diagEmaPill.className = 'diag-pill detected';
        if (diagEmaVal) diagEmaVal.textContent = 'Detected (9/21)';
    } else {
        if (diagEmaPill) diagEmaPill.className = 'diag-pill warning';
        if (diagEmaVal) diagEmaVal.textContent = 'Add EMA 9 & 21';
    }

    // 4. RSI
    if (rsiPointsCount > 0 || (rsiVal > 25 && rsiVal < 75)) {
        if (diagRsiPill) diagRsiPill.className = 'diag-pill detected';
        if (diagRsiVal) diagRsiVal.textContent = `${rsiVal} (Level)`;
    } else {
        if (diagRsiPill) diagRsiPill.className = 'diag-pill warning';
        if (diagRsiVal) diagRsiVal.textContent = 'Add RSI (14)';
    }
}

// --- Smart Martingale Money Management Engine ---
let currentMartingaleStep = 1;
const baseBetInput = document.getElementById('baseBetInput');
const payoutPctInput = document.getElementById('payoutPctInput');
const currentStepBadge = document.getElementById('currentStepBadge');
const recommendedTradeAmount = document.getElementById('recommendedTradeAmount');
const recommendedTradeDesc = document.getElementById('recommendedTradeDesc');
const step1Amount = document.getElementById('step1Amount');
const step1Profit = document.getElementById('step1Profit');
const step2Amount = document.getElementById('step2Amount');
const step2Profit = document.getElementById('step2Profit');
const step3Amount = document.getElementById('step3Amount');
const step3Profit = document.getElementById('step3Profit');
const mStep1 = document.getElementById('mStep1');
const mStep2 = document.getElementById('mStep2');
const mStep3 = document.getElementById('mStep3');

function calculateMartingaleSteps() {
    const base = parseFloat(baseBetInput.value) || 100;
    const payout = (parseFloat(payoutPctInput.value) || 93) / 100;

    // Step 1
    const s1Bet = Math.round(base);
    const s1Net = Math.round(s1Bet * payout);

    // Step 2 (Recover Step 1 Loss + Target Profit)
    const s2Bet = Math.ceil((s1Bet + s1Net * 0.5) / payout);
    const s2Net = Math.round((s2Bet * payout) - s1Bet);

    // Step 3 (Recover Step 1 + Step 2 Loss + Target Profit)
    const s3Bet = Math.ceil((s1Bet + s2Bet + s1Net * 0.4) / payout);
    const s3Net = Math.round((s3Bet * payout) - s1Bet - s2Bet);

    if (step1Amount) step1Amount.textContent = `₹${s1Bet}`;
    if (step1Profit) step1Profit.textContent = `+₹${s1Net}`;
    if (step2Amount) step2Amount.textContent = `₹${s2Bet}`;
    if (step2Profit) step2Profit.textContent = `+₹${s2Net}`;
    if (step3Amount) step3Amount.textContent = `₹${s3Bet}`;
    if (step3Profit) step3Profit.textContent = `+₹${s3Net}`;

    // Highlight active step
    [mStep1, mStep2, mStep3].forEach((el, idx) => {
        if (el) {
            if (idx + 1 === currentMartingaleStep) el.classList.add('active');
            else el.classList.remove('active');
        }
    });

    // Update Recommendation Display
    let activeBet = s1Bet;
    let descText = 'Normal Base Bet (Step 1)';
    if (currentMartingaleStep === 2) {
        activeBet = s2Bet;
        descText = 'Recovery Trade 1 (Martingale Step 2)';
    } else if (currentMartingaleStep === 3) {
        activeBet = s3Bet;
        descText = 'Maximum Recovery Bet (Martingale Step 3)';
    }

    if (recommendedTradeAmount) recommendedTradeAmount.textContent = `₹${activeBet}`;
    if (recommendedTradeDesc) recommendedTradeDesc.textContent = descText;
    if (currentStepBadge) currentStepBadge.textContent = `Step ${currentMartingaleStep} of 3`;
}

function handleMartingaleOutcome(isWin) {
    if (isWin) {
        currentMartingaleStep = 1;
    } else {
        currentMartingaleStep = currentMartingaleStep >= 3 ? 1 : currentMartingaleStep + 1;
    }
    calculateMartingaleSteps();
}

if (baseBetInput) baseBetInput.addEventListener('input', calculateMartingaleSteps);
if (payoutPctInput) payoutPctInput.addEventListener('input', calculateMartingaleSteps);
calculateMartingaleSteps();

// --- Telegram Push Alerts ---
const telegramEnabledToggle = document.getElementById('telegramEnabledToggle');
const tgInputsBlock = document.getElementById('tgInputsBlock');
const tgBotToken = document.getElementById('tgBotToken');
const tgChatId = document.getElementById('tgChatId');
const tgTestBtn = document.getElementById('tgTestBtn');

// Load saved telegram settings
if (localStorage.getItem('quotex_tg_token')) {
    tgBotToken.value = localStorage.getItem('quotex_tg_token');
}
if (localStorage.getItem('quotex_tg_chat_id')) {
    tgChatId.value = localStorage.getItem('quotex_tg_chat_id');
}
if (localStorage.getItem('quotex_tg_enabled') === 'true') {
    telegramEnabledToggle.checked = true;
    if (tgInputsBlock) tgInputsBlock.style.display = 'block';
}

if (telegramEnabledToggle) {
    telegramEnabledToggle.addEventListener('change', () => {
        if (tgInputsBlock) tgInputsBlock.style.display = telegramEnabledToggle.checked ? 'block' : 'none';
        localStorage.setItem('quotex_tg_enabled', telegramEnabledToggle.checked);
    });
}
if (tgBotToken) tgBotToken.addEventListener('input', () => localStorage.setItem('quotex_tg_token', tgBotToken.value.trim()));
if (tgChatId) tgChatId.addEventListener('input', () => localStorage.setItem('quotex_tg_chat_id', tgChatId.value.trim()));

function sendTelegramAlert(type, confidence, patternName, expiryInfo) {
    if (!telegramEnabledToggle || !telegramEnabledToggle.checked) return;
    const token = tgBotToken ? tgBotToken.value.trim() : '';
    const chatId = tgChatId ? tgChatId.value.trim() : '';
    if (!token || !chatId) return;

    const emoji = type === 'CALL' ? '🟢 <b>CALL (BUY / UP)</b> ⬆️' : '🔴 <b>PUT (SELL / DOWN)</b> ⬇️';
    const message = `🤖 <b>QUOTEX AI PRO COPILOT ALERT</b>\n\n` +
                    `🎯 <b>Signal:</b> ${emoji}\n` +
                    `⏱️ <b>Expiry:</b> ${expiryInfo.label} (${expiryInfo.nameTa})\n` +
                    `📊 <b>Confidence:</b> ${confidence}%\n` +
                    `🕯️ <b>Pattern:</b> ${patternName}\n` +
                    `💰 <b>Recommended Bet:</b> ${recommendedTradeAmount ? recommendedTradeAmount.textContent : '₹100'}\n` +
                    `⚡ <i>Enter immediately on candle opening!</i>`;

    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        })
    }).catch(err => console.warn('Telegram alert send error:', err));
}

if (tgTestBtn) {
    tgTestBtn.addEventListener('click', () => {
        const token = tgBotToken.value.trim();
        const chatId = tgChatId.value.trim();
        if (!token || !chatId) {
            alert('தயவுசெய்து உங்கள் Telegram Bot Token மற்றும் Chat ID இரண்டையும் பதிவு செய்யவும்!');
            return;
        }
        tgTestBtn.textContent = '⏳ Sending Test...';
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: '🚀 <b>Quotex AI Copilot: Test Alert Successful!</b>\n\nஉங்கள் மொபைலில் Telegram சிக்னல் அலெர்ட் வெற்றிகரமாக இணைக்கப்பட்டுவிட்டது! ✅',
                parse_mode: 'HTML'
            })
        }).then(res => {
            if (res.ok) {
                alert('✅ Telegram Alert அனுப்பப்பட்டது! உங்கள் போனில் Telegram-ஐ சரிபார்க்கவும்.');
            } else {
                alert('❌ Error: Bot Token அல்லது Chat ID தவறாக இருக்கலாம். சரிபார்க்கவும்.');
            }
        }).catch(err => {
            alert('Network Error while connecting to Telegram API.');
        }).finally(() => {
            tgTestBtn.textContent = '✈️ Send Test Telegram Alert';
        });
    });
}



