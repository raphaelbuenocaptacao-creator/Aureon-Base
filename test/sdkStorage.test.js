import test from 'node:test';
import assert from 'node:assert/strict';
import { createAureon } from '../sdk/aureon-v1.js';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: key => values.get(key) || '',
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('v1 SDK exposes tenant-scoped storage list/upload/download/remove', async () => {
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const status = options.method === 'DELETE' ? 204 : 200;
    return new Response(status === 204 ? null : JSON.stringify({ ok: true }), {
      status,
      headers: status === 204 ? undefined : { 'Content-Type': 'application/json' },
    });
  };

  try {
    const client = createAureon('https://example.test/', {
      project: 'tenant-a',
      storage: memoryStorage({ aureon_access_token: 'token-a' }),
    });
    const bucket = client.storage('avatars');

    await bucket.list({ limit: 25 });
    await bucket.upload('users/u 1/avatar.txt', 'aGVsbG8=', {
      visibility: 'private',
      contentType: 'text/plain',
    });
    await bucket.download('users/u 1/avatar.txt');
    await bucket.remove('users/u 1/avatar.txt');

    assert.equal(calls.length, 4);
    assert.equal(calls[0].url, 'https://example.test/v1/projects/tenant-a/storage?bucket=avatars&limit=25');
    assert.equal(calls[1].url, 'https://example.test/v1/projects/tenant-a/storage/avatars/users/u%201/avatar.txt');
    assert.equal(calls[2].url, calls[1].url);
    assert.equal(calls[3].url, calls[1].url);
    assert.equal(calls[1].options.method, 'POST');
    assert.equal(calls[3].options.method, 'DELETE');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer token-a');
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      content_base64: 'aGVsbG8=',
      visibility: 'private',
      content_type: 'text/plain',
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('v1 SDK storage requires project slug and key', async () => {
  const client = createAureon('https://example.test', { storage: memoryStorage() });
  assert.throws(() => client.storage('default'), /project slug is required/i);

  const tenant = createAureon('https://example.test', { project: 'tenant-a', storage: memoryStorage() });
  assert.throws(() => tenant.storage().download(''), /storage key is required/i);
});
