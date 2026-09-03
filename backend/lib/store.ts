import * as fs from 'fs';
import * as path from 'path';

function resolveDefaultDataDir() {
    // Source: backend/lib → backend/data; compiled: dist/lib → backend/data
    if (fs.existsSync(path.join(__dirname, '..', '..', 'package.json'))) {
        return path.join(__dirname, '..', '..', 'data');
    }
    return path.join(__dirname, '..', 'data');
}

const DATA_DIR =
    process.env.DATA_DIR ||
    (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
        ? path.join('/tmp', 'localpulse-data')
        : resolveDefaultDataDir());
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
    } catch (err: any) {
        console.warn('[store] Could not read state file, starting fresh:', err.message);
        return null;
    }
}

function saveStateNow(state: any) {
    ensureDataDir();
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: any = null;

function scheduleSave(state: any) {
    pendingState = state;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        const snapshot = pendingState;
        pendingState = null;
        if (!snapshot) return;
        try {
            saveStateNow(snapshot);
        } catch (err: any) {
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

export {
    DATA_DIR,
    STATE_FILE,
    loadState,
    saveStateNow,
    scheduleSave,
    flushSave
};
