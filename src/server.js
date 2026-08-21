import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import 'dotenv/config';
import { query } from './db.js';
import { requireAuth, signAccessToken } from './auth.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGINS || '*').split(',').map(v => v.trim()) }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (_req, res) => {
  try {
    await query('select 1');
    res.json({ ok: true, service: 'aureon-base', version: '0.1.0', database: 'online' });
  } catch {
    res.status(503).json({ ok: false, database: 'offline' });
  }
});

app.post('/auth/register', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || password.length < 8) return res.status(400).json({ error: 'invalid_credentials' });

  try {
    const id = uuid();
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      'insert into users(id,email,password_hash) values($1,$2,$3) returning id,email,created_at',
      [id, email, passwordHash]
    );
    const user = result.rows[0];
    await query('insert into audit_logs(user_id,event,metadata) values($1,$2,$3)', [id, 'user.registered', JSON.stringify({ email })]);
    res.status(201).json({ user, access_token: signAccessToken(user) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'email_already_exists' });
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const result = await query('select id,email,password_hash,is_active from users where email=$1', [email]);
  const user = result.rows[0];
  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  await query('insert into audit_logs(user_id,event,metadata) values($1,$2,$3)', [user.id, 'user.login', '{}']);
  res.json({ user: { id: user.id, email: user.email }, access_token: signAccessToken(user) });
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
  const access = await query(
    `select p.id from projects p join project_users pu on pu.project_id=p.id
     where p.slug=$1 and pu.user_id=$2`, [req.params.slug, req.user.sub]
  );
  if (!access.rows[0]) return res.status(403).json({ error: 'forbidden' });
  const result = await query(
    'select * from trading_operations where project_id=$1 and user_id=$2 order by operated_at desc',
    [access.rows[0].id, req.user.sub]
  );
  res.json(result.rows);
});

app.post('/projects/:slug/operations', requireAuth, async (req, res) => {
  const access = await query(
    `select p.id from projects p join project_users pu on pu.project_id=p.id
     where p.slug=$1 and pu.user_id=$2`, [req.params.slug, req.user.sub]
  );
  if (!access.rows[0]) return res.status(403).json({ error: 'forbidden' });
  const { asset, side, contracts, result, stop_planned = 0, setup = 'Sem setup', note = '', operated_at } = req.body;
  if (!asset || !side || !contracts || result === undefined || !operated_at) return res.status(400).json({ error: 'missing_fields' });
  const row = await query(
    `insert into trading_operations(id,project_id,user_id,asset,side,contracts,result,stop_planned,setup,note,operated_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [uuid(), access.rows[0].id, req.user.sub, asset, side, contracts, result, stop_planned, setup, note, operated_at]
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

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Aureon Base v0.1 listening on :${port}`));
