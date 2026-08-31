import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const url = process.env.INTEGRATION_DATABASE_URL;

async function readContext(client) {
  const result = await client.query(
    `select current_user,
            current_setting('aureon.user_id', true) as user_id,
            current_setting('aureon.project_id', true) as project_id`,
  );
  return result.rows[0];
}

test('SET LOCAL tenant identity and aureon_app role never leak across reused PostgreSQL connection', { skip: !url }, async () => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const tenantA = { userId: '11111111-1111-4111-8111-111111111111', projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  const tenantB = { userId: '22222222-2222-4222-8222-222222222222', projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };

  try {
    await client.query('begin');
    await client.query('set local role aureon_app');
    await client.query(
      `select set_config('aureon.user_id', $1, true),
              set_config('aureon.project_id', $2, true)`,
      [tenantA.userId, tenantA.projectId],
    );

    const insideA = await readContext(client);
    assert.equal(insideA.current_user, 'aureon_app');
    assert.equal(insideA.user_id, tenantA.userId);
    assert.equal(insideA.project_id, tenantA.projectId);

    await client.query('commit');

    const afterCommit = await readContext(client);
    assert.notEqual(afterCommit.current_user, 'aureon_app', 'SET LOCAL ROLE must reset after commit');
    assert.notEqual(afterCommit.user_id, tenantA.userId, 'tenant A user context must not survive commit');
    assert.notEqual(afterCommit.project_id, tenantA.projectId, 'tenant A project context must not survive commit');

    await client.query('begin');
    await client.query('set local role aureon_app');
    await client.query(
      `select set_config('aureon.user_id', $1, true),
              set_config('aureon.project_id', $2, true)`,
      [tenantB.userId, tenantB.projectId],
    );

    const insideB = await readContext(client);
    assert.equal(insideB.current_user, 'aureon_app');
    assert.equal(insideB.user_id, tenantB.userId);
    assert.equal(insideB.project_id, tenantB.projectId);
    assert.notEqual(insideB.user_id, tenantA.userId);
    assert.notEqual(insideB.project_id, tenantA.projectId);

    await client.query('rollback');

    const afterRollback = await readContext(client);
    assert.notEqual(afterRollback.current_user, 'aureon_app', 'SET LOCAL ROLE must reset after rollback');
    assert.notEqual(afterRollback.user_id, tenantB.userId, 'tenant B user context must not survive rollback');
    assert.notEqual(afterRollback.project_id, tenantB.projectId, 'tenant B project context must not survive rollback');
  } finally {
    await client.end();
  }
});
