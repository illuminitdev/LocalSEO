import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

let pool: Pool | null = null;
let cachedDatabaseUrl: string | null = null;
let secretLoadPromise: Promise<string> | null = null;

const SHARED_OWNED_MIGRATIONS = new Set(['005_plans.sql', '006_subscriptions.sql']);

function usesSharedRds() {
    return process.env.SHARED_RDS === 'true' || Boolean(process.env.DB_PROXY_ENDPOINT);
}

function isLocalConnectionString(connectionString: string) {
    return (
        connectionString.includes('localhost') ||
        connectionString.includes('127.0.0.1')
    );
}

async function loadDatabaseUrlFromSecrets() {
    if (cachedDatabaseUrl) return cachedDatabaseUrl;
    if (secretLoadPromise) return secretLoadPromise;

    secretLoadPromise = (async () => {
        const secretArn = process.env.DB_SECRET_ARN;
        const proxyHost = process.env.DB_PROXY_ENDPOINT;
        const dbName = process.env.DB_NAME || 'zappsites';

        if (!secretArn || !proxyHost) {
            throw new Error(
                'DB_SECRET_ARN and DB_PROXY_ENDPOINT are required when DATABASE_URL is not set'
            );
        }

        const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
        const client = new SecretsManagerClient({});
        const result = await client.send(
            new GetSecretValueCommand({ SecretId: secretArn })
        );
        if (!result.SecretString) {
            throw new Error('DB secret has no SecretString');
        }

        const parsed = JSON.parse(result.SecretString);
        const username = parsed.username || process.env.DB_USER || 'zappsites_admin';
        const password = parsed.password;
        if (!password) {
            throw new Error('DB secret missing password');
        }

        const encodedUser = encodeURIComponent(username);
        const encodedPass = encodeURIComponent(password);
        cachedDatabaseUrl =
            `postgresql://${encodedUser}:${encodedPass}@${proxyHost}:5432/${dbName}?sslmode=require`;
        return cachedDatabaseUrl;
    })().finally(() => {
        secretLoadPromise = null;
    });

    return secretLoadPromise;
}

async function resolveDatabaseUrl() {
    if (process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
    }
    return loadDatabaseUrlFromSecrets();
}

function poolConfig(connectionString: string) {
    const local = isLocalConnectionString(connectionString);
    return {
        connectionString,
        ssl: local ? false : { rejectUnauthorized: false }
    };
}

async function getPool() {
    if (pool) return pool;
    const connectionString = await resolveDatabaseUrl();
    pool = new Pool(poolConfig(connectionString));
    return pool;
}

async function query(text: string, params?: any[]) {
    const p = await getPool();
    return p.query(text, params);
}

function resolveMigrationsDir() {
    // Source: backend/lib → backend/migrations; compiled: dist/lib → backend/migrations
    const candidates = [
        path.join(__dirname, '..', 'migrations'),
        path.join(__dirname, '..', '..', 'migrations')
    ];
    return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

async function migrate() {
    const migrationsDir = resolveMigrationsDir();
    if (!fs.existsSync(migrationsDir)) return;

    const connectionString = await resolveDatabaseUrl();
    const migrationPool = new Pool(poolConfig(connectionString));
    const skipShared = usesSharedRds();

    try {
        const files = fs
            .readdirSync(migrationsDir)
            .filter((f) => f.endsWith('.sql'))
            .sort();

        for (const file of files) {
            if (skipShared && SHARED_OWNED_MIGRATIONS.has(file)) {
                console.log(`[db] Skipping ${file} (ZappSites owns plans/subscriptions on shared RDS)`);
                continue;
            }
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            await migrationPool.query(sql);
        }
    } finally {
        await migrationPool.end();
    }
}

export {
    query,
    getPool,
    migrate,
    usesSharedRds,
    resolveDatabaseUrl
};
