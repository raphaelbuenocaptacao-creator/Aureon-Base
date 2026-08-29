import test from 'node:test';
import assert from 'node:assert/strict';
import { createAureonClient } from '../sdk/aureon.js';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('sdk publishes and polls realtime events for the selected project', async () => {
  const calls = [];
  globalThis.localStorage = {
    values: new Map([['aureon_access_token', 'access-token']]),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, value); },
    removeItem(key) { this.values.delete(key); },
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/publish')) return jsonResponse(201, { event: { id: 7 } });
    return jsonResponse(200, { events: [{ id: 8 }], next_cursor: 8 });
  };

  const client = createAureonClient('https://example.test/');
  await client.projects.realtime('tenant-a').publish('orders', 'created', { id: 'abc' });
  await client.projects.realtime('tenant-a').events({ after: 7, limit: 25, topic: 'orders' });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://example.test/api/projects/tenant-a/realtime/publish');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer access-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), { topic: 'orders', event_type: 'created', payload: { id: 'abc' } });

  const eventsUrl = new URL(calls[1].url);
  assert.equal(eventsUrl.pathname, '/api/projects/tenant-a/realtime/events');
  assert.equal(eventsUrl.searchParams.get('after'), '7');
  assert.equal(eventsUrl.searchParams.get('limit'), '25');
  assert.equal(eventsUrl.searchParams.get('topic'), 'orders');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer access-token');
});

test('sdk encodes project slug in realtime paths', async () => {
  globalThis.localStorage = {
    getItem() { return 'access-token'; },
    setItem() {},
    removeItem() {},
  };
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return jsonResponse(200, { events: [], next_cursor: 0 });
  };

  const client = createAureonClient('https://example.test');
  await client.projects.realtime('tenant/a').events();
  assert.match(requestedUrl, /\/api\/projects\/tenant%2Fa\/realtime\/events\?/);
});
