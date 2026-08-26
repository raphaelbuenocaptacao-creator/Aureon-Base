import { v4 as uuid } from 'uuid';

const collectionName = /^[a-z][a-z0-9_]{1,62}$/;
const elevated = role => role === 'owner' || role === 'admin';

export function registerPlatformDataRoutes({ app, query, requireAuth, projectMembership, audit }) {
  async function context(req, res) {
    const membership = await projectMembership(req.params.slug, req.user.sub);
    if (!membership || !membership.is_active) {
      res.status(403).json({ error: 'project_forbidden' });
      return null;
    }
    return { membership, isAdmin: elevated(membership.role) };
  }

  async function collection(ctx, name) {
    if (!collectionName.test(name)) return null;
    const found = await query(
      'select name,owner_scoped,public_read from project_collections where project_id=$1 and name=$2',
      [ctx.membership.id, name],
    );
    return found.rows[0] || null;
  }

  function ownerFilter(ctx, col, index, params, userId) {
    if (!col.owner_scoped || ctx.isAdmin) return '';
    params.push(userId);
    return `and owner_user_id=$${index}`;
  }

  function canWrite(ctx, col, res) {
    if (!col.owner_scoped && !ctx.isAdmin) {
      res.status(403).json({ error: 'admin_write_required' });
      return false;
    }
    return true;
  }

  app.get('/v1/projects/:slug/data/:collection', requireAuth, async (req, res) => {
    const ctx = await context(req, res); if (!ctx) return;
    const col = await collection(ctx, req.params.collection); if (!col) return res.status(404).json({ error: 'collection_not_found' });
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const params = [ctx.membership.id, col.name, limit, offset];
    const ownerClause = ownerFilter(ctx, col, 5, params, req.user.sub);
    const result = await query(
      `select id,data,owner_user_id,created_at,updated_at from project_records where project_id=$1 and collection=$2 ${ownerClause} order by created_at desc limit $3 offset $4`,
      params,
    );
    res.json(result.rows);
  });

  app.get('/v1/projects/:slug/data/:collection/:id', requireAuth, async (req, res) => {
    const ctx = await context(req, res); if (!ctx) return;
    const col = await collection(ctx, req.params.collection); if (!col) return res.status(404).json({ error: 'collection_not_found' });
    const params = [req.params.id, ctx.membership.id, col.name];
    const ownerClause = ownerFilter(ctx, col, 4, params, req.user.sub);
    const found = await query(
      `select id,data,owner_user_id,created_at,updated_at from project_records where id=$1 and project_id=$2 and collection=$3 ${ownerClause}`,
      params,
    );
    if (!found.rows[0]) return res.status(404).json({ error: 'record_not_found' });
    res.json(found.rows[0]);
  });

  app.post('/v1/projects/:slug/data/:collection', requireAuth, async (req, res) => {
    const ctx = await context(req, res); if (!ctx) return;
    const col = await collection(ctx, req.params.collection); if (!col) return res.status(404).json({ error: 'collection_not_found' });
    if (!canWrite(ctx, col, res)) return;
    const data = req.body?.data;
    if (!data || Array.isArray(data) || typeof data !== 'object') return res.status(400).json({ error: 'invalid_record' });
    const id = uuid();
    const requestedOwner = String(req.body?.owner_user_id || '').trim();
    const ownerId = col.owner_scoped ? (ctx.isAdmin && requestedOwner ? requestedOwner : req.user.sub) : null;
    if (ownerId && ctx.isAdmin && requestedOwner) {
      const member = await query('select 1 from project_users where project_id=$1 and user_id=$2', [ctx.membership.id, ownerId]);
      if (!member.rows[0]) return res.status(400).json({ error: 'owner_not_in_project' });
    }
    const saved = await query(
      'insert into project_records(id,project_id,collection,owner_user_id,data) values($1,$2,$3,$4,$5) returning id,data,owner_user_id,created_at,updated_at',
      [id, ctx.membership.id, col.name, ownerId, JSON.stringify(data)],
    );
    await audit({ userId: req.user.sub, projectId: ctx.membership.id, event: 'data.record.created', req, metadata: { collection: col.name, record_id: id, owner_user_id: ownerId } });
    res.status(201).json(saved.rows[0]);
  });

  app.put('/v1/projects/:slug/data/:collection/:id', requireAuth, async (req, res) => {
    const ctx = await context(req, res); if (!ctx) return;
    const col = await collection(ctx, req.params.collection); if (!col) return res.status(404).json({ error: 'collection_not_found' });
    if (!canWrite(ctx, col, res)) return;
    const data = req.body?.data;
    if (!data || Array.isArray(data) || typeof data !== 'object') return res.status(400).json({ error: 'invalid_record' });
    const params = [JSON.stringify(data), req.params.id, ctx.membership.id, col.name];
    const ownerClause = ownerFilter(ctx, col, 5, params, req.user.sub);
    const saved = await query(
      `update project_records set data=$1,updated_at=now() where id=$2 and project_id=$3 and collection=$4 ${ownerClause} returning id,data,owner_user_id,created_at,updated_at`,
      params,
    );
    if (!saved.rows[0]) return res.status(404).json({ error: 'record_not_found' });
    await audit({ userId: req.user.sub, projectId: ctx.membership.id, event: 'data.record.updated', req, metadata: { collection: col.name, record_id: req.params.id } });
    res.json(saved.rows[0]);
  });

  app.delete('/v1/projects/:slug/data/:collection/:id', requireAuth, async (req, res) => {
    const ctx = await context(req, res); if (!ctx) return;
    const col = await collection(ctx, req.params.collection); if (!col) return res.status(404).json({ error: 'collection_not_found' });
    if (!canWrite(ctx, col, res)) return;
    const params = [req.params.id, ctx.membership.id, col.name];
    const ownerClause = ownerFilter(ctx, col, 4, params, req.user.sub);
    const deleted = await query(
      `delete from project_records where id=$1 and project_id=$2 and collection=$3 ${ownerClause} returning id`,
      params,
    );
    if (!deleted.rows[0]) return res.status(404).json({ error: 'record_not_found' });
    await audit({ userId: req.user.sub, projectId: ctx.membership.id, event: 'data.record.deleted', req, metadata: { collection: col.name, record_id: req.params.id } });
    res.status(204).end();
  });
}
