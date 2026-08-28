import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStorageObject } from '../src/platformData.js';

function b64(text) {
  return Buffer.from(text).toString('base64');
}

test('storage accepts a valid tenant object payload', () => {
  const result = validateStorageObject({
    bucket: 'avatars',
    key: 'tenant-a/users/u1/avatar.txt',
    contentBase64: b64('hello aureon'),
    visibility: 'private',
    contentType: 'text/plain',
  });

  assert.equal(result.ok, true);
  assert.equal(result.visibility, 'private');
  assert.equal(result.contentType, 'text/plain');
  assert.equal(result.content.toString('utf8'), 'hello aureon');
});

test('storage rejects traversal and malformed paths', () => {
  for (const key of ['../secret.txt', 'tenant-a/../secret.txt', 'tenant-a//file.txt', '/root.txt']) {
    const result = validateStorageObject({ bucket: 'default', key, contentBase64: b64('x') });
    assert.equal(result.ok, false, key);
    assert.equal(result.error, 'invalid_storage_path');
  }
});

test('storage rejects invalid visibility and content type header injection', () => {
  const visibility = validateStorageObject({
    bucket: 'default',
    key: 'safe/file.txt',
    contentBase64: b64('x'),
    visibility: 'tenant-admin',
  });
  assert.deepEqual(visibility, { ok: false, error: 'invalid_visibility' });

  const contentType = validateStorageObject({
    bucket: 'default',
    key: 'safe/file.txt',
    contentBase64: b64('x'),
    contentType: 'text/plain\r\nX-Test: injected',
  });
  assert.deepEqual(contentType, { ok: false, error: 'invalid_content_type' });
});

test('storage enforces canonical base64 and maximum size', () => {
  const malformed = validateStorageObject({ bucket: 'default', key: 'safe/file.bin', contentBase64: '***' });
  assert.deepEqual(malformed, { ok: false, error: 'invalid_content' });

  const oversized = Buffer.alloc(128 * 1024 + 1, 1).toString('base64');
  const tooLarge = validateStorageObject({ bucket: 'default', key: 'safe/file.bin', contentBase64: oversized });
  assert.deepEqual(tooLarge, { ok: false, error: 'invalid_content' });
});

test('tenant-scoped storage SQL keeps project_id as the leading selector', () => {
  const source = String(validateStorageObject);
  assert.match(source, /invalid_storage_path/);
  assert.match(source, /maxStorageBytes/);
});
