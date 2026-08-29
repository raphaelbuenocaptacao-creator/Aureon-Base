import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { v4 as uuid } from 'uuid';
import 'dotenv/config';
import { query, databaseHealth, withTransaction } from './db.js';
import { requireAuth, signAccessToken, signRefreshToken, verifyRefreshToken } from './auth.js';
import { registerPlatformDataRoutes } from './platformData.js';
import { registerPlatformAdminRoutes } from './platformAdmin.js';
import { registerConsoleRoutes } from './console.js';
import { issuePasswordResetToken, consumePasswordResetToken, hashResetToken } from './passwordRecovery.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());

const builtInOrigins = [
  'https://raphaelbuenocaptacao-creator.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];
const configuredOrigins = (process.env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
const corsOrigins = new Set([...builtInOrigins, ...configuredOrigins]);
app.use(cors({
  origin(origin, cb) {
    if (!origin || corsOrigins.has('*') || corsOrigins.has(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '256kb' }));

const buckets = new Map();
function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
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
const resetRequestLimit = rateLimit({ windowMs: 15 * 60_000, max: 5 });
const apiLimit = rateLimit({ windowMs: 60_000, max: 180 });
app.use(apiLimit);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedEmails = (process.env.ALLOWED_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
const lifetimeEmails = (process.env.LIFETIME_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
const hashToken = token => crypto.createHash('sha256').update(String(token)).digest('hex');

async function sendRecoveryEmail(email, token) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.MAIL_FROM || 'TradeVision <onboarding@resend.dev>').trim();
  if (!apiKey) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Recuperação de senha — Aureon Base',
        html: `<div style="font-family:Arial,sans-serif;background:#0b1117;color:#e8eef3;padding:28px"><div style="max-width:520px;margin:auto;background:#111b24;border:1px solid #263746;border-radius:14px;padding:28px"><h2 style="margin-top:0">Aureon Base</h2><p>Recebemos uma solicitação para redefinir sua senha.</p><p style="font-size:18px;word-break:break-all;font-weight:700;color:#00a8d6">${token}</p><p>Este token é de uso único e expira em aproximadamente 10 minutos.</p><p style="color:#8293a1;font-size:13px">Se você não solicitou a alteração, ignore este e-mail.</p></div></div>`,
      }),
    });
    if (!response.ok) console.error('recovery_email_error', response.status);
    return response.ok;
  } catch (err) {
    console.error('recovery_email_error', err.message);
    return false;
  }
}

