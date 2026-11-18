'use strict';

const byId = id => document.getElementById(id);
const audioToggle = byId('chimeEnabledToggle');
const audioStatus = byId('soundStatus');
const historyList = byId('historyList');
const validationStatus = byId('validationStatus');
const desktopNotificationToggle = byId('desktopNotificationsToggle');
const notificationPermissionStatus = byId('notificationPermissionStatus');

let audioContext = null;

function setSoundStatus(message) {
    if (audioStatus) audioStatus.textContent = message;
}

function initializeAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        setSoundStatus('Unavailable');
        return null;
    }
    if (!audioContext) audioContext = new AudioContextClass();
    return audioContext;
}

async function playTone(frequency, startAt, duration, waveform) {
    const context = initializeAudio();
    if (!context) return false;
    if (context.state === 'suspended') await context.resume();
    if (context.state !== 'running') return false;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.14, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration);
    return true;
}

async function playSignalSound(direction) {
    if (!audioToggle || !audioToggle.checked) return false;
    try {
        const context = initializeAudio();
        if (!context) return false;
        if (context.state === 'suspended') await context.resume();
        if (context.state !== 'running') {
            setSoundStatus('Tap to enable');
            return false;
        }
        const isUp = direction === 'UP';
        const now = context.currentTime;
        const first = playTone(isUp ? 660 : 440, now, 0.12, 'sine');
        const second = playTone(isUp ? 880 : 330, now + 0.14, 0.18, 'triangle');
        const played = await Promise.all([first, second]);
        setSoundStatus('On');
        return played.every(Boolean);
    } catch (error) {
        console.error('Browser audio notification failed:', error);
        setSoundStatus('Unavailable');
        return false;
    }
}

window.playSignalSound = playSignalSound;

function updateNotificationPermissionStatus(message) {
    if (notificationPermissionStatus) notificationPermissionStatus.textContent = message;
}

if (desktopNotificationToggle) {
    if (!('Notification' in window)) {
        desktopNotificationToggle.disabled = true;
        updateNotificationPermissionStatus('Desktop notifications are unavailable in this browser.');
    } else {
        updateNotificationPermissionStatus(`Permission: ${Notification.permission}`);
        desktopNotificationToggle.addEventListener('change', async () => {
            if (!desktopNotificationToggle.checked) {
                updateNotificationPermissionStatus('Off');
                return;
            }
            try {
                const permission = Notification.permission === 'default'
                    ? await Notification.requestPermission()
                    : Notification.permission;
                if (permission !== 'granted') {
                    desktopNotificationToggle.checked = false;
                    updateNotificationPermissionStatus(`Permission ${permission}; notifications are off.`);
                    return;
                }
                updateNotificationPermissionStatus('Permission granted; notifications on.');
            } catch (error) {
                desktopNotificationToggle.checked = false;
                updateNotificationPermissionStatus('Could not request notification permission.');
                console.error('Could not request desktop notification permission:', error);
            }
        });
    }
}

const voiceToggle = byId('voiceAlertsToggle');

function speakSignal(direction) {
    if (!voiceToggle || !voiceToggle.checked) return false;
    if (typeof window === 'undefined' || !window.speechSynthesis) return false;
    if (direction !== 'UP' && direction !== 'DOWN') return false;

    try {
        window.speechSynthesis.cancel();
        const phrase = direction === 'UP' ? 'UP SIGNAL' : 'DOWN SIGNAL';
        const utterance = new SpeechSynthesisUtterance(phrase);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = direction === 'UP' ? 1.1 : 0.9;
        window.speechSynthesis.speak(utterance);
        return true;
    } catch (err) {
        console.error('Speech synthesis failed:', err);
        return false;
    }
}

window.speakSignal = speakSignal;

const testVoiceButton = byId('testVoiceBtn');
if (testVoiceButton) {
    testVoiceButton.addEventListener('click', () => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance('UP SIGNAL');
            utterance.lang = 'en-US';
            utterance.rate = 1.0;
            utterance.pitch = 1.1;
            window.speechSynthesis.speak(utterance);
        }
    });
}

