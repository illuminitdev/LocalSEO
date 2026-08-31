const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let pool = null;

function getPool() {
    if (pool) return pool;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is required. Add a Neon Postgres connection string to backend/.env');
    }
    pool = new Pool({
        connectionString,
        ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
    });
    return pool;
}

async function query(text, params) {
    return getPool().query(text, params);
}

async function migrate() {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    if (!fs.existsSync(migrationsDir)) return;
    const migrationUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    if (!migrationUrl) {
        throw new Error('DATABASE_URL is required. Add a Neon Postgres connection string to backend/.env');
    }
    const migrationPool = new Pool({
        connectionString: migrationUrl,
        ssl: migrationUrl.includes('localhost') ? false : { rejectUnauthorized: false }
    });
    try {
        const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
        for (const file of files) {
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            await migrationPool.query(sql);
        }
    } finally {
        await migrationPool.end();
    }
}

module.exports = { query, getPool, migrate };
