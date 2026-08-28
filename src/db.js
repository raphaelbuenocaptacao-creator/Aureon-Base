import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const tradeVisionOrigin = 'https://raphaelbuenocaptacao-creator.github.io';
const configuredOrigins = (process.env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
if (!configuredOrigins.includes('*') && !configuredOrigins.includes(tradeVisionOrigin)) {
  process.env.CORS_ORIGINS = [...configuredOrigins, tradeVisionOrigin].join(',');
}

function resolveDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.STORAGE_URL ||
    process.env.STORAGE_URL_UNPOOLED ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.NEON_DATABASE_URL ||
    ''
  );
}

function normalizeProductionSslMode(value) {
  if (!value || process.env.NODE_ENV !== 'production') return value;

  try {
    const url = new URL(value);
    const sslMode = url.searchParams.get('sslmode');
    if (['prefer', 'require', 'verify-ca'].includes(sslMode)) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return value;
  }
}

const rawConnectionString = resolveDatabaseUrl();
const connectionString = normalizeProductionSslMode(rawConnectionString);

export const databaseConfig = {
  configured: Boolean(connectionString),
  source: process.env.DATABASE_URL ? 'DATABASE_URL'
    : process.env.DATABASE_URL_UNPOOLED ? 'DATABASE_URL_UNPOOLED'
    : process.env.STORAGE_URL ? 'STORAGE_URL'
    : process.env.STORAGE_URL_UNPOOLED ? 'STORAGE_URL_UNPOOLED'
    : process.env.POSTGRES_URL ? 'POSTGRES_URL'
    : process.env.POSTGRES_URL_NON_POOLING ? 'POSTGRES_URL_NON_POOLING'
    : process.env.NEON_DATABASE_URL ? 'NEON_DATABASE_URL'
    : null,
};

export const pool = new Pool({
  connectionString: connectionString || undefined,
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

export async function query(text, params = []) {
  if (!connectionString) {
    const error = new Error('database_not_configured');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }
  return pool.query(text, params);
}

export async function withTransaction(operation) {
  if (!connectionString) {
    const error = new Error('database_not_configured');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }
  if (typeof operation !== 'function') {
    const error = new TypeError('transaction_operation_required');
    error.code = 'INVALID_TRANSACTION_OPERATION';
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const transactionQuery = (text, params = []) => client.query(text, params);
    const result = await operation(transactionQuery);
    await client.query('commit');
    return result;
  } catch (error) {
    try { await client.query('rollback'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function withTenantContext({ userId, projectId }, operation) {
  if (!connectionString) {
    const error = new Error('database_not_configured');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }
  if (!userId || !projectId || typeof operation !== 'function') {
    const error = new Error('invalid_tenant_context');
    error.code = 'INVALID_TENANT_CONTEXT';
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role aureon_app');
    await client.query("select set_config('aureon.user_id', $1, true), set_config('aureon.project_id', $2, true)", [String(userId), String(projectId)]);
    const scopedQuery = (text, params = []) => client.query(text, params);
    const result = await operation(scopedQuery);
    await client.query('commit');
    return result;
  } catch (error) {
    try { await client.query('rollback'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function databaseHealth() {
  if (!connectionString) {
    return { ok: false, configured: false, source: null, code: 'DATABASE_NOT_CONFIGURED' };
  }
  try {
    const result = await pool.query('select current_database() as database, version() as version');
    const row = result.rows[0] || {};
    return {
      ok: true,
      configured: true,
      source: databaseConfig.source,
      database: row.database || null,
      engine: String(row.version || '').split(' ').slice(0, 2).join(' ') || 'PostgreSQL',
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      source: databaseConfig.source,
      code: error.code || 'DATABASE_CONNECTION_FAILED',
      message: String(error.message || 'database_connection_failed').replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted]'),
    };
  }
}