window.showLiveSignalNotification = analysis => {
    if (!desktopNotificationToggle || !desktopNotificationToggle.checked ||
        !('Notification' in window) || Notification.permission !== 'granted') return false;
    try {
        new Notification(`${analysis.direction} — Quotex Chart Signal`, {
            body: `${analysis.explanation || 'Signal detected.'}`,
            tag: `live-signal-${analysis.id}`
        });
        return true;
    } catch (error) {
        console.error('Desktop notification failed:', error);
        return false;
    }
};

window.showScreenshotNotification = analysis => {
    if (!desktopNotificationToggle || !desktopNotificationToggle.checked ||
        !('Notification' in window) || Notification.permission !== 'granted') return false;
    try {
        new Notification(`${analysis.direction} — Screenshot chart analysis`, {
            body: `${analysis.explanation} Not validated.`,
            tag: `screenshot-analysis-${analysis.id}`
        });
        return true;
    } catch (error) {
        console.error('Desktop notification failed:', error);
        updateNotificationPermissionStatus('Notification could not be displayed.');
        return false;
    }
};

if (audioToggle) {
    audioToggle.addEventListener('change', async () => {
        setSoundStatus(audioToggle.checked ? 'On' : 'Off');
        if (!audioToggle.checked) return;
        try {
            const context = initializeAudio();
            if (context && context.state === 'suspended') await context.resume();
            if (context && context.state !== 'running') setSoundStatus('Tap to enable');
        } catch (error) {
            console.error('Could not enable browser audio:', error);
            setSoundStatus('Unavailable');
        }
    });
}

const testAudioButton = byId('testAudioBtn');
if (testAudioButton) {
    testAudioButton.addEventListener('click', async () => {
        try {
            const context = initializeAudio();
            if (!context) return;
            if (context.state === 'suspended') await context.resume();
            if (context.state !== 'running') {
                setSoundStatus('Tap to enable');
                return;
            }
            const now = context.currentTime;
            await playTone(660, now, 0.12, 'sine');
            await playTone(880, now + 0.14, 0.18, 'triangle');
            setSoundStatus(audioToggle && audioToggle.checked ? 'On' : 'Off');
        } catch (error) {
            console.error('Browser audio test failed:', error);
            setSoundStatus('Unavailable');
        }
    });
}

const historyButton = byId('openHistoryBtn');
if (historyButton) {
    historyButton.addEventListener('click', () => {
        const menu = document.querySelector('.settings-menu');
        const historyMenu = byId('signalHistoryMenu');
        if (menu) menu.open = true;
        if (historyMenu) historyMenu.open = true;
    });
}

function renderHistory(records, historyApi) {
    if (!historyList) return;
    historyList.replaceChildren();
    if (records.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'history-empty';
        empty.textContent = 'No validated signals recorded.';
        historyList.appendChild(empty);
        return;
    }

    records.slice().reverse().forEach(record => {
        const item = document.createElement('div');
        item.className = `history-item ${record.direction.toLowerCase()}`;

        const description = document.createElement('span');
        const reason = record.analysis && typeof record.analysis.reason === 'string'
            ? record.analysis.reason
            : 'No validated strategy record';
        description.textContent = `${record.direction} — UNVALIDATED • ${reason}`;

        const timestamp = document.createElement('time');
        timestamp.textContent = record.timestamp;
        item.append(description, timestamp);

        if (record.outcome) {
            const outcome = document.createElement('span');
            outcome.textContent = `Manual, unverified: ${record.outcome.result}`;
            item.appendChild(outcome);
        } else {
            const actions = document.createElement('div');
            actions.className = 'history-outcome-actions';
            [['correct', 'Manual: matched'], ['incorrect', 'Manual: did not match']].forEach(([result, label]) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn-text';
                button.textContent = label;
                button.addEventListener('click', () => {
                    try {
                        const updated = historyApi.recordManualOutcome(records, record.id, result);
                        historyApi.saveHistory(window.localStorage, 'qx_signal_history_v1', updated);
                        renderHistory(updated, historyApi);
                    } catch (error) {
                        console.error('Could not record manual signal outcome:', error);
                        window.alert(`Could not record outcome: ${error.message}`);
                    }
                });
                actions.appendChild(button);
            });
            item.appendChild(actions);
        }
        historyList.appendChild(item);
    });
}

