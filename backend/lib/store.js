const fs = require('fs');
const path = require('path');

const DATA_DIR =
    process.env.DATA_DIR ||
    (process.env.VERCEL ? path.join('/tmp', 'localpulse-data') : path.join(__dirname, '..', 'data'));
const STATE_FILE = path.join(DATA_DIR, 'app-state.json');

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function loadState() {
    ensureDataDir();
    if (!fs.existsSync(STATE_FILE)) return null;
    try {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.warn('[store] Could not read state file, starting fresh:', err.message);
        return null;
    }
}

function saveStateNow(state) {
    ensureDataDir();
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
}

let saveTimer = null;
let pendingState = null;

function scheduleSave(state) {
    pendingState = state;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        const snapshot = pendingState;
        pendingState = null;
        if (!snapshot) return;
        try {
            saveStateNow(snapshot);
        } catch (err) {
            console.error('[store] Failed to save state:', err.message);
        }
    }, 150);
}

function flushSave() {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (!pendingState) return;
    const state = pendingState;
    pendingState = null;
    saveStateNow(state);
}

module.exports = {
    DATA_DIR,
    STATE_FILE,
    loadState,
    saveStateNow,
    scheduleSave,
    flushSave
};
