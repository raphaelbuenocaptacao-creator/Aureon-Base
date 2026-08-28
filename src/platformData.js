import { v4 as uuid } from 'uuid';

const collectionName = /^[a-z][a-z0-9_]{1,62}$/;
const environmentNames = new Set(['development', 'preview', 'production']);
const elevated = role => role === 'owner' || role === 'admin';
const storageBucket = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const storageKey = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const storageVisibility = new Set(['private', 'project', 'public']);
const maxStorageBytes = 128 * 1024;

export function validateStorageObject({ bucket, key, contentBase64, visibility = 'private', contentType = 'application/octet-stream' }) {
  if (!storageBucket.test(bucket) || !storageKey.test(key) || key.includes('..') || key.includes('//')) return { ok: false, error: 'invalid_storage_path' };
  if (!storageVisibility.has(visibility)) return { ok: false, error: 'invalid_visibility' };
  if (typeof contentType !== 'string' || contentType.length < 1 || contentType.length > 120 || /[\r\n]/.test(contentType)) return { ok: false, error: 'invalid_content_type' };
  if (typeof contentBase64 !== 'string' || contentBase64.length < 1 || contentBase64.length > Math.ceil(maxStorageBytes / 3) * 4 + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64)) return { ok: false, error: 'invalid_content' };
  let content;
  try { content = Buffer.from(contentBase64, 'base64'); } catch { return { ok: false, error: 'invalid_content' }; }
  if (!content.length || content.length > maxStorageBytes || content.toString('base64').replace(/=+$/, '') !== contentBase64.replace(/=+$/, '')) return { ok: false, error: 'invalid_content' };
  return { ok: true, content, visibility, contentType };
}

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

  async function environment(ctx, req, res) {
    const requested = String(req.query?.environment || req.body?.environment || 'production').trim().toLowerCase();
    if (!environmentNames.has(requested)) {
      res.status(400).json({ error: 'invalid_environment' });
      return null;
    }
    const found = await query(
      'select id,name from project_environments where project_id=$1 and name=$2 and is_active=true',
      [ctx.membership.id, requested],
    );
    if (!found.rows[0]) {
      res.status(404).json({ error: 'environment_not_found' });
      return null;
    }
    return found.rows[0];
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
    const env = await environment(ctx, req, res); if (!env) return;
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const params = [ctx.membership.id, env.id, col.name, limit, offset];
    const ownerClause = ownerFilter(ctx, col, 6, params, req.user.sub);
    const result = await query(
      `select id,data,owner_user_id,created_at,updated_at from project_records where project_id=$1 and environment_id=$2 and collection=$3 ${ownerClause} order by created_at desc limit $4 offset $5`,
      params,
    );
    res.json(result.rows);
  });

  app.get('/v1/projects/:slug/data/:collection/:id', requireAuth, async (req, res) => {
    const ctx = await context(req, res); if (!ctx) return;
    const col = await collection(ctx, req.params.collection); if (!col) return res.status(404).json({ error: 'collection_not_found' });
    const env = await environment(ctx, req, res); if (!env) return;
    const params = [req.params.id, ctx.membership.id, env.id, col.name];
    const ownerClause = ownerFilter(ctx, col, 5, params, req.user.sub);
    const found = await query(
      `select id,data,owner_user_id,created_at,updated_at from project_records where id=$1 and project_id=$2 and environment_id=$3 and collection=$4 ${ownerClause}`,
      params,
    );
    if (!found.rows[0]) return res.status(404).json({ error: 'record_not_found' });
    res.json(found.rows[0]);
  });

  app.post('/v1/projects/:slug/data/:collection', requireAuth, async (req, res) => {
    const ctx = await context(req, res); if (!ctx) return;
    const col = await collection(ctx, req.params.collection); if (!col) return res.status(404).json({ error: 'collection_not_found' });
    const env = await environment(ctx, req, res); if (!env) return;
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
      'insert into project_records(id,project_id,environment_id,collection,owner_user_id,data) values($1,$2,$3,$4,$5,$6) returning id,data,owner_user_id,created_at,updated_at',
      [id, ctx.membership.id, env.id, col.name, ownerId, JSON.stringify(data)],
    );
    await audit({ userId: req.user.sub, projectId: ctx.membership.id, event: 'data.record.created', req, metadata: { environment: env.name, collection: col.name, record_id: id, owner_user_id: ownerId } });
    res.status(201).json(saved.rows[0]);
  });

  app.put('/v1/projects/:slug/data/:collection/:id', requireAuth, async (req, res) => {
    const ctx = await context(req, res); if (!ctx) return;
    const col = await collection(ctx, req.params.collection); if (!col) return res.status(404).json({ error: 'collection_not_found' });
    const env = await environment(ctx, req, res); if (!env) return;
    if (!canWrite(ctx, col, res)) return;
    const data = req.body?.data;
    if (!data || Array.isArray(data) || typeof data !== 'object') return res.status(400).json({ error: 'invalid_record' });
    const params = [JSON.stringify(data), req.params.id, ctx.membership.id, env.id, col.name];
    const ownerClause = ownerFilter(ctx, col, 6, params, req.user.sub);
    const saved = await query(
      `update project_records set data=$1,updated_at=now() where id=$2 and project_id=$3 and environment_id=$4 and collection=$5 ${ownerClause} returning id,data,owner_user_id,created_at,updated_at`,
      params,
    );
    if (!saved.rows[0]) return res.status(404).json({ error: 'record_not_found' });
    await audit({ userId: req.user.sub, projectId: ctx.membership.id, event: 'data.record.updated', req, metadata: { environment: env.name, collection: col.name, record_id: req.params.id } });
    res.json(saved.rows[0]);
  });

  app.delete('/v1/projects/:slug/data/:collection/:id', requireAuth, async (req, res) => {
    const ctx = await context(req, res); if (!ctx) return;
    const col = await collection(ctx, req.params.collection); if (!col) return res.status(404).json({ error: 'collection_not_found' });
    const env = await environment(ctx, req, res); if (!env) return;
    if (!canWrite(ctx, col, res)) return;
    const params = [req.params.id, ctx.membership.id, env.id, col.name];
    const ownerClause = ownerFilter(ctx, col, 5, params, req.user.sub);
    const deleted = await query(
      `delete from project_records where id=$1 and project_id=$2 and environment_id=$3 and collection=$4 ${ownerClause} returning id`,
      params,
    );
    if (!deleted.rows[0]) return res.status(404).json({ error: 'record_not_found' });
    await audit({ userId: req.user.sub, projectId: ctx.membership.id, event: 'data.record.deleted', req, metadata: { environment: env.name, collection: col.name, record_id: req.params.id } });
    res.status(204).end();
  });

  app.get('/v1/projects/:slug/storage', requireAuth, async (req, res) => {
    const ctx = await context(req, res); if (!ctx) return;
    const bucket = String(req.query?.bucket || 'default').trim();
    if (!storageBucket.test(bucket)) return res.status(400).json({ error: 'invalid_storage_path' });
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const result = await query(
      `select id,bucket,object_key,owner_user_id,content_type,size_bytes,checksum_sha256,visibility,metadata,created_at,updated_at
       from storage_objects where project_id=$1 and bucket=$2 and deleted_at is null
       and (visibility in ('project','public') or owner_user_id=$3)
       order by created_at desc limit $4`,
      [ctx.membership.id, bucket, req.user.sub, limit],
    );
    res.json(result.rows);
  });

  app.post('/v1/projects/:slug/storage/:bucket/*', requireAuth, async (req, res) => {
    const ctx = await context(req, res); if (!ctx) return;
    const bucket = String(req.params.bucket || '').trim();
    const key = String(req.params[0] || '').trim();
    const visibility = String(req.body?.visibility || 'private').trim().toLowerCase();
    const contentType = String(req.body?.content_type || 'application/octet-stream').trim();
    const checked = validateStorageObject({ bucket, key, contentBase64: req.body?.content_base64, visibility, contentType });
    if (!checked.ok) return res.status(400).json({ error: checked.error });
    const checksum = await import('node:crypto').then(({ createHash }) => createHash('sha256').update(checked.content).digest('hex'));
    try {
      const saved = await query(
        `insert into storage_objects(id,project_id,owner_user_id,bucket,object_key,provider,content_type,size_bytes,checksum_sha256,visibility,content)
         values($1,$2,$3,$4,$5,'postgres',$6,$7,$8,$9,$10)
         returning id,bucket,object_key,owner_user_id,content_type,size_bytes,checksum_sha256,visibility,created_at,updated_at`,
        [uuid(), ctx.membership.id, req.user.sub, bucket, key, checked.contentType, checked.content.length, checksum, checked.visibility, checked.content],
      );
      await audit({ userId: req.user.sub, projectId: ctx.membership.id, event: 'storage.object.created', req, metadata: { bucket, object_key: key, size_bytes: checked.content.length } });
      return res.status(201).json(saved.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'object_already_exists' });
      throw err;
    }
  });

  app.get('/v1/projects/:slug/storage/:bucket/*', requireAuth, async (req, res) => {
    const ctx = await context(req, res); if (!ctx) return;
    const bucket = String(req.params.bucket || '').trim();
    const key = String(req.params[0] || '').trim();
    if (!storageBucket.test(bucket) || !storageKey.test(key) || key.includes('..') || key.includes('//')) return res.status(400).json({ error: 'invalid_storage_path' });
    const found = await query(
      `select id,bucket,object_key,owner_user_id,content_type,size_bytes,checksum_sha256,visibility,content,created_at,updated_at
       from storage_objects where project_id=$1 and bucket=$2 and object_key=$3 and deleted_at is null
       and (visibility in ('project','public') or owner_user_id=$4)`,
      [ctx.membership.id, bucket, key, req.user.sub],
    );
    const row = found.rows[0];
    if (!row) return res.status(404).json({ error: 'object_not_found' });
    const content = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content || '');
    delete row.content;
    res.json({ ...row, content_base64: content.toString('base64') });
  });

  app.delete('/v1/projects/:slug/storage/:bucket/*', requireAuth, async (req, res) => {
    const ctx = await context(req, res); if (!ctx) return;
    const bucket = String(req.params.bucket || '').trim();
    const key = String(req.params[0] || '').trim();
    if (!storageBucket.test(bucket) || !storageKey.test(key) || key.includes('..') || key.includes('//')) return res.status(400).json({ error: 'invalid_storage_path' });
    const deleted = await query(
      `update storage_objects set deleted_at=now(),updated_at=now()
       where project_id=$1 and bucket=$2 and object_key=$3 and owner_user_id=$4 and deleted_at is null returning id`,
      [ctx.membership.id, bucket, key, req.user.sub],
    );
    if (!deleted.rows[0]) return res.status(404).json({ error: 'object_not_found' });
    await audit({ userId: req.user.sub, projectId: ctx.membership.id, event: 'storage.object.deleted', req, metadata: { bucket, object_key: key } });
    res.status(204).end();
  });
}