if (window.SignalHistory) {
    try {
        const records = window.SignalHistory.loadHistory(window.localStorage, 'qx_signal_history_v1');
        renderHistory(records, window.SignalHistory);
    } catch (error) {
        console.error('Signal history is unavailable:', error);
        if (historyList) historyList.textContent = 'Signal history is unavailable; saved data was not changed.';
        if (validationStatus) validationStatus.textContent = 'History unavailable';
    }
} else if (historyList) {
    historyList.textContent = 'Signal history module is unavailable.';
}

if (window.SignalNotifications) {
    let currentLiveSignalId = null;

    const tradeConfirmationBar = byId('tradeConfirmationBar');
    const confirmTradeTakenBtn = byId('confirmTradeTakenBtn');
    const skipTradeTakenBtn = byId('skipTradeTakenBtn');

    if (confirmTradeTakenBtn) {
        confirmTradeTakenBtn.addEventListener('click', () => {
            if (currentLiveSignalId && window.outcomeTracker) {
                void window.outcomeTracker.recordTradeConfirmation(currentLiveSignalId, true);
                if (tradeConfirmationBar) {
                    tradeConfirmationBar.innerHTML = '<span style="color:#00e676;font-size:12px;font-weight:600;">✓ Trade confirmed & tracked on Quotex.</span>';
                    setTimeout(() => { if (tradeConfirmationBar) tradeConfirmationBar.style.display = 'none'; }, 4000);
                }
            }
        });
    }

    if (skipTradeTakenBtn) {
        skipTradeTakenBtn.addEventListener('click', () => {
            if (tradeConfirmationBar) tradeConfirmationBar.style.display = 'none';
        });
    }

    window.notificationController = window.SignalNotifications.createController({
        onWait: reason => {
            const dir = byId('signalDirection');
            const status = byId('marketDataStatus');
            if (dir) {
                dir.textContent = 'WAIT';
                dir.dataset.direction = 'WAIT';
            }
            if (status) status.textContent = reason;
            if (tradeConfirmationBar) tradeConfirmationBar.style.display = 'none';
        },
        onLiveAnalysis: analysis => {
            if (typeof window.showLiveSignalNotification === 'function') {
                window.showLiveSignalNotification(analysis);
            }
            if (analysis.direction === 'UP' || analysis.direction === 'DOWN') {
                currentLiveSignalId = analysis.id;
                if (tradeConfirmationBar) {
                    tradeConfirmationBar.style.display = 'flex';
                }
            }
            if (window.SignalHistory) {
                try {
                    const currentHistory = window.SignalHistory.loadHistory(window.localStorage, 'qx_signal_history_v1');
                    const record = {
                        id: analysis.id || `live-${Date.now()}`,
                        direction: analysis.direction,
                        timestamp: new Date().toLocaleTimeString(),
                        analysis: {
                            reason: analysis.explanation,
                            model: analysis.model || 'qwen3-vl:4b',
                            audit: analysis.audit || null
                        }
                    };
                    const updated = [record, ...currentHistory].slice(0, 50);
                    window.SignalHistory.saveHistory(window.localStorage, 'qx_signal_history_v1', updated);
                    renderHistory(updated, window.SignalHistory);
                } catch (e) {
                    console.error('Failed to save signal history:', e);
                }
            }
        },
        playSound: (direction, id) => {
            if (typeof window.playSignalSound === 'function') {
                window.playSignalSound(direction, id);
            }
        },
        speakSignal: direction => {
            if (typeof window.speakSignal === 'function') {
                window.speakSignal(direction);
            }
        }
    });
}