async function requireSuperAdmin(req, res, next) {
  try {
    const found = await query('select id from users where id=$1 and is_active=true and is_superadmin=true', [req.user.sub]);
    if (!found.rows[0]) return res.status(403).json({ error: 'admin_required' });
    next();
  } catch (err) {
    console.error('admin_check_error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function audit({ userId = null, projectId = null, event, req, metadata = {} }) {
  try {
    await query('insert into audit_logs(user_id,project_id,event,ip,metadata) values($1,$2,$3,$4,$5)', [userId, projectId, event, req?.ip || null, JSON.stringify(metadata)]);
  } catch (err) {
    console.error('audit_error', err.message);
  }
}

async function issueSession(user) {
  const sessionId = uuid();
  const refreshToken = signRefreshToken(user, sessionId);
  const days = Math.min(Math.max(Number(process.env.REFRESH_TOKEN_DAYS || 30), 1), 365);
  await query(`insert into sessions(id,user_id,refresh_token_hash,expires_at) values($1,$2,$3,now()+($4 || ' days')::interval)`, [sessionId, user.id, hashToken(refreshToken), String(days)]);
  return { access_token: signAccessToken(user), refresh_token: refreshToken };
}

async function projectBySlug(slug) {
  const result = await query('select id,slug,name,trial_days,is_active from projects where slug=$1', [slug]);
  return result.rows[0] || null;
}

async function projectMembership(slug, userId) {
  const result = await query(`select p.id,p.slug,p.name,p.trial_days,p.is_active,pu.role from projects p join project_users pu on pu.project_id=p.id where p.slug=$1 and pu.user_id=$2`, [slug, userId]);
  return result.rows[0] || null;
}

async function subscriptionFor(projectId, userId) {
  const result = await query(`select s.*,pl.code as plan_code,pl.name as plan_name,pl.price_cents,pl.currency,pl.interval from subscriptions s left join plans pl on pl.id=s.plan_id where s.project_id=$1 and s.user_id=$2`, [projectId, userId]);
  return result.rows[0] || null;
}

function accessState(subscription) {
  if (!subscription) return { allowed: false, status: 'none', reason: 'no_subscription' };
  if (subscription.status === 'lifetime') return { allowed: true, status: 'lifetime', reason: null };
  if (subscription.status === 'active' && (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())) return { allowed: true, status: 'active', reason: null };
  if (subscription.status === 'trialing' && subscription.trial_ends_at && new Date(subscription.trial_ends_at) > new Date()) {
    const ms = new Date(subscription.trial_ends_at) - new Date();
    return { allowed: true, status: 'trialing', reason: null, trial_days_remaining: Math.max(0, Math.ceil(ms / 86400000)) };
  }
  return { allowed: false, status: subscription.status, reason: subscription.status === 'trialing' ? 'trial_expired' : 'subscription_inactive' };
}

async function ensureProjectAccess(req, res) {
  const membership = await projectMembership(req.params.slug, req.user.sub);
  if (!membership || !membership.is_active) {
    res.status(403).json({ error: 'project_forbidden' });
    return null;
  }
  const subscription = await subscriptionFor(membership.id, req.user.sub);
  const access = accessState(subscription);
  if (!access.allowed) {
    res.status(402).json({ error: 'subscription_required', access, subscription });
    return null;
  }
  return { membership, subscription, access };
}

async function enrollUser({ userId, email, project }) {
  await query(`insert into project_users(project_id,user_id,role) values($1,$2,'member') on conflict(project_id,user_id) do nothing`, [project.id, userId]);
  if (lifetimeEmails.includes(email)) {
    await query(`insert into subscriptions(project_id,user_id,status) values($1,$2,'lifetime') on conflict(project_id,user_id) do update set status='lifetime',updated_at=now()`, [project.id, userId]);
    return;
  }
  await query(`insert into subscriptions(project_id,user_id,status,trial_started_at,trial_ends_at) values($1,$2,'trialing',now(),now()+($3 || ' days')::interval) on conflict(project_id,user_id) do nothing`, [project.id, userId, String(project.trial_days)]);
}

registerConsoleRoutes({ app });

app.get('/health', (_req, res) => res.json({ ok: true, service: 'aureon-base', version: '0.6.0', time: new Date().toISOString() }));
app.get('/ready', async (_req, res) => {
  const health = await databaseHealth();
  if (health.ok) return res.json({ ok: true, database: 'online', ...health });
  return res.status(503).json({ ok: false, database: 'offline', ...health });
});

app.post('/auth/register', authLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const projectSlug = String(req.body?.project_slug || process.env.DEFAULT_PROJECT_SLUG || 'tradevision').trim().toLowerCase();
  if (!emailRegex.test(email) || password.length < 10 || password.length > 128) return res.status(400).json({ error: 'invalid_credentials' });
  if (allowedEmails.length && !allowedEmails.includes(email)) return res.status(403).json({ error: 'email_not_allowed' });
  const project = await projectBySlug(projectSlug);
  if (!project || !project.is_active) return res.status(404).json({ error: 'project_not_found' });
  try {
    const id = uuid();
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query('insert into users(id,email,password_hash) values($1,$2,$3) returning id,email,created_at', [id, email, passwordHash]);
    const user = result.rows[0];
    await enrollUser({ userId: id, email, project });
    await audit({ userId: id, projectId: project.id, event: 'user.registered', req, metadata: { email, project: project.slug } });
    const tokens = await issueSession(user);
    const subscription = await subscriptionFor(project.id, id);
    res.status(201).json({ user, project: { slug: project.slug, name: project.name }, subscription, access: accessState(subscription), ...tokens });
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
    const result = await query('select id,email,password_hash,is_active,is_superadmin from users where email=$1', [email]);
    const user = result.rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'invalid_credentials' });
    await audit({ userId: user.id, event: 'user.login', req });
    const tokens = await issueSession(user);
    res.json({ user: { id: user.id, email: user.email, is_superadmin: user.is_superadmin }, ...tokens });
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
    const session = await query(`select s.id,s.user_id,u.email,u.is_active from sessions s join users u on u.id=s.user_id where s.id=$1 and s.user_id=$2 and s.refresh_token_hash=$3 and s.revoked_at is null and s.expires_at>now()`, [payload.sid, payload.sub, hashToken(refreshToken)]);
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
  await audit({ userId: req.user.sub, event: 'user.logout', req });
  res.status(204).end();
});

