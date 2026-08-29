const TOPIC_RE = /^[A-Za-z0-9._:-]{1,120}$/;
const EVENT_RE = /^[A-Za-z0-9._:-]{1,120}$/;

function parseCursor(value) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function parseLimit(value) {
  if (value === undefined || value === null || value === '') return 100;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) return null;
  return parsed;
}

export function registerRealtimeRoutes({ app, requireAuth, ensureProjectAccess, withTenantContext, audit }) {
  app.post('/api/projects/:slug/realtime/publish', requireAuth, async (req, res) => {
    const ctx = await ensureProjectAccess(req, res);
    if (!ctx) return;

    const topic = String(req.body?.topic || '').trim();
    const eventType = String(req.body?.event_type || '').trim();
    const payload = req.body?.payload ?? {};

    if (!TOPIC_RE.test(topic) || !EVENT_RE.test(eventType)) {
      return res.status(400).json({ error: 'invalid_realtime_event' });
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'invalid_realtime_payload' });
    }
    const payloadJson = JSON.stringify(payload);
    if (Buffer.byteLength(payloadJson, 'utf8') > 64 * 1024) {
      return res.status(413).json({ error: 'realtime_payload_too_large' });
    }

    try {
      const inserted = await withTenantContext(
        { userId: req.user.sub, projectId: ctx.membership.id },
        scopedQuery => scopedQuery(
          `insert into realtime_events(project_id,actor_user_id,topic,event_type,payload)
           values($1,$2,$3,$4,$5::jsonb)
           returning id,project_id,actor_user_id,topic,event_type,payload,created_at`,
          [ctx.membership.id, req.user.sub, topic, eventType, payloadJson],
        ),
      );
      const event = inserted.rows[0];
      await audit({ userId: req.user.sub, projectId: ctx.membership.id, event: 'realtime.published', req, metadata: { cursor: event.id, topic, event_type: eventType } });
      return res.status(201).json({ event });
    } catch (err) {
      console.error('realtime_publish_error', err?.code || err?.message || 'unknown');
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  app.get('/api/projects/:slug/realtime/events', requireAuth, async (req, res) => {
    const ctx = await ensureProjectAccess(req, res);
    if (!ctx) return;

    const after = parseCursor(req.query?.after);
    const limit = parseLimit(req.query?.limit);
    const topic = req.query?.topic === undefined ? null : String(req.query.topic).trim();
    if (after === null || limit === null || (topic !== null && !TOPIC_RE.test(topic))) {
      return res.status(400).json({ error: 'invalid_realtime_query' });
    }

    try {
      const result = await withTenantContext(
        { userId: req.user.sub, projectId: ctx.membership.id },
        scopedQuery => scopedQuery(
          `select id,project_id,actor_user_id,topic,event_type,payload,created_at
           from realtime_events
           where project_id=$1 and id>$2 and ($3::text is null or topic=$3)
           order by id asc
           limit $4`,
          [ctx.membership.id, after, topic, limit],
        ),
      );
      const events = result.rows;
      const nextCursor = events.length ? Number(events[events.length - 1].id) : after;
      return res.json({ events, next_cursor: nextCursor });
    } catch (err) {
      console.error('realtime_events_error', err?.code || err?.message || 'unknown');
      return res.status(500).json({ error: 'internal_error' });
    }
  });
}