// ============================================================================
// CONTINUOUS PERFORMANCE ANALYTICS & DASHBOARD RENDERING
// ============================================================================

function renderPerformanceDashboard(data) {
    if (!data) return;

    // 1. KPI Cards
    const overallWinRate = byId('overallWinRate');
    const winLossSub = byId('winLossSub');
    const totalSignalsCount = byId('totalSignalsCount');
    const signalsSub = byId('signalsSub');
    const upAccuracyVal = byId('upAccuracyVal');
    const upAccuracySub = byId('upAccuracySub');
    const downAccuracyVal = byId('downAccuracyVal');
    const downAccuracySub = byId('downAccuracySub');
    const rolling10Val = byId('rolling10Val');
    const rollingSub = byId('rollingSub');
    const userTradesWinRate = byId('userTradesWinRate');
    const userTradesSub = byId('userTradesSub');

    if (overallWinRate) {
        overallWinRate.textContent = data.winRate !== null ? `${data.winRate}%` : '--%';
    }
    if (winLossSub) {
        winLossSub.textContent = `${data.verifiedWins} Wins / ${data.verifiedLosses} Losses (${data.draws} Draws)`;
    }
    if (totalSignalsCount) {
        totalSignalsCount.textContent = data.totalSignals;
    }
    if (signalsSub) {
        const verifiedTotal = data.verifiedWins + data.verifiedLosses;
        signalsSub.textContent = `${verifiedTotal} Verified · ${data.unverified} Unverified (${data.pending} Pending)`;
    }
    if (upAccuracyVal) {
        upAccuracyVal.textContent = data.upAccuracy !== null ? `${data.upAccuracy}%` : '--%';
    }
    if (downAccuracyVal) {
        downAccuracyVal.textContent = data.downAccuracy !== null ? `${data.downAccuracy}%` : '--%';
    }
    if (rolling10Val) {
        rolling10Val.textContent = data.rolling && data.rolling.last10 !== null ? `${data.rolling.last10}%` : '--%';
    }
    if (rollingSub) {
        rollingSub.textContent = `Last 10: ${data.rolling && data.rolling.last10 !== null ? data.rolling.last10 + '%' : '--'} · Last 20: ${data.rolling && data.rolling.last20 !== null ? data.rolling.last20 + '%' : '--'}`;
    }
    if (userTradesWinRate) {
        userTradesWinRate.textContent = data.userTrades && data.userTrades.winRate !== null ? `${data.userTrades.winRate}%` : '--%';
    }
    if (userTradesSub) {
        userTradesSub.textContent = `${(data.userTrades && data.userTrades.total) || 0} Taken (${(data.userTrades && data.userTrades.wins) || 0}W / ${(data.userTrades && data.userTrades.losses) || 0}L)`;
    }

    // 2. Asset Performance Table
    const assetBody = byId('assetPerformanceBody');
    if (assetBody && data.assetBreakdown) {
        assetBody.replaceChildren();
        if (data.assetBreakdown.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="4" class="empty-table-cell">No asset records yet.</td>';
            assetBody.appendChild(tr);
        } else {
            data.assetBreakdown.forEach(a => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${escapeHtml(a.asset)}</strong></td>
                    <td>${a.total}</td>
                    <td>${a.wins}W / ${a.losses}L</td>
                    <td><strong style="color:${a.winRate >= 60 ? '#00e676' : a.winRate ? '#ff5252' : '#8da4be'}">${a.winRate !== null ? a.winRate + '%' : '--'}</strong></td>
                `;
                assetBody.appendChild(tr);
            });
        }
    }

    // 3. Market Breakdown (OTC vs Regular)
    const marketBody = byId('marketPerformanceBody');
    if (marketBody && data.marketBreakdown) {
        marketBody.replaceChildren();
        if (data.marketBreakdown.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="4" class="empty-table-cell">No market records yet.</td>';
            marketBody.appendChild(tr);
        } else {
            data.marketBreakdown.forEach(m => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${escapeHtml(m.market)}</strong></td>
                    <td>${m.total}</td>
                    <td>${m.wins}W / ${m.losses}L</td>
                    <td><strong style="color:${m.winRate >= 60 ? '#00e676' : m.winRate ? '#ff5252' : '#8da4be'}">${m.winRate !== null ? m.winRate + '%' : '--'}</strong></td>
                `;
                marketBody.appendChild(tr);
            });
        }
    }

    // 4. Recent Signals Table
    const historyBody = byId('signalsHistoryBody');
    if (historyBody && data.recentSignals) {
        historyBody.replaceChildren();
        if (data.recentSignals.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="7" class="empty-table-cell">No signals recorded in database.</td>';
            historyBody.appendChild(tr);
        } else {
            data.recentSignals.forEach(s => {
                const tr = document.createElement('tr');
                const outcomeClass = s.outcome ? s.outcome.toLowerCase() : 'pending';
                const timeStr = new Date(s.entry_timestamp).toLocaleTimeString();
                tr.innerHTML = `
                    <td>${timeStr}</td>
                    <td>${escapeHtml(s.asset)}</td>
                    <td><strong style="color:${s.direction === 'UP' ? '#00e676' : '#ff5252'}">${s.direction}</strong></td>
                    <td>${escapeHtml(s.candle_pattern || 'NORMAL')} · ${escapeHtml(s.candle_polarity || '')}</td>
                    <td>${s.trade_placed ? '<span style="color:#00e676;font-weight:600;">✓ Yes</span>' : '<span style="color:#78909c;">No</span>'}</td>
                    <td><span class="badge-outcome ${outcomeClass}">${s.outcome}</span></td>
                    <td style="max-width:220px;font-size:11px;color:#a0b4cc;">${escapeHtml(s.outcome_reason || s.validation_reason || '')}</td>
                `;
                historyBody.appendChild(tr);
            });
        }
    }

    // 5. Error Analysis & Mistakes (Loss Investigation)
    const mistakesContainer = byId('mistakesContainer');
    if (mistakesContainer && data.recentMistakes) {
        mistakesContainer.replaceChildren();
        if (data.recentMistakes.length === 0) {
            const p = document.createElement('p');
            p.className = 'empty-state-text';
            p.textContent = 'No wrong signal records logged. Error analysis populates automatically upon verified losses.';
            mistakesContainer.appendChild(p);
        } else {
            data.recentMistakes.forEach(m => {
                const div = document.createElement('div');
                div.className = 'mistake-card';
                div.innerHTML = `
                    <div class="mistake-header">
                        <span class="mistake-cause">⚠️ ${escapeHtml(m.cause)} (${m.direction} on ${escapeHtml(m.asset)})</span>
                        <time style="color:#78909c;">${new Date(m.timestamp).toLocaleTimeString()}</time>
                    </div>
                    <p class="mistake-warning">${escapeHtml(m.warning)}</p>
                `;
                mistakesContainer.appendChild(div);
            });
        }
    }

    // 6. Continuous Learning & Strategy Governance
    const learningMsg = byId('learningStatusMessage');
    const learningSamples = byId('learningSampleCount');
    const progressBar = byId('learningProgressBar');
    const activeBadge = byId('activeStrategyBadge');

    if (data.learning) {
        if (learningMsg) learningMsg.textContent = data.learning.message;
        if (learningSamples) learningSamples.textContent = `${data.learning.verifiedSampleCount} / ${data.learning.minSamplesRequired} Samples`;
        if (progressBar) {
            const pct = Math.min(100, Math.round((data.learning.verifiedSampleCount / data.learning.minSamplesRequired) * 100));
            progressBar.style.width = `${pct}%`;
        }
        if (activeBadge) {
            activeBadge.textContent = `Active: ${data.learning.activeStrategy}`;
        }
    }
}

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c] || c));
}

