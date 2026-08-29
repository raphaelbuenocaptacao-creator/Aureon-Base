import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRealtimeRoutes } from '../src/realtime.js';

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function setup() {
  const routes = new Map();
  const app = {
    post(path, _auth, handler) { routes.set(`POST ${path}`, handler); },
    get(path, _auth, handler) { routes.set(`GET ${path}`, handler); },
  };
  const calls = [];
  const withTenantContext = async (ctx, operation) => {
    calls.push(ctx);
    return operation(async (sql, params) => {
      if (/insert into realtime_events/i.test(sql)) {
        return { rows: [{ id: 7, project_id: params[0], actor_user_id: params[1], topic: params[2], event_type: params[3], payload: JSON.parse(params[4]), created_at: new Date().toISOString() }] };
      }
      return { rows: [{ id: 8, project_id: params[0], actor_user_id: 'u-a', topic: 'orders', event_type: 'order.created', payload: {}, created_at: new Date().toISOString() }] };
    });
  };
  registerRealtimeRoutes({
    app,
    requireAuth: (_req, _res, next) => next?.(),
    ensureProjectAccess: async () => ({ membership: { id: 'p-a' } }),
    withTenantContext,
    audit: async () => {},
  });
  return { routes, calls };
}

test('publish scopes SQL to authenticated user and project', async () => {
  const { routes, calls } = setup();
  const req = { user: { sub: 'u-a' }, body: { topic: 'orders', event_type: 'order.created', payload: { id: 1 } }, params: { slug: 'alpha' } };
  const res = responseRecorder();
  await routes.get('POST /api/projects/:slug/realtime/publish')(req, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls, [{ userId: 'u-a', projectId: 'p-a' }]);
  assert.equal(res.body.event.project_id, 'p-a');
  assert.equal(res.body.event.actor_user_id, 'u-a');
});

test('events uses tenant context, cursor and bounded limit', async () => {
  const { routes, calls } = setup();
  const req = { user: { sub: 'u-a' }, params: { slug: 'alpha' }, query: { after: '7', limit: '50', topic: 'orders' } };
  const res = responseRecorder();
  await routes.get('GET /api/projects/:slug/realtime/events')(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [{ userId: 'u-a', projectId: 'p-a' }]);
  assert.equal(res.body.next_cursor, 8);
  assert.equal(res.body.events.length, 1);
});

test('invalid cursor, topic and payload are rejected before tenant query', async () => {
  const { routes, calls } = setup();
  const badList = responseRecorder();
  await routes.get('GET /api/projects/:slug/realtime/events')({ user: { sub: 'u-a' }, params: { slug: 'alpha' }, query: { after: '-1' } }, badList);
  assert.equal(badList.statusCode, 400);

  const badPublish = responseRecorder();
  await routes.get('POST /api/projects/:slug/realtime/publish')({ user: { sub: 'u-a' }, params: { slug: 'alpha' }, body: { topic: 'bad topic!', event_type: 'x', payload: [] } }, badPublish);
  assert.equal(badPublish.statusCode, 400);
  assert.equal(calls.length, 0);
});
