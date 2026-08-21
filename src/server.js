import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { v4 as uuid } from 'uuid';
import 'dotenv/config';
import { query } from './db.js';
import { requireAuth, signAccessToken, signRefreshToken, verifyRefreshToken } from './auth.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());

const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || corsOrigins.includes('*') || corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS origin denied'));
  },
  credentials: false,
}));
app.use(express.json({ limit: '256kb' }));

const buckets = new Map();
function rateLimit({ windowMs = 60_000, max = 30 } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > max) return res.status(429).json({ error: 'too_many_requests' });
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
}, 60_000).unref();

const authLimit = rateLimit({ windowMs: 15 * 60_000, max: 20 });
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedEmails = (process.env.ALLOWED_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

async function issueSession(user) {
  const sessionId = uuid();
  const refreshToken = signRefreshToken(user, sessionId);
  const days = Number(process.env.REFRESH_TOKEN_DAYS || 30);
  await query(
    `insert into sessions(id,user_id,refresh_token_hash,expires_at)
     values($1,$2,$3,now()+($4 || ' days')::interval)`,
    [sessionId, user.id, hashToken(refreshToken), String(days)]
  );
  return { access_token: signAccessToken(user), refresh_token: refreshToken };
}

async function projectAccess(slug, userId) {
  const access = await query(
    `select p.id,p.slug,p.name,pu.role from projects p
     join project_users pu on pu.project_id=p.id
     where p.slug=$1 and pu.user_id=$2`,
    [slug, userId]
  );
  return access.rows[0] || null;
}

app.get('/health', async (_req, res) => {
  try {
    await query('select 1');
    res.json({ ok: true, service: 'aureon-base', version: '0.1.0', database: 'online', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, service: 'aureon-base', database: 'offline' });
  }
});

app.post('/auth/register', authLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!emailRegex.test(email) || password.length < 10 || password.length > 128) return res.status(400).json({ error: 'invalid_credentials' });
  if (allowedEmails.length && !allowedEmails.includes(email)) return res.status(403).json({ error: 'email_not_allowed' });

  try {
    const id = uuid();
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      'insert into users(id,email,password_hash) values($1,$2,$3) returning id,email,created_at',
      [id, email, passwordHash]
    );
    const user = result.rows[0];
    await query(
      `insert into project_users(project_id,user_id,role)
       select id,$1,'member' from projects where slug=$2 on conflict do nothing`,
      [id, process.env.DEFAULT_PROJECT_SLUG || 'tradevision']
    );
    await query('insert into audit_logs(user_id,event,metadata) values($1,$2,$3)', [id, 'user.registered', JSON.stringify({ email })]);
    const tokens = await issueSession(user);
    res.status(201).json({ user, ...tokens });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'email_already_exists' });
    console.error('register_error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/auth/login', authLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!emailRegex.test(email) || !password) return res.status(401).json({ error: 'invalid_credentials' });
  try {
    const result = await query('select id,email,password_hash,is_active from users where email=$1', [email]);
    const user = result.rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'invalid_credentials' });
    await query('insert into audit_logs(user_id,event,metadata) values($1,$2,$3)', [user.id, 'user.login', '{}']);
    const tokens = await issueSession(user);
    res.json({ user: { id: user.id, email: user.email }, ...tokens });
  } catch (err) {
    console.error('login_error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/auth/refresh', authLimit, async (req, res) => {
  const refreshToken = String(req.body?.refresh_token || '');
  if (!refreshToken) return res.status(400).json({ error: 'missing_refresh_token' });
  try {
    const payload = verifyRefreshToken(refreshToken);
    const session = await query(
      `select s.id,s.user_id,u.email,u.is_active from sessions s join users u on u.id=s.user_id
       where s.id=$1 and s.user_id=$2 and s.refresh_token_hash=$3 and s.revoked_at is null and s.expires_at>now()`,
      [payload.sid, payload.sub, hashToken(refreshToken)]
    );
    const row = session.rows[0];
    if (!row || !row.is_active) return res.status(401).json({ error: 'invalid_refresh_token' });
    res.json({ access_token: signAccessToken({ id: row.user_id, email: row.email }) });
  } catch {
    res.status(401).json({ error: 'invalid_refresh_token' });
  }
});

app.post('/auth/logout', requireAuth, async (req, res) => {
  const refreshToken = String(req.body?.refresh_token || '');
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      if (payload.sub === req.user.sub) await query('update sessions set revoked_at=now() where id=$1 and user_id=$2', [payload.sid, req.user.sub]);
    } catch {}
  }
  await query('insert into audit_logs(user_id,event,metadata) values($1,$2,$3)', [req.user.sub, 'user.logout', '{}']);
  res.status(204).end();
});

app.get('/me', requireAuth, async (req, res) => {
  const result = await query('select id,email,created_at,is_active from users where id=$1', [req.user.sub]);
  if (!result.rows[0]) return res.status(404).json({ error: 'user_not_found' });
  res.json(result.rows[0]);
});

