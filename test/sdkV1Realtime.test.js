import test from 'node:test';
import assert from 'node:assert/strict';
import { createAureon } from '../sdk/aureon-v1.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('v1 SDK publishes and polls realtime using authenticated project scope', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/login')) {
      return jsonResponse({ access_token: 'access-a', refresh_token: 'refresh-a' });
    }
    if (String(url).includes('/realtime/publish')) {
      return jsonResponse({ event: { id: 11, topic: 'orders', event_type: 'order.created' } }, 201);
    }
    if (String(url).includes('/realtime/events')) {
      return jsonResponse({ events: [{ id: 11 }], next_cursor: 11 });
    }
    return jsonResponse({ error: 'unexpected_request' }, 500);
  };

  try {
    const client = createAureon('https://aureon.example/', { storage: memoryStorage(), project: 'tenant alpha' });
    await client.auth.signIn({ email: 'sdk@example.com', password: 'not-a-real-secret' });

    const published = await client.realtime().publish('orders', 'order.created', { id: 1 });
    assert.equal(published.event.id, 11);

    const polled = await client.projects.use('tenant alpha').realtime().events({ after: 7, limit: 25, topic: 'orders' });
    assert.equal(polled.next_cursor, 11);

    assert.equal(calls[1].url, 'https://aureon.example/api/projects/tenant%20alpha/realtime/publish');
    assert.equal(calls[1].options.method, 'POST');
    assert.equal(calls[1].options.headers.Authorization, 'Bearer access-a');
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      topic: 'orders',
      event_type: 'order.created',
      payload: { id: 1 },
    });

    assert.equal(calls[2].url, 'https://aureon.example/api/projects/tenant%20alpha/realtime/events?after=7&limit=25&topic=orders');
    assert.equal(calls[2].options.headers.Authorization, 'Bearer access-a');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('v1 SDK realtime requires a project when no default is configured', () => {
  const client = createAureon('https://aureon.example', { storage: memoryStorage() });
  assert.throws(() => client.realtime(), /project slug is required/i);
});

test('v1 SDK rotates refreshed tokens and clears them on sign-out', async () => {
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const calls = [];
  let meAttempts = 0;

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ url: href, options });
    if (href.endsWith('/auth/login')) {
      return jsonResponse({ access_token: 'access-old', refresh_token: 'refresh-old' });
    }
    if (href.endsWith('/me')) {
      meAttempts += 1;
      if (meAttempts === 1) return jsonResponse({ error: 'token_expired' }, 401);
      return jsonResponse({ id: 'user-1' });
    }
    if (href.endsWith('/auth/refresh')) {
      assert.deepEqual(JSON.parse(options.body), { refresh_token: 'refresh-old' });
      return jsonResponse({ access_token: 'access-new', refresh_token: 'refresh-new' });
    }
    if (href.endsWith('/auth/logout')) {
      assert.equal(options.headers.Authorization, 'Bearer access-new');
      assert.deepEqual(JSON.parse(options.body), { refresh_token: 'refresh-new' });
      return new Response(null, { status: 204 });
    }
    return jsonResponse({ error: 'unexpected_request' }, 500);
  };

  try {
    const client = createAureon('https://aureon.example', { storage });
    await client.auth.signIn({ email: 'sdk@example.com', password: 'not-a-real-secret' });
    const me = await client.auth.me();
    assert.equal(me.id, 'user-1');
    assert.equal(storage.getItem('aureon_access_token'), 'access-new');
    assert.equal(storage.getItem('aureon_refresh_token'), 'refresh-new');
    assert.equal(calls.find(call => call.url.endsWith('/me') && call.options.headers.Authorization === 'Bearer access-new') !== undefined, true);

    await client.auth.signOut();
    assert.equal(storage.getItem('aureon_access_token'), null);
    assert.equal(storage.getItem('aureon_refresh_token'), null);
    assert.equal(client.auth.isAuthenticated(), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});