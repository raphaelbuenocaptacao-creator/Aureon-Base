import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Client } = pg;
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;

test('PostgreSQL RLS isolates storage_objects across projects and owners', { skip: !databaseUrl }, async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const userA = randomUUID();
  const userB = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();
  const objectA = randomUUID();
  const objectB = randomUUID();

  try {
    await client.query('begin');
    await client.query("insert into users(id,email,password_hash) values ($1,$2,'x'),($3,$4,'x')", [
      userA, `storage-a-${userA}@example.test`, userB, `storage-b-${userB}@example.test`,
    ]);
    await client.query('insert into projects(id,slug,name) values ($1,$2,$3),($4,$5,$6)', [
      projectA, `storage-a-${projectA}`, 'Storage A', projectB, `storage-b-${projectB}`, 'Storage B',
    ]);
    await client.query('insert into project_users(project_id,user_id,role) values ($1,$2,\'owner\'),($3,$4,\'owner\')', [projectA, userA, projectB, userB]);
    await client.query(`insert into storage_objects(id,project_id,owner_user_id,bucket,object_key,visibility,content,size_bytes)
      values ($1,$2,$3,'default','a.txt','private',$4,1),($5,$6,$7,'default','b.txt','private',$8,1)`,
      [objectA, projectA, userA, Buffer.from('a'), objectB, projectB, userB, Buffer.from('b')]);

    await client.query('set local role aureon_app');
    await client.query("select set_config('aureon.project_id',$1,true), set_config('aureon.user_id',$2,true)", [projectA, userA]);

    const visible = await client.query('select id, project_id, owner_user_id from storage_objects order by object_key');
    assert.equal(visible.rowCount, 1);
    assert.equal(visible.rows[0].id, objectA);
    assert.equal(visible.rows[0].project_id, projectA);
    assert.equal(visible.rows[0].owner_user_id, userA);

    const foreign = await client.query('select id from storage_objects where id = $1', [objectB]);
    assert.equal(foreign.rowCount, 0, 'foreign tenant object must be invisible');

    await assert.rejects(
      client.query("insert into storage_objects(project_id,owner_user_id,bucket,object_key,visibility) values ($1,$2,'default','blocked.txt','private')", [projectB, userA]),
      err => err?.code === '42501',
      'RLS must reject cross-project insert',
    );

    await client.query('rollback');
  } finally {
    try { await client.query('rollback'); } catch {}
    await client.end();
  }
});