// Pending Signals Countdown List
function updatePendingSignalsUI() {
    const tracker = window.outcomeTracker;
    if (!tracker) return;

    const pending = tracker.getPendingSignals();
    const container = byId('pendingSignalsList');
    const badge = byId('pendingSignalsBadge');

    if (badge) {
        badge.textContent = `${pending.length} Pending Expiries`;
    }

    if (container) {
        if (pending.length === 0) {
            container.innerHTML = '<p class="empty-state-text">No active signals awaiting expiry settlement.</p>';
            return;
        }

        const now = Date.now();
        container.replaceChildren();

        pending.forEach(s => {
            const remainingSec = Math.max(0, Math.ceil((s.expiryMs - now) / 1000));
            const div = document.createElement('div');
            div.className = 'pending-signal-item';
            div.innerHTML = `
                <div class="pending-signal-main">
                    <strong style="color:${s.direction === 'UP' ? '#00e676' : '#ff5252'}">${s.direction}</strong>
                    <span>${escapeHtml(s.asset)}</span>
                    <span style="font-size:11px;color:#8da4be;">${escapeHtml(s.candlePattern)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-size:11px;color:${s.tradePlaced ? '#00e676' : '#78909c'};font-weight:600;">
                        ${s.tradePlaced ? '✓ Traded' : 'Signal Only'}
                    </span>
                    <span class="pending-timer-badge">⏱️ Expires in ${remainingSec}s</span>
                </div>
            `;
            container.appendChild(div);
        });
    }
}