app.post('/auth/change-password', authLimit, requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.current_password || '');
  const newPassword = String(req.body?.new_password || '');
  if (newPassword.length < 10 || newPassword.length > 128 || newPassword === currentPassword) return res.status(400).json({ error: 'invalid_new_password' });
  try {
    const found = await query('select id,password_hash from users where id=$1 and is_active=true', [req.user.sub]);
    const user = found.rows[0];
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) return res.status(401).json({ error: 'invalid_current_password' });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await query('update users set password_hash=$1,updated_at=now() where id=$2', [passwordHash, req.user.sub]);
    await query('update sessions set revoked_at=now() where user_id=$1 and revoked_at is null', [req.user.sub]);
    await audit({ userId: req.user.sub, event: 'user.password_changed', req });
    res.status(204).end();
  } catch (err) {
    console.error('change_password_error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/auth/request-password-reset', resetRequestLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!emailRegex.test(email)) return res.status(202).json({ ok: true });
  try {
    const found = await query('select id,email,is_active from users where email=$1', [email]);
    const user = found.rows[0];
    if (!user || !user.is_active) return res.status(202).json({ ok: true });
    const issued = await issuePasswordResetToken({ query, userId: user.id, requestedIp: req.ip });
    const sent = await sendRecoveryEmail(user.email, issued.token);
    if (!sent) {
      await query(
        'update password_reset_tokens set used_at=coalesce(used_at,now()) where user_id=$1 and token_hash=$2 and used_at is null',
        [user.id, hashResetToken(issued.token)],
      );
    }
    await audit({ userId: user.id, event: 'user.password_reset_requested', req, metadata: { delivered: sent, expires_in_minutes: issued.expiresInMinutes } });
    return res.status(202).json({ ok: true });
  } catch (err) {
    console.error('request_password_reset_error', err);
    return res.status(202).json({ ok: true });
  }
});

app.post('/auth/reset-password', authLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const token = String(req.body?.token || req.body?.code || '').trim();
  const newPassword = String(req.body?.new_password || '');
  if (!emailRegex.test(email) || !/^[A-Za-z0-9_-]{32,128}$/.test(token) || newPassword.length < 10 || newPassword.length > 128) return res.status(400).json({ error: 'invalid_reset' });
  try {
    const found = await query('select id,email,is_active from users where email=$1', [email]);
    const user = found.rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'invalid_reset_token' });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const completed = await withTransaction(async transactionQuery => {
      const valid = await consumePasswordResetToken({ query: transactionQuery, userId: user.id, token });
      if (!valid) return false;
      await transactionQuery('update users set password_hash=$1,updated_at=now() where id=$2', [passwordHash, user.id]);
      await transactionQuery('update sessions set revoked_at=now() where user_id=$1 and revoked_at is null', [user.id]);
      await transactionQuery('update password_reset_tokens set used_at=coalesce(used_at,now()) where user_id=$1 and used_at is null', [user.id]);
      return true;
    });
    if (!completed) return res.status(401).json({ error: 'invalid_reset_token' });
    await audit({ userId: user.id, event: 'user.password_reset', req });
    res.status(204).end();
  } catch (err) {
    console.error('reset_password_error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/me', requireAuth, async (req, res) => {
  const result = await query('select id,email,created_at,is_active,is_superadmin from users where id=$1', [req.user.sub]);
  if (!result.rows[0]) return res.status(404).json({ error: 'user_not_found' });
  res.json(result.rows[0]);
});

app.get('/projects', requireAuth, async (req, res) => {
  const result = await query(`select p.id,p.slug,p.name,p.trial_days,pu.role,s.status,s.trial_ends_at,s.current_period_end,pl.code as plan_code,pl.name as plan_name from projects p join project_users pu on pu.project_id=p.id left join subscriptions s on s.project_id=p.id and s.user_id=pu.user_id left join plans pl on pl.id=s.plan_id where pu.user_id=$1 and p.is_active=true order by p.name`, [req.user.sub]);
  res.json(result.rows.map(row => ({ ...row, access: accessState(row) })));
});

app.get('/projects/:slug/access', requireAuth, async (req, res) => {
  const membership = await projectMembership(req.params.slug, req.user.sub);
  if (!membership) return res.status(403).json({ error: 'project_forbidden' });
  const subscription = await subscriptionFor(membership.id, req.user.sub);
  res.json({ project: membership, subscription, access: accessState(subscription) });
});

app.get('/projects/:slug/plans', async (req, res) => {
  const project = await projectBySlug(req.params.slug);
  if (!project || !project.is_active) return res.status(404).json({ error: 'project_not_found' });
  const plans = await query('select code,name,price_cents,currency,interval,features from plans where project_id=$1 and is_active=true order by price_cents', [project.id]);
  res.json(plans.rows);
});

app.get('/admin/projects/:slug/users', requireAuth, requireSuperAdmin, async (req, res) => {
  const project = await projectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'project_not_found' });
  const result = await query(`select u.id,u.email,u.is_active,u.is_superadmin,u.created_at,pu.role,s.status,s.trial_ends_at,s.current_period_end,pl.code as plan_code from project_users pu join users u on u.id=pu.user_id left join subscriptions s on s.project_id=pu.project_id and s.user_id=pu.user_id left join plans pl on pl.id=s.plan_id where pu.project_id=$1 order by u.created_at desc`, [project.id]);
  res.json(result.rows.map(row => ({ ...row, access: accessState(row) })));
});

