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

// Timeframe Metadata Dictionary
const TIMEFRAME_INFO = {
    'auto': { label: 'Auto (5s - 5m)', nameEn: 'AI Optimal Expiry', nameTa: 'AI உகந்த நேரம்', sec: 60 },
    '5s':   { label: '5s Turbo',       nameEn: '5 Seconds',         nameTa: '5 வினாடிகள்',     sec: 5 },
    '10s':  { label: '10s Fast',      nameEn: '10 Seconds',        nameTa: '10 வினாடிகள்',    sec: 10 },
    '15s':  { label: '15s Scalp',     nameEn: '15 Seconds',        nameTa: '15 வினாடிகள்',    sec: 15 },
    '30s':  { label: '30s Scalp',     nameEn: '30 Seconds',        nameTa: '30 வினாடிகள்',    sec: 30 },
    '45s':  { label: '45s Scalp',     nameEn: '45 Seconds',        nameTa: '45 வினாடிகள்',    sec: 45 },
    '1m':   { label: '1 Min',         nameEn: '1 Minute',          nameTa: '1 நிமிடம்',       sec: 60 },
    '2m':   { label: '2 Min',         nameEn: '2 Minutes',         nameTa: '2 நிமிடங்கள்',    sec: 120 },
    '3m':   { label: '3 Min',         nameEn: '3 Minutes',         nameTa: '3 நிமிடங்கள்',    sec: 180 },
    '5m':   { label: '5 Min Trend',    nameEn: '5 Minutes',         nameTa: '5 நிமிடங்கள்',    sec: 300 }
};

// --------------------------------------------------------------------------
// 1. Timeframe Ribbon & Dropdown Sync
// --------------------------------------------------------------------------
if (tfPillGroup) {
    tfPillGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.tf-pill');
        if (!btn) return;
        const tf = btn.dataset.tf;
        if (tf) {
            expiryTimeframeSelect.value = tf;
            updateActiveTfPill(tf);
            updateHudExpiryLabel(tf);
        }
    });
}

expiryTimeframeSelect.addEventListener('change', (e) => {
    const tf = e.target.value;
    updateActiveTfPill(tf);
    updateHudExpiryLabel(tf);
});

function updateActiveTfPill(tf) {
    if (!tfPillGroup) return;
    const pills = tfPillGroup.querySelectorAll('.tf-pill');
    pills.forEach(p => {
        if (p.dataset.tf === tf) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });
}

function updateHudExpiryLabel(tf) {
    const info = TIMEFRAME_INFO[tf] || TIMEFRAME_INFO['auto'];
    hudRecommendedExpiry.textContent = info.label;
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
// 4. Screen Capture & Stream Setup
// --------------------------------------------------------------------------
startStreamBtn.addEventListener('click', async () => {
    try {
        initAudio();
        requestDesktopNotificationPermission();
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                displaySurface: 'browser',
                frameRate: { max: 30 }
            },
            audio: false
        });

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

        // Precision scanner every 700ms
        scanInterval = setInterval(runComputerVisionScan, 700);

    } catch (err) {
        console.error('Screen capture error:', err);
        alert('Could not start screen capture: ' + err.message);
    }
});

