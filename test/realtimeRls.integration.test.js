import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const url = process.env.INTEGRATION_DATABASE_URL;
const q = (client, text, params = []) => client.query(text, params);

test('realtime event log is append-only and isolated by project and actor', { skip: !url }, async () => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const userA = randomUUID();
  const userB = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();

  try {
    await q(client, 'begin');
    await q(client, `insert into users(id,email,password_hash) values ($1,$2,'x'),($3,$4,'x')`, [userA, `${userA}@test.invalid`, userB, `${userB}@test.invalid`]);
    await q(client, `insert into projects(id,slug,name) values ($1,$2,'A'),($3,$4,'B')`, [projectA, `rt-a-${projectA}`, projectB, `rt-b-${projectB}`]);
    await q(client, `insert into project_users(project_id,user_id,role) values ($1,$2,'owner'),($3,$4,'owner')`, [projectA,userA,projectB,userB]);
    await q(client, `insert into realtime_events(project_id,actor_user_id,topic,event_type,payload) values ($1,$2,'orders','created','{"tenant":"A"}'),($3,$4,'orders','created','{"tenant":"B"}')`, [projectA,userA,projectB,userB]);

    await q(client, 'set local role aureon_app');
    await q(client, `select set_config('aureon.user_id',$1,true), set_config('aureon.project_id',$2,true)`, [userA, projectA]);

    const visible = await q(client, `select project_id,actor_user_id,payload from realtime_events order by id`);
    assert.equal(visible.rowCount, 1, 'realtime events leaked across tenants');
    assert.equal(visible.rows[0].project_id, projectA);
    assert.equal(visible.rows[0].actor_user_id, userA);
    assert.equal(visible.rows[0].payload.tenant, 'A');

    await q(client, 'savepoint cross_project');
    await assert.rejects(
      q(client, `insert into realtime_events(project_id,actor_user_id,topic,event_type) values ($1,$2,'orders','created')`, [projectB,userA]),
      /row-level security|policy/i
    );
    await q(client, 'rollback to savepoint cross_project');

    await q(client, 'savepoint forged_actor');
    await assert.rejects(
      q(client, `insert into realtime_events(project_id,actor_user_id,topic,event_type) values ($1,$2,'orders','created')`, [projectA,userB]),
      /row-level security|policy/i
    );
    await q(client, 'rollback to savepoint forged_actor');

    await q(client, `insert into realtime_events(project_id,actor_user_id,topic,event_type,payload) values ($1,$2,'orders','updated','{"ok":true}')`, [projectA,userA]);
    const afterPublish = await q(client, `select count(*)::int as count from realtime_events`);
    assert.equal(afterPublish.rows[0].count, 2);

    await assert.rejects(
      q(client, `update realtime_events set topic='tampered' where project_id=$1`, [projectA]),
      /permission denied/i
    );

    await q(client, 'rollback');
  } finally {
    await client.end();
  }
});
