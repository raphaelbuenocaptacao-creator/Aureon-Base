import crypto from 'node:crypto';

const slugPattern = /^[a-z][a-z0-9-]{1,62}$/;
const collectionPattern = /^[a-z][a-z0-9_]{1,62}$/;
const keyNamePattern = /^[A-Za-z0-9 _.-]{2,80}$/;
const allowedScopes = new Set(['read', 'write', 'admin']);
const hashKey = value => crypto.createHash('sha256').update(String(value)).digest('hex');

export function registerPlatformAdminRoutes({ app, query, requireAuth, requireSuperAdmin, projectBySlug, audit }) {
  app.get('/v1/admin/overview', requireAuth, requireSuperAdmin, async (_req, res) => {
    const [projects, users, records, logs, sessions] = await Promise.all([
      query('select count(*)::int as count from projects where is_active=true'),
      query('select count(*)::int as count from users where is_active=true'),
      query('select count(*)::int as count from project_records'),
      query('select count(*)::int as count from audit_logs'),
      query('select count(*)::int as count from sessions where revoked_at is null and expires_at>now()'),
    ]);
    res.json({
      projects: projects.rows[0].count,
      users: users.rows[0].count,
      records: records.rows[0].count,
      audit_events: logs.rows[0].count,
      active_sessions: sessions.rows[0].count,
    });
  });

  app.get('/v1/admin/projects', requireAuth, requireSuperAdmin, async (_req, res) => {
    const result = await query(`
      select p.id,p.slug,p.name,p.trial_days,p.is_active,p.github_repo,p.github_url,p.created_at,
             count(distinct pu.user_id)::int as users,
             count(distinct pc.name)::int as collections,
             count(distinct pr.id)::int as records
      from projects p
      left join project_users pu on pu.project_id=p.id
      left join project_collections pc on pc.project_id=p.id
      left join project_records pr on pr.project_id=p.id
      group by p.id
      order by p.created_at desc
    `);
    res.json(result.rows);
  });

  app.post('/v1/admin/projects', requireAuth, requireSuperAdmin, async (req, res) => {
    const slug = String(req.body?.slug || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim().slice(0, 120);
    const trialDays = Math.min(Math.max(Number(req.body?.trial_days ?? 0), 0), 90);
    if (!slugPattern.test(slug) || !name) return res.status(400).json({ error: 'invalid_project' });
    try {
      const saved = await query(
        'insert into projects(slug,name,trial_days) values($1,$2,$3) returning id,slug,name,trial_days,is_active,created_at',
        [slug, name, trialDays],
      );
      await query(`insert into project_environments(project_id,name) select $1,x from unnest(array['development','preview','production']) x on conflict(project_id,name) do nothing`, [saved.rows[0].id]);
      await audit({ userId: req.user.sub, projectId: saved.rows[0].id, event: 'platform.project.created', req, metadata: { slug } });
      res.status(201).json(saved.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'project_already_exists' });
      throw err;
    }
  });

  app.get('/v1/admin/projects/:slug/environments', requireAuth, requireSuperAdmin, async (req, res) => {
    const project = await projectBySlug(req.params.slug);
    if (!project) return res.status(404).json({ error: 'project_not_found' });
    const result = await query(`
      select e.id,e.name,e.is_active,e.created_at,count(r.id)::int as records
      from project_environments e
      left join project_records r on r.project_id=e.project_id and r.environment_id=e.id
      where e.project_id=$1
      group by e.id
      order by case e.name when 'production' then 1 when 'preview' then 2 else 3 end
    `, [project.id]);
    res.json(result.rows);
  });

  app.get('/v1/admin/projects/:slug/collections', requireAuth, requireSuperAdmin, async (req, res) => {
    const project = await projectBySlug(req.params.slug);
    if (!project) return res.status(404).json({ error: 'project_not_found' });
    const result = await query(`
      select c.name,c.owner_scoped,c.public_read,c.created_at,count(r.id)::int as records
      from project_collections c
      left join project_records r on r.project_id=c.project_id and r.collection=c.name
      where c.project_id=$1
      group by c.project_id,c.name,c.owner_scoped,c.public_read,c.created_at
      order by c.name
    `, [project.id]);
    res.json(result.rows);
  });

  app.post('/v1/admin/projects/:slug/collections', requireAuth, requireSuperAdmin, async (req, res) => {
    const project = await projectBySlug(req.params.slug);
    if (!project) return res.status(404).json({ error: 'project_not_found' });
    const name = String(req.body?.name || '').trim().toLowerCase();
    const ownerScoped = req.body?.owner_scoped !== false;
    const publicRead = req.body?.public_read === true;
    if (!collectionPattern.test(name)) return res.status(400).json({ error: 'invalid_collection' });
    try {
      const saved = await query(
        'insert into project_collections(project_id,name,owner_scoped,public_read) values($1,$2,$3,$4) returning name,owner_scoped,public_read,created_at',
        [project.id, name, ownerScoped, publicRead],
      );
      await audit({ userId: req.user.sub, projectId: project.id, event: 'platform.collection.created', req, metadata: { collection: name } });
      res.status(201).json(saved.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'collection_already_exists' });
      throw err;
    }
  });

  app.put('/v1/admin/projects/:slug/collections/:name', requireAuth, requireSuperAdmin, async (req, res) => {
    const project = await projectBySlug(req.params.slug);
    if (!project) return res.status(404).json({ error: 'project_not_found' });
    const name = String(req.params.name || '').trim().toLowerCase();
    if (!collectionPattern.test(name)) return res.status(400).json({ error: 'invalid_collection' });
    const ownerScoped = req.body?.owner_scoped !== false;
    const publicRead = req.body?.public_read === true;
    const saved = await query(
      'update project_collections set owner_scoped=$1,public_read=$2 where project_id=$3 and name=$4 returning name,owner_scoped,public_read,created_at',
      [ownerScoped, publicRead, project.id, name],
    );
    if (!saved.rows[0]) return res.status(404).json({ error: 'collection_not_found' });
    await audit({ userId: req.user.sub, projectId: project.id, event: 'platform.collection.updated', req, metadata: { collection: name } });
    res.json(saved.rows[0]);
  });

  app.get('/v1/admin/projects/:slug/keys', requireAuth, requireSuperAdmin, async (req, res) => {
    const project = await projectBySlug(req.params.slug);
    if (!project) return res.status(404).json({ error: 'project_not_found' });
    const result = await query(`
      select id,name,key_prefix,scopes,is_active,last_used_at,expires_at,created_at
      from api_keys
      where project_id=$1
      order by created_at desc
    `, [project.id]);
    res.json(result.rows);
  });

  app.post('/v1/admin/projects/:slug/keys', requireAuth, requireSuperAdmin, async (req, res) => {
    const project = await projectBySlug(req.params.slug);
    if (!project) return res.status(404).json({ error: 'project_not_found' });
    const name = String(req.body?.name || '').trim();
    const requestedScopes = Array.isArray(req.body?.scopes) ? req.body.scopes.map(v => String(v).trim().toLowerCase()) : ['read'];
    const scopes = [...new Set(requestedScopes)].filter(v => allowedScopes.has(v));
    if (!keyNamePattern.test(name) || scopes.length === 0 || scopes.length !== new Set(requestedScopes).size) {
      return res.status(400).json({ error: 'invalid_api_key' });
    }
    const expiresAt = req.body?.expires_at ? new Date(req.body.expires_at) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) return res.status(400).json({ error: 'invalid_expiration' });
    const secret = crypto.randomBytes(32).toString('base64url');
    const prefix = crypto.randomBytes(5).toString('hex');
    const apiKey = `ab_${prefix}_${secret}`;
    const saved = await query(
      `insert into api_keys(project_id,name,key_prefix,key_hash,scopes,expires_at)
       values($1,$2,$3,$4,$5,$6)
       returning id,name,key_prefix,scopes,is_active,expires_at,created_at`,
      [project.id, name, `ab_${prefix}`, hashKey(apiKey), scopes, expiresAt ? expiresAt.toISOString() : null],
    );
    await audit({ userId: req.user.sub, projectId: project.id, event: 'platform.api_key.created', req, metadata: { key_id: saved.rows[0].id, name, scopes } });
    res.status(201).json({ ...saved.rows[0], api_key: apiKey, warning: 'save_this_key_now_it_will_not_be_shown_again' });
  });

  app.delete('/v1/admin/projects/:slug/keys/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    const project = await projectBySlug(req.params.slug);
    if (!project) return res.status(404).json({ error: 'project_not_found' });
    const revoked = await query(
      'update api_keys set is_active=false where id=$1 and project_id=$2 and is_active=true returning id,name,key_prefix',
      [req.params.id, project.id],
    );
    if (!revoked.rows[0]) return res.status(404).json({ error: 'api_key_not_found' });
    await audit({ userId: req.user.sub, projectId: project.id, event: 'platform.api_key.revoked', req, metadata: { key_id: req.params.id } });
    res.status(204).end();
  });

  app.get('/v1/admin/projects/:slug/logs', requireAuth, requireSuperAdmin, async (req, res) => {
    const project = await projectBySlug(req.params.slug);
    if (!project) return res.status(404).json({ error: 'project_not_found' });
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const result = await query(`
      select a.id,a.event,a.ip,a.metadata,a.created_at,u.email
      from audit_logs a
      left join users u on u.id=a.user_id
      where a.project_id=$1
      order by a.created_at desc
      limit $2
    `, [project.id, limit]);
    res.json(result.rows);
  });

  app.get('/v1/admin/projects/:slug/users', requireAuth, requireSuperAdmin, async (req, res) => {
    const project = await projectBySlug(req.params.slug);
    if (!project) return res.status(404).json({ error: 'project_not_found' });
    const result = await query(`
      select u.id,u.email,u.is_active,u.is_superadmin,u.created_at,pu.role
      from project_users pu
      join users u on u.id=pu.user_id
      where pu.project_id=$1
      order by u.created_at desc
    `, [project.id]);
    res.json(result.rows);
  });
}
