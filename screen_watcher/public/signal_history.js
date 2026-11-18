(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.SignalHistory = api;
    }
})(typeof globalThis === 'object' ? globalThis : this, function () {
    const VALID_DIRECTIONS = new Set(['UP', 'DOWN']);
    const VALID_MANUAL_OUTCOMES = new Set(['correct', 'incorrect']);
    function createSignalRecord({ id, timestamp, direction, timeframe, analysis }) {
        if (!id || !timestamp || Number.isNaN(Date.parse(timestamp))) {
            throw new TypeError('Signal id and valid ISO timestamp are required.');
        }
        if (!VALID_DIRECTIONS.has(direction)) {
            throw new TypeError('Signal direction must be UP or DOWN.');
        }
        if (typeof analysis !== 'object' || analysis === null || Array.isArray(analysis)) {
            throw new TypeError('Signal analysis must be an object.');
        }

        return {
            id,
            timestamp,
            direction,
            timeframe: timeframe || 'visual horizon (unverified)',
            analysis,
            outcome: null
        };
    }

    function recordManualOutcome(records, signalId, result, recordedAt) {
        if (!VALID_MANUAL_OUTCOMES.has(result)) {
            throw new TypeError('Manual outcome must be correct or incorrect.');
        }
        const index = records.findIndex(record => record.id === signalId);
        if (index < 0) {
            throw new RangeError('Signal was not found.');
        }
        if (records[index].outcome) {
            throw new Error('An outcome has already been recorded for this signal.');
        }

        const updated = records.slice();
        updated[index] = {
            ...records[index],
            outcome: {
                result,
                source: 'manual',
                verified: false,
                recordedAt: recordedAt || new Date().toISOString()
            }
        };
        return updated;
    }

    function getValidationStatus(records) {
        const verifiedSamples = records.filter(record =>
            record.outcome &&
            record.outcome.source === 'verified' &&
            record.outcome.verified === true
        ).length;
        return {
            label: 'Not Yet Validated',
            accuracy: null,
            verifiedSamples
        };
    }

    function loadHistory(storage, key) {
        const serialized = storage.getItem(key);
        if (serialized === null) return [];

        const records = JSON.parse(serialized);
        if (!Array.isArray(records)) {
            throw new TypeError('Saved signal history must be an array.');
        }
        for (const record of records) {
            if (!record || typeof record.id !== 'string' ||
                !VALID_DIRECTIONS.has(record.direction) ||
                Number.isNaN(Date.parse(record.timestamp))) {
                throw new TypeError('Saved signal history contains an invalid record.');
            }
            if (record.outcome &&
                (record.outcome.source !== 'manual' ||
                record.outcome.verified !== false ||
                !VALID_MANUAL_OUTCOMES.has(record.outcome.result))) {
                throw new TypeError('Saved outcomes must be explicitly manual and unverified.');
            }
        }
        return records;
    }

    function saveHistory(storage, key, records) {
        storage.setItem(key, JSON.stringify(records));
    }

    return {
        createSignalRecord,
        recordManualOutcome,
        getValidationStatus,
        loadHistory,
        saveHistory,
    };
});