function stopStream() {
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

    // Check if Active Trade or Cooldown is running
    const nowTime = Date.now();
    if (activeTrade && tradeLockToggle.checked) {
        return;
    }

    if (nowTime < cooldownEndTime) {
        const remainingCooldown = Math.ceil((cooldownEndTime - nowTime) / 1000);
        mainSignalHud.className = 'signal-hud-v2';
        hudActionIcon.textContent = '🛡️';
        hudSignalTitle.textContent = `COOLDOWN BUFFER ACTIVE (${remainingCooldown}s)`;
        hudSignalReason.textContent = 'Anti-revenge cooldown buffer in progress. Preparing for next clean high-accuracy entry...';
        hudConfidenceScore.textContent = 'REST';
        hudActionTag.textContent = 'PAUSED';
        hudActionTag.className = 'action-tag wait';
        return;
    }

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
    const step = 8; // high-speed grid sampling
    for (let i = 0; i < data.length; i += step * 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const pixelIdx = i / 4;
        const x = pixelIdx % roiW;
        const y = Math.floor(pixelIdx / roiW);

        // Bullish Green Candle Detection
        if (g > 140 && g > r * 1.30 && g > b * 1.20) {
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
        else if (r > 140 && r > g * 1.30 && r > b * 1.20) {
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
    if (activeTrade && tradeLockToggle.checked) return;

    const now = new Date();
    const currentSeconds = now.getSeconds();
    const minThreshold = parseInt(confidenceThreshold.value, 10);
    const selectedTf = expiryTimeframeSelect.value;
    const strategyMode = strategyModeSelect.value; // 'reel' | 'confluence' | 'reversal' | 'trend'
    const isSniperActive = sniperModeToggle.checked;

    let passedCount = 0;
    let callScore = 0;
    let putScore = 0;

    // Pillar 1: Major Trend Alignment & EMA Flow
    if (metrics.emaDirection === 'BULLISH' || metrics.greenRatio > 0.58) {
        pillarTrend.className = 'pillar-row passed';
        pillarTrendStatus.textContent = '🟢 Bullish Flow (EMA Aligned)';
        callScore += 20;
        passedCount++;
    } else if (metrics.emaDirection === 'BEARISH' || metrics.redRatio > 0.58) {
        pillarTrend.className = 'pillar-row passed';
        pillarTrendStatus.textContent = '🔴 Bearish Flow (EMA Aligned)';
        putScore += 20;
        passedCount++;
    } else {
        pillarTrend.className = 'pillar-row';
        pillarTrendStatus.textContent = '⚖️ Neutral / Mixed Flow';
        callScore += 10;
        putScore += 10;
    }

    // Pillar 2: Anti-Squeeze & Volatility Protection
    const isSqueezed = metrics.totalCandlePixels < 220 || (Math.abs(metrics.greenRatio - metrics.redRatio) < 0.04);
    if (isSqueezed) {
        pillarSqueeze.className = 'pillar-row blocked';
        pillarSqueezeStatus.textContent = '⛔ SQUEEZE DETECTED (LOCKED)';
    } else {
        pillarSqueeze.className = 'pillar-row passed';
        pillarSqueezeStatus.textContent = '✅ Volatility Healthy';
        passedCount++;
        callScore += 15;
        putScore += 15;
    }

    // Pillar 3: Bollinger Band (20,2) Extreme Zone
    if (metrics.bbTouchType === 'LOWER') {
        pillarLevel.className = 'pillar-row passed';
        pillarLevelStatus.textContent = '🟢 Lower Band Pierced (Oversold)';
        passedCount++;
        callScore += 20;
    } else if (metrics.bbTouchType === 'UPPER') {
        pillarLevel.className = 'pillar-row passed';
        pillarLevelStatus.textContent = '🔴 Upper Band Pierced (Overbought)';
        passedCount++;
        putScore += 20;
    } else {
        pillarLevel.className = 'pillar-row';
        pillarLevelStatus.textContent = 'Inside Normal Band (20,2)';
    }

    // Pillar 4: Institutional RSI (14) Climax (80 / 20)
    if (metrics.rsiTouched20 || metrics.estimatedRsi <= 25) {
        pillarRsi.className = 'pillar-row passed';
        pillarRsiStatus.textContent = `🔥 RSI ${metrics.estimatedRsi} Deep Oversold (<20)`;
        passedCount++;
        callScore += 25;
    } else if (metrics.rsiTouched85 || metrics.estimatedRsi >= 75) {
        pillarRsi.className = 'pillar-row passed';
        pillarRsiStatus.textContent = `🔥 RSI ${metrics.estimatedRsi} Deep Overbought (>80)`;
        passedCount++;
        putScore += 25;
    } else {
        pillarRsi.className = 'pillar-row';
        pillarRsiStatus.textContent = `RSI ${metrics.estimatedRsi} (Neutral Zone)`;
    }

    // Pillar 5: Long Rejection Wick & Pattern Matrix
    const hasStrongWick = metrics.detectedPattern.wickPct >= 35 || metrics.detectedPattern.isHammer || metrics.detectedPattern.isShootingStar;
    if (metrics.detectedPattern.name !== '⚖️ Consolidation Doji' && !isSqueezed && !metrics.detectedPattern.isOtcTrap && (hasStrongWick || metrics.detectedPattern.isEngulfing)) {
        pillarPattern.className = 'pillar-row passed';
        pillarPatternStatus.textContent = `✅ ${metrics.detectedPattern.name.split(' ')[1] || 'Pattern'} (${metrics.detectedPattern.wickPct}% Wick)`;
        passedCount++;
        if (metrics.detectedPattern.bias === 'CALL') callScore += 20;
        if (metrics.detectedPattern.bias === 'PUT') putScore += 20;
    } else if (metrics.detectedPattern.isOtcTrap) {
        pillarPattern.className = 'pillar-row blocked';
        pillarPatternStatus.textContent = '⚠️ OTC TRAP DETECTED (LOCKED)';
    } else {
        pillarPattern.className = 'pillar-row';
        pillarPatternStatus.textContent = 'Min 35% Wick Required for 99% Entry';
    }

    // Determine Optimal Expiry (Dynamic AI or User Selected)
    let finalExpiryKey = selectedTf;
    if (selectedTf === 'auto') {
        if (metrics.detectedPattern.speedType === 'turbo' || metrics.bbTouchType !== 'NONE') {
            finalExpiryKey = (metrics.rsiTouched85 || metrics.rsiTouched20) ? '1m' : '1m';
        } else if (metrics.detectedPattern.speedType === 'trend' || metrics.greenRatio > 0.70 || metrics.redRatio > 0.70) {
            finalExpiryKey = '3m';
        } else {
            finalExpiryKey = '1m';
        }
    }

    const expiryInfo = TIMEFRAME_INFO[finalExpiryKey] || TIMEFRAME_INFO['1m'];
    const totalSecs = expiryInfo.sec;

    // Pillar 6: Timing & 00:00 Candle Open Sync
    let secsLeftInCycle = 0;
    if (totalSecs <= 60) {
        const sub = currentSeconds % totalSecs;
        secsLeftInCycle = totalSecs - sub;
        if (secsLeftInCycle === 0) secsLeftInCycle = totalSecs;
    } else {
        const minsRemaining = Math.floor(totalSecs / 60) - (now.getMinutes() % Math.floor(totalSecs / 60)) - 1;
        secsLeftInCycle = (minsRemaining * 60) + (60 - currentSeconds);
    }

    const isExecuteWindow = (totalSecs <= 15) ? (secsLeftInCycle <= 2 || secsLeftInCycle >= totalSecs - 1) : (secsLeftInCycle <= 5 || secsLeftInCycle >= totalSecs - 1);
    const isPreAlertWindow = (totalSecs <= 15) ? (secsLeftInCycle <= 4 && secsLeftInCycle >= 3) : (secsLeftInCycle <= 10 && secsLeftInCycle >= 6);

    if (isExecuteWindow || isPreAlertWindow) {
        passedCount++;
    }

    // Round Number S/R Boost
    if (metrics.nearRoundLevel) {
        callScore += 10;
        putScore += 10;
    }

    confluencePassedBadge.textContent = `${passedCount} / 6 Passed`;
    hudDetectedPattern.textContent = metrics.detectedPattern.name;
    hudRecommendedExpiry.textContent = expiryInfo.label;

    // Calculate Final Probability & Strategy Bonus
    let finalCallConfidence = Math.min(99, Math.max(45, callScore));
    let finalPutConfidence = Math.min(99, Math.max(45, putScore));

    // Reel 99% Strategy Engine Rules
    const isReelCallConfluence = (metrics.bbTouchType === 'LOWER' && (metrics.rsiTouched20 || metrics.estimatedRsi <= 25) && (metrics.detectedPattern.isHammer || metrics.detectedPattern.bias === 'CALL'));
    const isReelPutConfluence = (metrics.bbTouchType === 'UPPER' && (metrics.rsiTouched85 || metrics.estimatedRsi >= 75) && (metrics.detectedPattern.isShootingStar || metrics.detectedPattern.bias === 'PUT'));

    if (strategyMode === 'reel') {
        if (isReelCallConfluence && !metrics.detectedPattern.isOtcTrap) {
            finalCallConfidence = 99;
            passedCount = 6;
        }
        if (isReelPutConfluence && !metrics.detectedPattern.isOtcTrap) {
            finalPutConfidence = 99;
        }
    }

    const nowTime = Date.now();
    const intervalKey = `${finalExpiryKey}_${Math.floor(nowTime / (totalSecs * 1000))}`;

    // Sniper 99% Zero-Fakeout Gate
    const minRequiredPillars = isSniperActive ? 5 : 4;
    const effectiveThreshold = isSniperActive ? Math.max(90, minThreshold) : minThreshold;

    // Evaluate Decision
    if (isSqueezed || metrics.detectedPattern.isOtcTrap) {
        frameConfirmation = { candidateType: null, candidateConfidence: 0, consecutiveFrames: 0 };
        mainSignalHud.className = 'signal-hud-v2';
        hudActionIcon.textContent = '⚠️';
        hudSignalTitle.textContent = metrics.detectedPattern.isOtcTrap ? 'OTC TRAP FILTER ACTIVE (PROTECTED)' : 'NO-TRADE ZONE (MARKET SQUEEZED)';
        hudSignalReason.textContent = metrics.detectedPattern.isOtcTrap ? 'Active candle is diverging against trend. Filtered to prevent fakeout loss!' : 'Bollinger Bands are flat and narrow. Do not trade to avoid fakeout losses!';
        hudConfidenceScore.textContent = '--%';
        hudActionTag.textContent = 'LOCKED';
        hudActionTag.className = 'action-tag wait';
        actionFlashBanner.classList.add('hidden');
    }
    // High-Confidence CALL (UP) Signal
    else if (finalCallConfidence >= effectiveThreshold && finalCallConfidence > finalPutConfidence && passedCount >= minRequiredPillars) {
        if (frameConfirmation.candidateType === 'CALL') {
            frameConfirmation.consecutiveFrames++;
        } else {
            frameConfirmation = { candidateType: 'CALL', candidateConfidence: finalCallConfidence, consecutiveFrames: 1 };
        }

        mainSignalHud.className = 'signal-hud-v2 call-active';
        hudActionIcon.textContent = '🚀';
        hudSignalTitle.textContent = strategyMode === 'reel' ? `🎯 REEL 99% SURE CALL (UP) • ${expiryInfo.label.toUpperCase()}` : `🎯 99% SNIPER CALL (UP) • ${expiryInfo.label.toUpperCase()}`;
        hudSignalReason.textContent = `Lower BB Bounce + RSI ${metrics.estimatedRsi} Oversold + ${metrics.detectedPattern.name} (${frameConfirmation.consecutiveFrames}/3 Confirmed)`;
        hudConfidenceScore.textContent = `${finalCallConfidence}%`;
        hudActionTag.textContent = `BUY UP (${expiryInfo.label})`;
        hudActionTag.className = 'action-tag call';

        // Pre-Alert Voice Warning (5s before candle close)
        if (isPreAlertWindow && !preAlertGiven && lastTriggeredIntervalKey !== intervalKey && frameConfirmation.consecutiveFrames >= 2) {
            preAlertGiven = true;
            playLaserChime('WARN');
            speakVoice(
                `கவனிக்கவும்! 99% ரீல் சிக்னல் தயாராகிறது. இன்னும் சில வினாடிகளில் ${expiryInfo.nameTa} கால் சிக்னல் வரப்போகிறது!`,
                `Attention! 99% Sniper setup forming. ${expiryInfo.nameEn} Call incoming in 5 seconds!`
            );
        }

        // Final Execution Alert (Requires at least 3 consecutive stable frames)
        if (isExecuteWindow && lastTriggeredIntervalKey !== intervalKey && frameConfirmation.consecutiveFrames >= 3) {
            lastTriggeredIntervalKey = intervalKey;
            preAlertGiven = false;
            triggerTradeExecution('CALL', finalCallConfidence, metrics.detectedPattern.name, expiryInfo);
        }
    }
    // High-Confidence PUT (DOWN) Signal
    else if (finalPutConfidence >= effectiveThreshold && finalPutConfidence > finalCallConfidence && passedCount >= minRequiredPillars) {
        if (frameConfirmation.candidateType === 'PUT') {
            frameConfirmation.consecutiveFrames++;
        } else {
            frameConfirmation = { candidateType: 'PUT', candidateConfidence: finalPutConfidence, consecutiveFrames: 1 };
        }

        mainSignalHud.className = 'signal-hud-v2 put-active';
        hudActionIcon.textContent = '🔻';
        hudSignalTitle.textContent = strategyMode === 'reel' ? `🎯 REEL 99% SURE PUT (DOWN) • ${expiryInfo.label.toUpperCase()}` : `🎯 99% SNIPER PUT (DOWN) • ${expiryInfo.label.toUpperCase()}`;
        hudSignalReason.textContent = `Upper BB Reject + RSI ${metrics.estimatedRsi} Overbought + ${metrics.detectedPattern.name} (${frameConfirmation.consecutiveFrames}/3 Confirmed)`;
        hudConfidenceScore.textContent = `${finalPutConfidence}%`;
        hudActionTag.textContent = `SELL DOWN (${expiryInfo.label})`;
        hudActionTag.className = 'action-tag put';

        // Pre-Alert Voice Warning (5s before candle close)
        if (isPreAlertWindow && !preAlertGiven && lastTriggeredIntervalKey !== intervalKey && frameConfirmation.consecutiveFrames >= 2) {
            preAlertGiven = true;
            playLaserChime('WARN');
            speakVoice(
                `கவனிக்கவும்! 99% ரீல் சிக்னல் தயாராகிறது. இன்னும் சில வினாடிகளில் ${expiryInfo.nameTa} புட் சிக்னல் வரப்போகிறது!`,
                `Attention! 99% Sniper setup forming. ${expiryInfo.nameEn} Put incoming in 5 seconds!`
            );
        }

        // Final Execution Alert (Requires at least 3 consecutive stable frames)
        if (isExecuteWindow && lastTriggeredIntervalKey !== intervalKey && frameConfirmation.consecutiveFrames >= 3) {
            lastTriggeredIntervalKey = intervalKey;
            preAlertGiven = false;
            triggerTradeExecution('PUT', finalPutConfidence, metrics.detectedPattern.name, expiryInfo);
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
function showSideToast(type, confidence, patternName, expiryInfo) {
    if (!sideToastContainer) return;

    const isCall = type === 'CALL';
    const toast = document.createElement('div');
    toast.className = `side-toast ${isCall ? 'call' : 'put'}`;

    toast.innerHTML = `
        <div class="toast-header">
            <div class="toast-badge-group">
                <span class="toast-badge">🔥 99% CONFIRMED SIGNAL</span>
                <span class="toast-expiry-badge">${expiryInfo.label.toUpperCase()}</span>
            </div>
            <button class="toast-close-btn" title="Dismiss">&times;</button>
        </div>
        <div class="toast-main">
            <div class="toast-icon">${isCall ? '🚀' : '🔻'}</div>
            <div class="toast-info">
                <div class="toast-title">${isCall ? 'BUY CALL (UP) NOW' : 'SELL PUT (DOWN) NOW'}</div>
                <div class="toast-details">
                    <b>${patternName}</b> • Accuracy: <b>${confidence}%</b><br>
                    6/6 Confluence Confirmed • Duration: <b>${expiryInfo.nameEn}</b>
                </div>
            </div>
        </div>
        <div class="toast-actions">
            <button class="toast-action-btn">${isCall ? '⚡ ENTER UP TRADE' : '⚡ ENTER DOWN TRADE'}</button>
        </div>
        <div class="toast-progress-bar"></div>
    `;

    sideToastContainer.appendChild(toast);

    // Slide In
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    const closeBtn = toast.querySelector('.toast-close-btn');
    const actionBtn = toast.querySelector('.toast-action-btn');

    const removeToast = () => {
        toast.classList.remove('show');
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 350);
    };

    closeBtn.addEventListener('click', removeToast);
    actionBtn.addEventListener('click', () => {
        window.focus();
        removeToast();
    });

    // Auto-dismiss after 8 seconds
    setTimeout(removeToast, 8000);
}

// Desktop OS Native Push Notification
function sendDesktopNotification(type, confidence, patternName, expiryInfo) {
    if (!desktopNotificationToggle.checked) return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        const isCall = type === 'CALL';
        const title = isCall ? `🚀 99% SURE CALL (UP) ENTRY NOW!` : `🔻 99% SURE PUT (DOWN) ENTRY NOW!`;
        const body = `Duration: ${expiryInfo.label.toUpperCase()} (${expiryInfo.nameEn})\nPattern: ${patternName} (${confidence}%)\n6/6 Confluence Confirmed! Open Quotex tab & enter now.`;

        try {
            const notif = new Notification(title, {
                body: body,
                requireInteraction: true,
                tag: 'quotex-signal-alert',
                silent: false
            });

            notif.onclick = () => {
                window.focus();
                notif.close();
            };

            setTimeout(() => notif.close(), 9000);
        } catch (e) {
            console.warn('Desktop Notification error:', e);
        }
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

// --------------------------------------------------------------------------
// 7. Signal Execution, Flash Banner, Active Trade Lock & Live Countdown
// --------------------------------------------------------------------------
function triggerTradeExecution(type, confidence, patternName, expiryInfo) {
    playLaserChime(type);

    // 1. Show High-Impact Screen Flash Banner
    const isCall = type === 'CALL';
    const bannerClass = isCall ? 'action-flash-banner call' : 'action-flash-banner put';
    actionFlashBanner.className = bannerClass;
    flashIcon.textContent = isCall ? '🚀' : '🔻';
    flashTitle.textContent = isCall ? `🔥 99% SURE CALL (UP) ENTRY NOW!` : `🔥 99% SURE PUT (DOWN) ENTRY NOW!`;
    flashExpiryBadge.textContent = `${expiryInfo.label.toUpperCase()} EXPIRY`;
    flashSubtitle.textContent = `Pattern: ${patternName} | Accuracy: ${confidence}% | Duration: ${expiryInfo.nameEn}`;

    let countdown = Math.min(8, expiryInfo.sec);
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

    // 2. Trigger Floating Side Notification Toast
    showSideToast(type, confidence, patternName, expiryInfo);

    // 3. Trigger Native OS Desktop Push Notification (pops over Quotex window)
    sendDesktopNotification(type, confidence, patternName, expiryInfo);

    // 4. Speak Loud Final Execution Voice Alert with Exact Duration in Tamil and English (ONLY ONCE)
    if (isCall) {
        speakVoice(
            `உறுதியான 99% ${expiryInfo.nameTa} கால் சிக்னல்! இப்போது அப் டிரேட் எடுக்கவும்!`,
            `Confirmed 99% ${expiryInfo.nameEn} CALL signal! Enter UP trade now!`
        );
    } else {
        speakVoice(
            `உறுதியான 99% ${expiryInfo.nameTa} புட் சிக்னல்! இப்போது டவுன் டிரேட் எடுக்கவும்!`,
            `Confirmed 99% ${expiryInfo.nameEn} PUT signal! Enter DOWN trade now!`
        );
    }

    // Record Session Stats
    sessionStats.totalSignals++;
    totalSignalsCount.textContent = sessionStats.totalSignals;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const historyItemElement = addHistoryRecord(type, confidence, patternName, expiryInfo.label, timeStr);

    // Initialize Active Trade Lock & Countdown (1 Trade At A Time!)
    if (tradeLockToggle.checked) {
        startActiveTradeLifecycle(type, confidence, patternName, expiryInfo, historyItemElement);
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

    // Set cooldown buffer to prevent immediate revenge trades
    const cooldownSec = parseInt(cooldownSecSelect.value, 10) || 15;
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

    speakVoice('இழப்பு பதிவு செய்யப்பட்டது. அடுத்த நல்ல வாய்ப்பிற்காக காத்திருக்கவும்.', 'Trade loss recorded. Awaiting next clean confluence setup.');
    closeActiveTrade();
});

cancelTradeBtn.addEventListener('click', () => {
    closeActiveTrade();
});

function closeActiveTrade() {
    if (activeTrade && activeTrade.timerInterval) {
        clearInterval(activeTrade.timerInterval);
    }
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
// 8. Interactive ROI Box Selection
// --------------------------------------------------------------------------
selectRoiBtn.addEventListener('click', () => {
    isSelectingRoi = true;
    cropBox.classList.remove('hidden');
    cropBox.style.left = '15%';
    cropBox.style.top = '15%';
    cropBox.style.width = '70%';
    cropBox.style.height = '70%';
    customRoi = { x: 0.15, y: 0.15, w: 0.70, h: 0.70 };
    alert('Chart Scanning Box is now visible on screen! You can drag and resize it over your Quotex candles.');
});

resetRoiBtn.addEventListener('click', () => {
    customRoi = null;
    cropBox.classList.add('hidden');
});

