import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

function resolveDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.NEON_DATABASE_URL ||
    ''
  );
}

const connectionString = resolveDatabaseUrl();

export const databaseConfig = {
  configured: Boolean(connectionString),
  source: process.env.DATABASE_URL ? 'DATABASE_URL'
    : process.env.DATABASE_URL_UNPOOLED ? 'DATABASE_URL_UNPOOLED'
    : process.env.POSTGRES_URL ? 'POSTGRES_URL'
    : process.env.POSTGRES_URL_NON_POOLING ? 'POSTGRES_URL_NON_POOLING'
    : process.env.NEON_DATABASE_URL ? 'NEON_DATABASE_URL'
    : null,
};

export const pool = new Pool({
  connectionString: connectionString || undefined,
  ssl: process.env.NODE_ENV === 'production' && connectionString
    ? { rejectUnauthorized: false }
    : false,
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