app.get('/projects', requireAuth, async (req, res) => {
  const result = await query(
    `select p.id,p.slug,p.name,pu.role from projects p
     join project_users pu on pu.project_id=p.id
     where pu.user_id=$1 order by p.name`,
    [req.user.sub]
  );
  res.json(result.rows);
});

app.get('/projects/:slug/operations', requireAuth, async (req, res) => {
  const access = await projectAccess(req.params.slug, req.user.sub);
  if (!access) return res.status(403).json({ error: 'forbidden' });
  const limit = Math.min(Math.max(Number(req.query.limit || 500), 1), 1000);
  const result = await query(
    'select * from trading_operations where project_id=$1 and user_id=$2 order by operated_at desc limit $3',
    [access.id, req.user.sub, limit]
  );
  res.json(result.rows);
});

app.post('/projects/:slug/operations', requireAuth, async (req, res) => {
  const access = await projectAccess(req.params.slug, req.user.sub);
  if (!access) return res.status(403).json({ error: 'forbidden' });
  const asset = String(req.body?.asset || '').trim().toUpperCase();
  const side = String(req.body?.side || '');
  const contracts = Number(req.body?.contracts);
  const resultValue = Number(req.body?.result);
  const stopPlanned = Number(req.body?.stop_planned || 0);
  const setup = String(req.body?.setup || 'Sem setup').trim().slice(0, 80);
  const note = String(req.body?.note || '').trim().slice(0, 1000);
  const operatedAt = new Date(req.body?.operated_at);
  if (!asset || asset.length > 20 || !['Compra','Venda'].includes(side) || !Number.isInteger(contracts) || contracts < 1 || contracts > 1000 || !Number.isFinite(resultValue) || !Number.isFinite(stopPlanned) || stopPlanned < 0 || Number.isNaN(operatedAt.getTime())) {
    return res.status(400).json({ error: 'invalid_operation' });
  }
  const row = await query(
    `insert into trading_operations(id,project_id,user_id,asset,side,contracts,result,stop_planned,setup,note,operated_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [uuid(), access.id, req.user.sub, asset, side, contracts, resultValue, stopPlanned, setup, note, operatedAt.toISOString()]
  );
  res.status(201).json(row.rows[0]);
});

app.delete('/projects/:slug/operations/:id', requireAuth, async (req, res) => {
  const result = await query(
    `delete from trading_operations o using projects p, project_users pu
     where o.id=$1 and o.project_id=p.id and p.slug=$2 and pu.project_id=p.id
       and pu.user_id=$3 and o.user_id=$3 returning o.id`,
    [req.params.id, req.params.slug, req.user.sub]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

app.get('/projects/:slug/settings', requireAuth, async (req, res) => {
  const access = await projectAccess(req.params.slug, req.user.sub);
  if (!access) return res.status(403).json({ error: 'forbidden' });
  const found = await query('select * from trading_settings where project_id=$1 and user_id=$2', [access.id, req.user.sub]);
  res.json(found.rows[0] || { daily_stop: 500, daily_target: 1000, base_contracts: 1, profit_step: 1000, max_contracts: 20 });
});

app.put('/projects/:slug/settings', requireAuth, async (req, res) => {
  const access = await projectAccess(req.params.slug, req.user.sub);
  if (!access) return res.status(403).json({ error: 'forbidden' });
  const values = {
    daily_stop: Number(req.body?.daily_stop), daily_target: Number(req.body?.daily_target),
    base_contracts: Number(req.body?.base_contracts), profit_step: Number(req.body?.profit_step), max_contracts: Number(req.body?.max_contracts),
  };
  if (![values.daily_stop,values.daily_target,values.profit_step].every(v => Number.isFinite(v) && v > 0) || ![values.base_contracts,values.max_contracts].every(v => Number.isInteger(v) && v > 0) || values.max_contracts < values.base_contracts) return res.status(400).json({ error: 'invalid_settings' });
  const saved = await query(
    `insert into trading_settings(project_id,user_id,daily_stop,daily_target,base_contracts,profit_step,max_contracts)
     values($1,$2,$3,$4,$5,$6,$7)
     on conflict(project_id,user_id) do update set daily_stop=excluded.daily_stop,daily_target=excluded.daily_target,base_contracts=excluded.base_contracts,profit_step=excluded.profit_step,max_contracts=excluded.max_contracts,updated_at=now()
     returning *`,
    [access.id, req.user.sub, values.daily_stop, values.daily_target, values.base_contracts, values.profit_step, values.max_contracts]
  );
  res.json(saved.rows[0]);
});

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, _req, res, _next) => {
  console.error('unhandled_error', err);
  res.status(500).json({ error: 'internal_error' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Aureon Base v0.1 listening on :${port}`));
