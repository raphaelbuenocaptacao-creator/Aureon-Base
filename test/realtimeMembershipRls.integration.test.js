import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const url = process.env.INTEGRATION_DATABASE_URL;
const q = (client, text, params = []) => client.query(text, params);

test('realtime RLS rejects forged project context when user has no membership', { skip: !url }, async () => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const ownerId = randomUUID();
  const outsiderId = randomUUID();
  const projectId = randomUUID();

  try {
    await q(client, 'begin');
    await q(
      client,
      `insert into users(id,email,password_hash) values ($1,$2,'x'),($3,$4,'x')`,
      [ownerId, `${ownerId}@test.invalid`, outsiderId, `${outsiderId}@test.invalid`],
    );
    await q(client, `insert into projects(id,slug,name) values ($1,$2,'Realtime membership guard')`, [projectId, `rt-membership-${projectId}`]);
    await q(client, `insert into project_users(project_id,user_id,role) values ($1,$2,'owner')`, [projectId, ownerId]);
    await q(
      client,
      `insert into realtime_events(project_id,actor_user_id,topic,event_type,payload)
       values ($1,$2,'security','seed','{"visible":true}')`,
      [projectId, ownerId],
    );

    await q(client, 'set local role aureon_app');

    // Simulate a compromised application path forging both tenant GUCs.
    // RLS must still deny access because outsiderId is not in project_users.
    await q(
      client,
      `select set_config('aureon.user_id',$1,true), set_config('aureon.project_id',$2,true)`,
      [outsiderId, projectId],
    );

    const leaked = await q(client, 'select id from realtime_events where project_id=$1', [projectId]);
    assert.equal(leaked.rowCount, 0, 'outsider read realtime data by forging tenant context');

    await q(client, 'savepoint outsider_publish');
    await assert.rejects(
      q(
        client,
        `insert into realtime_events(project_id,actor_user_id,topic,event_type,payload)
         values ($1,$2,'security','forged','{}')`,
        [projectId, outsiderId],
      ),
      /row-level security|policy/i,
    );
    await q(client, 'rollback to savepoint outsider_publish');

    // Valid membership with the same project context must continue to work.
    await q(
      client,
      `select set_config('aureon.user_id',$1,true), set_config('aureon.project_id',$2,true)`,
      [ownerId, projectId],
    );
    const visible = await q(client, 'select id from realtime_events where project_id=$1', [projectId]);
    assert.equal(visible.rowCount, 1, 'valid member unexpectedly lost realtime access');

    await q(
      client,
      `insert into realtime_events(project_id,actor_user_id,topic,event_type,payload)
       values ($1,$2,'security','valid','{}')`,
      [projectId, ownerId],
    );
    const after = await q(client, 'select count(*)::int as count from realtime_events where project_id=$1', [projectId]);
    assert.equal(after.rows[0].count, 2, 'valid member publish did not persist inside transaction');

    await q(client, 'rollback');
  } finally {
    await client.end();
  }
});
