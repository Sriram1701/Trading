'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_DB_PATH = path.join(DATA_DIR, 'trading_performance.db');
const BACKUP_JSON_PATH = path.join(DATA_DIR, 'trading_analytics_backup.json');

const VALID_OUTCOMES = new Set(['WIN', 'LOSS', 'DRAW', 'UNVERIFIED', 'PENDING']);
const VALID_DIRECTIONS = new Set(['UP', 'DOWN', 'WAIT']);

class PerformanceDB {
    constructor(dbPath = DEFAULT_DB_PATH) {
        this.dbPath = dbPath;
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        this.db = new DatabaseSync(dbPath);
        this.initSchema();
    }

    initSchema() {
        // Enable WAL mode for high performance and concurrency
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec('PRAGMA synchronous = NORMAL;');

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS signals (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                asset TEXT NOT NULL,
                market_type TEXT NOT NULL,
                timeframe TEXT NOT NULL,
                direction TEXT NOT NULL,
                entry_timestamp TEXT NOT NULL,
                entry_price REAL,
                expiry_duration INTEGER NOT NULL,
                expiry_timestamp TEXT NOT NULL,
                expiry_price REAL,
                candle_pattern TEXT,
                candle_polarity TEXT,
                technical_evidence TEXT,
                indicator_states TEXT,
                vision_status TEXT,
                confidence TEXT,
                validation_reason TEXT,
                algorithm_version TEXT,
                trade_placed INTEGER DEFAULT 0,
                outcome TEXT DEFAULT 'PENDING',
                outcome_reason TEXT,
                verified_at TEXT
            );

            CREATE TABLE IF NOT EXISTS strategy_versions (
                version TEXT PRIMARY KEY,
                description TEXT,
                created_at TEXT,
                status TEXT,
                min_samples_required INTEGER DEFAULT 20,
                rules_config TEXT
            );

            CREATE TABLE IF NOT EXISTS loss_analysis (
                id TEXT PRIMARY KEY,
                signal_id TEXT,
                primary_cause TEXT,
                missed_warning TEXT,
                evidence_snapshot TEXT,
                analyzed_at TEXT,
                FOREIGN KEY (signal_id) REFERENCES signals(id)
            );

            CREATE TABLE IF NOT EXISTS candidate_audit (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                candidate TEXT NOT NULL,
                approved INTEGER NOT NULL,
                signal_strength TEXT,
                rejection_reason TEXT,
                candle_id TEXT
            );
        `);

        // Seed initial strategy versions if not present
        const count = this.db.prepare('SELECT COUNT(*) as c FROM strategy_versions').get();
        if (!count || count.c === 0) {
            const insertVer = this.db.prepare(`
                INSERT INTO strategy_versions (version, description, created_at, status, min_samples_required, rules_config)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            insertVer.run(
                'v1.0.0-legacy',
                'Single factor polarity rule without independent indicator confluence',
                '2026-11-15T00:00:00.000Z',
                'HISTORICAL',
                20,
                JSON.stringify({ independentConfluenceRequired: false, minFactors: 1 })
            );
            insertVer.run(
                'v1.1.0-hybrid',
                'Strict 3-category confluence (PRICE_ACTION + MOMENTUM or VOLATILITY) with completed candle validation and Qwen verification',
                '2026-11-18T00:00:00.000Z',
                'ACTIVE',
                20,
                JSON.stringify({ independentConfluenceRequired: true, minFactors: 2, strictCandleClose: true })
            );
        }
    }

    saveSignal(signal) {
        if (!signal || !signal.id) {
            throw new TypeError('Signal record requires a valid id.');
        }

        const stmt = this.db.prepare(`
            INSERT INTO signals (
                id, timestamp, asset, market_type, timeframe, direction,
                entry_timestamp, entry_price, expiry_duration, expiry_timestamp,
                candle_pattern, candle_polarity, technical_evidence, indicator_states,
                vision_status, confidence, validation_reason, algorithm_version,
                trade_placed, outcome, outcome_reason, verified_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?
            )
            ON CONFLICT(id) DO UPDATE SET
                trade_placed = excluded.trade_placed,
                outcome = excluded.outcome,
                outcome_reason = excluded.outcome_reason,
                expiry_price = excluded.expiry_price,
                verified_at = excluded.verified_at;
        `);

        stmt.run(
            signal.id,
            signal.timestamp || new Date().toISOString(),
            signal.asset || 'EUR/USD (Quotex)',
            signal.marketType || 'REGULAR',
            signal.timeframe || '1M',
            signal.direction || 'WAIT',
            signal.entryTimestamp || signal.timestamp || new Date().toISOString(),
            typeof signal.entryPrice === 'number' ? signal.entryPrice : null,
            Number.isInteger(signal.expiryDuration) ? signal.expiryDuration : 60,
            signal.expiryTimestamp || new Date(Date.now() + 60000).toISOString(),
            signal.candlePattern || 'NORMAL',
            signal.candlePolarity || 'UNKNOWN',
            JSON.stringify(signal.technicalEvidence || []),
            JSON.stringify(signal.indicatorStates || {}),
            signal.visionStatus || 'UNVERIFIED',
            signal.confidence || 'WAIT',
            signal.validationReason || '',
            signal.algorithmVersion || 'v1.1.0-hybrid',
            signal.tradePlaced ? 1 : 0,
            signal.outcome || 'PENDING',
            signal.outcomeReason || null,
            signal.verifiedAt || null
        );

        this.syncJsonBackup();
        return this.getSignalById(signal.id);
    }

    getSignalById(id) {
        const row = this.db.prepare('SELECT * FROM signals WHERE id = ?').get(id);
        if (!row) return null;
        return this.deserializeSignal(row);
    }

    deserializeSignal(row) {
        return {
            ...row,
            trade_placed: Boolean(row.trade_placed),
            technical_evidence: row.technical_evidence ? JSON.parse(row.technical_evidence) : [],
            indicator_states: row.indicator_states ? JSON.parse(row.indicator_states) : {}
        };
    }

    updateTradeStatus(signalId, tradePlaced) {
        const stmt = this.db.prepare('UPDATE signals SET trade_placed = ? WHERE id = ?');
        stmt.run(tradePlaced ? 1 : 0, signalId);
        this.syncJsonBackup();
        return this.getSignalById(signalId);
    }

    recordOutcome(signalId, {
        outcome,
        expiryPrice = null,
        outcomeReason = null,
        tradePlaced = null,
        verifiedAt = new Date().toISOString(),
        subsequentEvidence = null
    }) {
        if (!VALID_OUTCOMES.has(outcome)) {
            throw new TypeError(`Invalid outcome: ${outcome}. Must be WIN, LOSS, DRAW, UNVERIFIED, or PENDING.`);
        }

        const existing = this.getSignalById(signalId);
        if (!existing) {
            throw new RangeError(`Signal ${signalId} not found.`);
        }

        let finalReason = outcomeReason;
        if (outcome === 'LOSS') {
            const analysis = this.analyzeLossCause(existing, subsequentEvidence);
            finalReason = outcomeReason || analysis.primaryCause;
            this.recordLossAnalysis(signalId, analysis);
        } else if (outcome === 'WIN') {
            finalReason = outcomeReason || `Confirmed by subsequent favorable price movement in ${existing.direction} direction.`;
        }

        const updateStmt = this.db.prepare(`
            UPDATE signals SET
                outcome = ?,
                expiry_price = ?,
                outcome_reason = ?,
                trade_placed = COALESCE(?, trade_placed),
                verified_at = ?
            WHERE id = ?
        `);

        updateStmt.run(
            outcome,
            typeof expiryPrice === 'number' ? expiryPrice : existing.expiry_price,
            finalReason,
            tradePlaced === null ? null : (tradePlaced ? 1 : 0),
            verifiedAt,
            signalId
        );

        this.syncJsonBackup();
        return this.getSignalById(signalId);
    }

    analyzeLossCause(signal, subsequentEvidence) {
        let primaryCause = 'UNKNOWN';
        let missedWarning = 'No distinct leading indicator warning was detected prior to signal.';

        const indicators = signal.indicator_states || {};
        const techEvidence = signal.technical_evidence || [];

        // Evaluate objective reasons based on recorded evidence
        if (indicators.bollinger && (indicators.bollinger === 'UPPER_BAND_TEST' && signal.direction === 'UP')) {
            primaryCause = 'Bollinger Band rejection';
            missedWarning = 'Price was testing upper band resistance, which precipitated a sharp mean-reversion pullback.';
        } else if (indicators.bollinger && (indicators.bollinger === 'LOWER_BAND_TEST' && signal.direction === 'DOWN')) {
            primaryCause = 'Bollinger Band support bounce';
            missedWarning = 'Price was testing lower band support, which triggered a quick bullish bounce.';
        } else if (indicators.rsi && indicators.rsi.includes('OVERBOUGHT') && signal.direction === 'UP') {
            primaryCause = 'RSI momentum exhaustion';
            missedWarning = 'Oscillator was in an extended overbought zone, reducing continuation probability.';
        } else if (indicators.rsi && indicators.rsi.includes('OVERSOLD') && signal.direction === 'DOWN') {
            primaryCause = 'RSI momentum exhaustion';
            missedWarning = 'Oscillator was in an extended oversold zone, leaving limited downside room.';
        } else if (signal.candle_pattern === 'DOJI' || signal.candle_pattern === 'HAMMER' && signal.direction === 'DOWN') {
            primaryCause = 'Candle reversal pin-bar opposing signal';
            missedWarning = 'Candlestick structure exhibited strong opposite wick rejection.';
        } else if (techEvidence.some(e => e.toLowerCase().includes('consolidat') || e.toLowerCase().includes('neutral'))) {
            primaryCause = 'Sideways market consolidation';
            missedWarning = 'Market was lacking trending momentum and oscillated inside narrow range.';
        } else if (subsequentEvidence && subsequentEvidence.opposingSpike) {
            primaryCause = 'Sudden high-volatility counter-spike';
            missedWarning = 'Rapid opposing tick observed during expiry window.';
        } else {
            primaryCause = 'Trend reversal';
            missedWarning = 'Subsequent candle polarity reversed direction before trade expiry.';
        }

        return {
            primaryCause,
            missedWarning,
            evidenceSnapshot: {
                direction: signal.direction,
                candlePattern: signal.candle_pattern,
                indicators,
                technicalEvidence: techEvidence,
                subsequentEvidence
            }
        };
    }

    recordLossAnalysis(signalId, analysis) {
        const stmt = this.db.prepare(`
            INSERT INTO loss_analysis (id, signal_id, primary_cause, missed_warning, evidence_snapshot, analyzed_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            `LOSS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            signalId,
            analysis.primaryCause,
            analysis.missedWarning,
            JSON.stringify(analysis.evidenceSnapshot),
            new Date().toISOString()
        );
    }

    recordCandidate(candidateData) {
        if (!candidateData || !candidateData.candidate) return;
        const stmt = this.db.prepare(`
            INSERT INTO candidate_audit (id, timestamp, candidate, approved, signal_strength, rejection_reason, candle_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            candidateData.id || `CAND-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            candidateData.timestamp || new Date().toISOString(),
            candidateData.candidate,
            candidateData.approved ? 1 : 0,
            candidateData.signalStrength || candidateData.signal_strength || 'WAIT',
            candidateData.rejectionReason || candidateData.rejection_reason || null,
            candidateData.candleId || candidateData.candle_id || null
        );
    }

    categorizeRejection(reason, breakdown) {
        if (!reason) {
            breakdown.other += 1;
            return;
        }
        const lower = reason.toLowerCase();
        if (lower.includes('confirmation is missing') || lower.includes('missing')) {
            breakdown.missingConfirmation += 1;
        } else if (lower.includes('conflicting') || lower.includes('opposes')) {
            breakdown.conflictingIndicators += 1;
        } else if (lower.includes('awaiting confirmed candle') || lower.includes('forming') || lower.includes('unconfirmed')) {
            breakdown.unconfirmedCandle += 1;
        } else if (lower.includes('exhaustion') || lower.includes('overbought') || lower.includes('oversold')) {
            breakdown.exhaustionRisk += 1;
        } else {
            breakdown.other += 1;
        }
    }

    getPerformanceMetrics() {
        const rows = this.db.prepare('SELECT * FROM signals ORDER BY entry_timestamp DESC').all();
        const signals = rows.map(r => this.deserializeSignal(r));

        let totalSignals = signals.length;
        let verifiedWins = 0;
        let verifiedLosses = 0;
        let draws = 0;
        let unverified = 0;
        let pending = 0;

        let upWins = 0;
        let upLosses = 0;
        let downWins = 0;
        let downLosses = 0;

        let userTrades = 0;
        let userTradeWins = 0;
        let userTradeLosses = 0;

        const assetMap = {};
        const marketMap = { OTC: { total: 0, wins: 0, losses: 0 }, REGULAR: { total: 0, wins: 0, losses: 0 } };
        const timeframeMap = {};

        const verifiedSignalsChronological = [];

        for (const s of signals) {
            // Track asset grouping
            if (!assetMap[s.asset]) {
                assetMap[s.asset] = { total: 0, wins: 0, losses: 0, unverified: 0, draws: 0 };
            }
            assetMap[s.asset].total += 1;

            // Track timeframe grouping
            if (!timeframeMap[s.timeframe]) {
                timeframeMap[s.timeframe] = { total: 0, wins: 0, losses: 0, winRate: null };
            }
            timeframeMap[s.timeframe].total += 1;

            const mType = s.market_type === 'OTC' ? 'OTC' : 'REGULAR';
            marketMap[mType].total += 1;

            if (s.trade_placed) userTrades += 1;

            if (s.outcome === 'WIN') {
                verifiedWins += 1;
                assetMap[s.asset].wins += 1;
                marketMap[mType].wins += 1;
                timeframeMap[s.timeframe].wins += 1;
                if (s.direction === 'UP') upWins += 1;
                if (s.direction === 'DOWN') downWins += 1;
                if (s.trade_placed) userTradeWins += 1;
                verifiedSignalsChronological.push(s);
            } else if (s.outcome === 'LOSS') {
                verifiedLosses += 1;
                assetMap[s.asset].losses += 1;
                marketMap[mType].losses += 1;
                timeframeMap[s.timeframe].losses += 1;
                if (s.direction === 'UP') upLosses += 1;
                if (s.direction === 'DOWN') downLosses += 1;
                if (s.trade_placed) userTradeLosses += 1;
                verifiedSignalsChronological.push(s);
            } else if (s.outcome === 'DRAW') {
                draws += 1;
                assetMap[s.asset].draws += 1;
            } else if (s.outcome === 'UNVERIFIED') {
                unverified += 1;
                assetMap[s.asset].unverified += 1;
            } else {
                pending += 1;
            }
        }

        // Strict calculation: Unverified and pending are strictly excluded from the win-rate denominator!
        const totalDecided = verifiedWins + verifiedLosses;
        const winRate = totalDecided > 0 ? Number(((verifiedWins / totalDecided) * 100).toFixed(1)) : null;

        const totalUpDecided = upWins + upLosses;
        const upAccuracy = totalUpDecided > 0 ? Number(((upWins / totalUpDecided) * 100).toFixed(1)) : null;

        const totalDownDecided = downWins + downLosses;
        const downAccuracy = totalDownDecided > 0 ? Number(((downWins / totalDownDecided) * 100).toFixed(1)) : null;

        const userTradeTotal = userTradeWins + userTradeLosses;
        const userTradeWinRate = userTradeTotal > 0 ? Number(((userTradeWins / userTradeTotal) * 100).toFixed(1)) : null;

        // Compute asset rates
        const assetBreakdown = Object.entries(assetMap).map(([asset, data]) => {
            const decided = data.wins + data.losses;
            return {
                asset,
                total: data.total,
                wins: data.wins,
                losses: data.losses,
                unverified: data.unverified,
                draws: data.draws,
                winRate: decided > 0 ? Number(((data.wins / decided) * 100).toFixed(1)) : null
            };
        });

        // Compute market rates (OTC vs REGULAR)
        const marketBreakdown = Object.entries(marketMap).map(([market, data]) => {
            const decided = data.wins + data.losses;
            return {
                market,
                total: data.total,
                wins: data.wins,
                losses: data.losses,
                winRate: decided > 0 ? Number(((data.wins / decided) * 100).toFixed(1)) : null
            };
        });

        // Compute timeframe rates
        const timeframeBreakdown = Object.entries(timeframeMap).map(([tf, data]) => {
            const decided = data.wins + data.losses;
            return {
                timeframe: tf,
                total: data.total,
                wins: data.wins,
                losses: data.losses,
                winRate: decided > 0 ? Number(((data.wins / decided) * 100).toFixed(1)) : null
            };
        });

        // Rolling performance (last 10, last 20 verified outcomes)
        // verifiedSignalsChronological is newest first (ordered by entry_timestamp DESC)
        const computeRolling = count => {
            const sample = verifiedSignalsChronological.slice(0, count);
            if (sample.length === 0) return null;
            const wins = sample.filter(s => s.outcome === 'WIN').length;
            return Number(((wins / sample.length) * 100).toFixed(1));
        };

        const rolling10 = computeRolling(10);
        const rolling20 = computeRolling(20);

        // Retrieve recent mistakes
        const mistakeRows = this.db.prepare(`
            SELECT l.*, s.direction, s.asset, s.entry_timestamp, s.validation_reason
            FROM loss_analysis l
            JOIN signals s ON l.signal_id = s.id
            ORDER BY l.analyzed_at DESC
            LIMIT 10
        `).all();

        const recentMistakes = mistakeRows.map(m => ({
            id: m.id,
            signalId: m.signal_id,
            direction: m.direction,
            asset: m.asset,
            timestamp: m.entry_timestamp,
            cause: m.primary_cause,
            warning: m.missed_warning,
            validationReason: m.validation_reason,
            analyzedAt: m.analyzed_at
        }));

        // Strategy versions and learning status
        const activeStrategyRow = this.db.prepare("SELECT * FROM strategy_versions WHERE status = 'ACTIVE' LIMIT 1").get();
        const activeStrategy = activeStrategyRow ? activeStrategyRow.version : 'v1.1.0-hybrid';
        const minSamplesRequired = activeStrategyRow ? activeStrategyRow.min_samples_required : 20;

        const canLearn = totalDecided >= minSamplesRequired;
        const learningMessage = canLearn
            ? `Sufficient verified sample size (${totalDecided} verified trades). Walk-forward learning active for strategy ${activeStrategy}.`
            : `Insufficient sample to learn reliably (${totalDecided} / ${minSamplesRequired} verified outcomes). Collecting evidence before rule adjustment.`;

        // Directional Candidate and Verification Analytics
        let totalUpCandidates = 0;
        let totalDownCandidates = 0;
        let approvedUpSignals = 0;
        let approvedDownSignals = 0;
        let rejectedUpCandidates = 0;
        let rejectedDownCandidates = 0;
        const rejectionBreakdown = {
            missingConfirmation: 0,
            conflictingIndicators: 0,
            unconfirmedCandle: 0,
            exhaustionRisk: 0,
            other: 0
        };

        try {
            const candidateRows = this.db.prepare('SELECT * FROM candidate_audit').all();
            for (const c of candidateRows) {
                if (c.candidate === 'UP') {
                    totalUpCandidates += 1;
                    if (c.approved) approvedUpSignals += 1;
                    else {
                        rejectedUpCandidates += 1;
                        this.categorizeRejection(c.rejection_reason, rejectionBreakdown);
                    }
                } else if (c.candidate === 'DOWN') {
                    totalDownCandidates += 1;
                    if (c.approved) approvedDownSignals += 1;
                    else {
                        rejectedDownCandidates += 1;
                        this.categorizeRejection(c.rejection_reason, rejectionBreakdown);
                    }
                }
            }
        } catch {
            // Table may be empty or newly initialized
        }

        // Fallback to recorded signals if no standalone candidate rows logged yet
        if (totalUpCandidates === 0 && totalDownCandidates === 0) {
            approvedUpSignals = signals.filter(s => s.direction === 'UP').length;
            approvedDownSignals = signals.filter(s => s.direction === 'DOWN').length;
            totalUpCandidates = approvedUpSignals;
            totalDownCandidates = approvedDownSignals;
        }

        const upApprovalRate = totalUpCandidates > 0 ? Number(((approvedUpSignals / totalUpCandidates) * 100).toFixed(1)) : null;
        const downApprovalRate = totalDownCandidates > 0 ? Number(((approvedDownSignals / totalDownCandidates) * 100).toFixed(1)) : null;

        return {
            totalSignals,
            verifiedWins,
            verifiedLosses,
            draws,
            unverified,
            pending,
            winRate,
            upAccuracy,
            downAccuracy,
            directional: {
                totalUpCandidates,
                totalDownCandidates,
                approvedUpSignals,
                approvedDownSignals,
                rejectedUpCandidates,
                rejectedDownCandidates,
                upApprovalRate,
                downApprovalRate,
                upWins,
                upLosses,
                upAccuracy,
                downWins,
                downLosses,
                downAccuracy,
                rejectionBreakdown
            },
            userTrades: {
                total: userTrades,
                wins: userTradeWins,
                losses: userTradeLosses,
                winRate: userTradeWinRate
            },
            rolling: {
                last10: rolling10,
                last20: rolling20
            },
            assetBreakdown,
            marketBreakdown,
            timeframeBreakdown,
            recentSignals: signals.slice(0, 20),
            recentMistakes,
            learning: {
                activeStrategy,
                verifiedSampleCount: totalDecided,
                minSamplesRequired,
                canLearn,
                message: learningMessage
            }
        };
    }

    rollbackStrategy(targetVersion) {
        const target = this.db.prepare('SELECT * FROM strategy_versions WHERE version = ?').get(targetVersion);
        if (!target) {
            throw new RangeError(`Target strategy version ${targetVersion} not found.`);
        }
        this.db.prepare("UPDATE strategy_versions SET status = 'HISTORICAL' WHERE status = 'ACTIVE'").run();
        this.db.prepare("UPDATE strategy_versions SET status = 'ACTIVE' WHERE version = ?").run(targetVersion);
        return { success: true, activeVersion: targetVersion };
    }

    getStrategyVersions() {
        return this.db.prepare('SELECT * FROM strategy_versions ORDER BY created_at DESC').all();
    }

    syncJsonBackup() {
        try {
            const rows = this.db.prepare('SELECT * FROM signals ORDER BY entry_timestamp DESC').all();
            const versions = this.db.prepare('SELECT * FROM strategy_versions').all();
            const losses = this.db.prepare('SELECT * FROM loss_analysis').all();

            const backup = {
                exportedAt: new Date().toISOString(),
                signals: rows,
                strategy_versions: versions,
                loss_analysis: losses
            };

            const tempPath = `${BACKUP_JSON_PATH}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify(backup, null, 2), 'utf8');
            fs.renameSync(tempPath, BACKUP_JSON_PATH);
        } catch (err) {
            console.error('Failed to sync JSON performance backup:', err);
        }
    }

    close() {
        this.db.close();
    }
}

let defaultInstance = null;
function getPerformanceDB(dbPath) {
    if (!defaultInstance || dbPath) {
        defaultInstance = new PerformanceDB(dbPath);
    }
    return defaultInstance;
}

module.exports = {
    PerformanceDB,
    getPerformanceDB
};
