import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import 'dotenv/config';

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run migrations');
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function runFile(file) {
  const sql = await fs.readFile(file, 'utf8');
  if (!sql.trim()) return;
  await client.query(sql);
  console.log(`Applied ${path.basename(file)}`);
}

async function main() {
  await client.connect();
  try {
    await client.query('select pg_advisory_lock(73420126)');
    await runFile(path.resolve('database/schema.sql'));

    const dir = path.resolve('database/migrations');
    let files = [];
    try {
      files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    for (const file of files) await runFile(path.join(dir, file));
    console.log('Aureon Base database is ready.');
  } finally {
    try { await client.query('select pg_advisory_unlock(73420126)'); } catch {}
    await client.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
