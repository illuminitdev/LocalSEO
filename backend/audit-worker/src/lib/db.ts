import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let poolInit: Promise<pg.Pool> | null = null;

async function resolveDatabaseUrl(): Promise<string> {
  if (config.databaseUrl) return config.databaseUrl;

  if (config.dbSecretArn && config.dbProxyEndpoint) {
    const { SecretsManagerClient, GetSecretValueCommand } = await import(
      '@aws-sdk/client-secrets-manager'
    );
    const client = new SecretsManagerClient({});
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: config.dbSecretArn })
    );
    const secret = JSON.parse(response.SecretString || '{}') as {
      username?: string;
      password?: string;
    };
    const user = encodeURIComponent(secret.username || config.dbUser);
    const password = encodeURIComponent(secret.password || '');
    return `postgresql://${user}:${password}@${config.dbProxyEndpoint}:5432/${config.dbName}?sslmode=require`;
  }

  throw new Error('DATABASE_URL is not configured');
}

export function isDatabaseEnabled(): boolean {
  return Boolean(config.databaseUrl) || Boolean(config.dbSecretArn && config.dbProxyEndpoint);
}

async function ensurePool(): Promise<pg.Pool> {
  if (pool) return pool;
  if (!poolInit) {
    poolInit = (async () => {
      const connectionString = await resolveDatabaseUrl();
      pool = new Pool({
        connectionString,
        max: config.isLambda ? 2 : 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: connectionString.includes('amazonaws.com') ? { rejectUnauthorized: false } : undefined
      });
      return pool;
    })();
  }
  return poolInit;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const activePool = await ensurePool();
  return activePool.query<T>(text, params);
}