// Automatic Monitoring Banner Sync
function updateAutoMonitoringBanner() {
    const liveStatus = byId('liveConnectionStatus');
    const bannerDot = byId('autoStatusDot');
    const bannerTitle = byId('autoStatusTitle');
    const bannerSub = byId('autoStatusSub');

    if (!liveStatus || !bannerDot || !bannerTitle) return;

    const statusText = (liveStatus.textContent || '').trim();

    if (statusText === 'LIVE MONITORING ACTIVE') {
        bannerDot.className = 'auto-status-dot active';
        bannerTitle.textContent = 'Live Monitoring: Active';
        if (bannerSub) bannerSub.textContent = 'Continuous local AI frame analysis running';
    } else if (statusText.includes('paused') || statusText.includes('Paused')) {
        bannerDot.className = 'auto-status-dot paused';
        bannerTitle.textContent = 'Monitoring: Paused by User';
        if (bannerSub) bannerSub.textContent = 'Click START MONITORING or Reconnect to resume';
    } else if (statusText.includes('Connected')) {
        bannerDot.className = 'auto-status-dot active';
        bannerTitle.textContent = 'Automatic Monitoring: Ready';
        if (bannerSub) bannerSub.textContent = 'Screen preview connected';
    } else {
        bannerDot.className = 'auto-status-dot disconnected';
        bannerTitle.textContent = 'Automatic Monitoring: Ready';
        if (bannerSub) bannerSub.textContent = 'Starts automatically as soon as Quotex tab is shared';
    }
}

// Initialize on DOM load
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('DOMContentLoaded', () => {
        if (window.SignalOutcomeTracker) {
            window.outcomeTracker = window.SignalOutcomeTracker.createTracker({
                fetchImpl: window.fetch ? window.fetch.bind(window) : null,
                storage: window.localStorage,
                onMetricsUpdated: renderPerformanceDashboard
            });

            // Initial fetch of performance metrics
            void window.outcomeTracker.fetchMetrics();
        }

        // Rollback button listener
        const rollbackBtn = byId('rollbackStrategyBtn');
        if (rollbackBtn) {
            rollbackBtn.addEventListener('click', async () => {
                if (!window.outcomeTracker) return;
                const confirmRollback = window.confirm('Roll back active strategy to v1.0.0-legacy?');
                if (confirmRollback) {
                    await window.outcomeTracker.rollbackStrategy('v1.0.0-legacy');
                }
            });
        }

        // UI interval timers
        if (typeof setInterval === 'function') {
            setInterval(updatePendingSignalsUI, 1000);
            setInterval(updateAutoMonitoringBanner, 500);
            setInterval(() => {
                if (window.outcomeTracker) {
                    void window.outcomeTracker.fetchMetrics();
                }
            }, 4000);
        }
    });
}