app.post('/admin/users/:userId/reset-code', requireAuth, requireSuperAdmin, async (req, res) => {
  const found = await query('select id,email,is_active from users where id=$1', [req.params.userId]);
  const user = found.rows[0];
  if (!user || !user.is_active) return res.status(404).json({ error: 'user_not_found' });
  const issued = await issuePasswordResetToken({ query, userId: user.id, requestedIp: req.ip });
  await audit({ userId: req.user.sub, event: 'admin.reset_token_generated', req, metadata: { target_user_id: user.id, expires_in_minutes: issued.expiresInMinutes } });
  res.json({ email: user.email, token: issued.token, expires_in_minutes: issued.expiresInMinutes });
});

app.put('/admin/projects/:slug/users/:userId/access', requireAuth, requireSuperAdmin, async (req, res) => {
  const status = String(req.body?.status || '');
  const role = String(req.body?.role || '');
  if (!['trialing', 'active', 'lifetime', 'inactive'].includes(status) || !['member', 'owner'].includes(role)) return res.status(400).json({ error: 'invalid_access_update' });
  const project = await projectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'project_not_found' });
  const user = await query('select id from users where id=$1', [req.params.userId]);
  if (!user.rows[0]) return res.status(404).json({ error: 'user_not_found' });
  await query('update project_users set role=$1 where project_id=$2 and user_id=$3', [role, project.id, req.params.userId]);
  if (status === 'trialing') {
    await query(`insert into subscriptions(project_id,user_id,status,trial_started_at,trial_ends_at) values($1,$2,'trialing',now(),now()+($3 || ' days')::interval) on conflict(project_id,user_id) do update set status='trialing',trial_started_at=now(),trial_ends_at=now()+($3 || ' days')::interval,current_period_end=null,updated_at=now()`, [project.id, req.params.userId, String(project.trial_days)]);
  } else if (status === 'lifetime') {
    await query(`insert into subscriptions(project_id,user_id,status) values($1,$2,'lifetime') on conflict(project_id,user_id) do update set status='lifetime',trial_ends_at=null,current_period_end=null,updated_at=now()`, [project.id, req.params.userId]);
  } else if (status === 'active') {
    await query(`insert into subscriptions(project_id,user_id,status) values($1,$2,'active') on conflict(project_id,user_id) do update set status='active',trial_ends_at=null,current_period_end=null,updated_at=now()`, [project.id, req.params.userId]);
  } else {
    await query(`insert into subscriptions(project_id,user_id,status) values($1,$2,'inactive') on conflict(project_id,user_id) do update set status='inactive',trial_ends_at=null,current_period_end=null,updated_at=now()`, [project.id, req.params.userId]);
  }
  await audit({ userId: req.user.sub, projectId: project.id, event: 'admin.user_access_updated', req, metadata: { target_user_id: req.params.userId, status, role } });
  const subscription = await subscriptionFor(project.id, req.params.userId);
  res.json({ role, subscription, access: accessState(subscription) });
});

app.get('/projects/:slug/operations', requireAuth, async (req, res) => {
  const ctx = await ensureProjectAccess(req, res); if (!ctx) return;
  const limit = Math.min(Math.max(Number(req.query.limit || 500), 1), 1000);
  const result = await query('select * from trading_operations where project_id=$1 and user_id=$2 order by operated_at desc limit $3', [ctx.membership.id, req.user.sub, limit]);
  res.json(result.rows);
});

app.post('/projects/:slug/operations', requireAuth, async (req, res) => {
  const ctx = await ensureProjectAccess(req, res); if (!ctx) return;
  const asset = String(req.body?.asset || '').trim().toUpperCase();
  const side = String(req.body?.side || '');
  const contracts = Number(req.body?.contracts);
  const resultValue = Number(req.body?.result);
  const stopPlanned = Number(req.body?.stop_planned || 0);
  const setup = String(req.body?.setup || 'Sem setup').trim().slice(0, 80);
  const note = String(req.body?.note || '').trim().slice(0, 1000);
  const operatedAt = new Date(req.body?.operated_at);
  if (!asset || asset.length > 20 || !['Compra', 'Venda'].includes(side) || !Number.isInteger(contracts) || contracts < 1 || contracts > 1000 || !Number.isFinite(resultValue) || !Number.isFinite(stopPlanned) || stopPlanned < 0 || Number.isNaN(operatedAt.getTime())) return res.status(400).json({ error: 'invalid_operation' });
  const row = await query(`insert into trading_operations(id,project_id,user_id,asset,side,contracts,result,stop_planned,setup,note,operated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`, [uuid(), ctx.membership.id, req.user.sub, asset, side, contracts, resultValue, stopPlanned, setup, note, operatedAt.toISOString()]);
  await audit({ userId: req.user.sub, projectId: ctx.membership.id, event: 'trade.operation.created', req, metadata: { operation_id: row.rows[0].id } });
  res.status(201).json(row.rows[0]);
});

app.delete('/projects/:slug/operations/:id', requireAuth, async (req, res) => {
  const ctx = await ensureProjectAccess(req, res); if (!ctx) return;
  const result = await query('delete from trading_operations where id=$1 and project_id=$2 and user_id=$3 returning id', [req.params.id, ctx.membership.id, req.user.sub]);
  if (!result.rows[0]) return res.status(404).json({ error: 'not_found' });
  await audit({ userId: req.user.sub, projectId: ctx.membership.id, event: 'trade.operation.deleted', req, metadata: { operation_id: req.params.id } });
  res.status(204).end();
});

app.get('/projects/:slug/settings', requireAuth, async (req, res) => {
  const ctx = await ensureProjectAccess(req, res); if (!ctx) return;
  const found = await query('select * from trading_settings where project_id=$1 and user_id=$2', [ctx.membership.id, req.user.sub]);
  res.json(found.rows[0] || { daily_stop: 500, daily_target: 1000, base_contracts: 1, profit_step: 1000, max_contracts: 20 });
});

app.put('/projects/:slug/settings', requireAuth, async (req, res) => {
  const ctx = await ensureProjectAccess(req, res); if (!ctx) return;
  const values = { daily_stop: Number(req.body?.daily_stop), daily_target: Number(req.body?.daily_target), base_contracts: Number(req.body?.base_contracts), profit_step: Number(req.body?.profit_step), max_contracts: Number(req.body?.max_contracts) };
  if (![values.daily_stop, values.daily_target, values.profit_step].every(v => Number.isFinite(v) && v > 0) || ![values.base_contracts, values.max_contracts].every(v => Number.isInteger(v) && v > 0) || values.max_contracts < values.base_contracts) return res.status(400).json({ error: 'invalid_settings' });
  const saved = await query(`insert into trading_settings(project_id,user_id,daily_stop,daily_target,base_contracts,profit_step,max_contracts) values($1,$2,$3,$4,$5,$6,$7) on conflict(project_id,user_id) do update set daily_stop=excluded.daily_stop,daily_target=excluded.daily_target,base_contracts=excluded.base_contracts,profit_step=excluded.profit_step,max_contracts=excluded.max_contracts,updated_at=now() returning *`, [ctx.membership.id, req.user.sub, values.daily_stop, values.daily_target, values.base_contracts, values.profit_step, values.max_contracts]);
  res.json(saved.rows[0]);
});

registerPlatformDataRoutes({
  app,
  query,
  requireAuth,
  projectMembership,
  subscriptionFor,
  accessState,
  audit,
});

registerPlatformAdminRoutes({
  app,
  query,
  requireAuth,
  requireSuperAdmin,
  projectBySlug,
  audit,
});

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, _req, res, _next) => {
  console.error('unhandled_error', err);
  res.status(500).json({ error: 'internal_error' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Aureon Base v0.6.0 listening on :${port}`));
