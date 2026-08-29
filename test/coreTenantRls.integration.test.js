import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const url = process.env.INTEGRATION_DATABASE_URL;

function q(client, text, params = []) { return client.query(text, params); }

test('core project tables are isolated by tenant RLS', { skip: !url }, async () => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const userA = randomUUID();
  const userB = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();
  const planA = randomUUID();
  const planB = randomUUID();

  try {
    await q(client, 'begin');
    await q(client, `insert into users(id,email,password_hash) values ($1,$2,'x'),($3,$4,'x')`, [userA, `${userA}@test.invalid`, userB, `${userB}@test.invalid`]);
    await q(client, `insert into projects(id,slug,name) values ($1,$2,'A'),($3,$4,'B')`, [projectA, `a-${projectA}`, projectB, `b-${projectB}`]);
    await q(client, `insert into project_users(project_id,user_id,role) values ($1,$2,'owner'),($3,$4,'owner')`, [projectA,userA,projectB,userB]);
    await q(client, `insert into plans(id,project_id,code,name,price_cents) values ($1,$2,'p','A',100),($3,$4,'p','B',100)`, [planA,projectA,planB,projectB]);
    await q(client, `insert into subscriptions(project_id,user_id,plan_id,status) values ($1,$2,$3,'active'),($4,$5,$6,'active')`, [projectA,userA,planA,projectB,userB,planB]);
    await q(client, `insert into api_keys(project_id,name,key_prefix,key_hash) values ($1,'a','a',$2),($3,'b','b',$4)`, [projectA, `hash-a-${projectA}`, projectB, `hash-b-${projectB}`]);

    await q(client, 'set local role aureon_app');
    await q(client, `select set_config('aureon.user_id',$1,true), set_config('aureon.project_id',$2,true)`, [userA, projectA]);

    for (const table of ['project_users','plans','subscriptions','api_keys']) {
      const result = await q(client, `select project_id from ${table}`);
      assert.equal(result.rowCount, 1, `${table} leaked rows across tenants`);
      assert.equal(result.rows[0].project_id, projectA);
    }

    await q(client, 'savepoint cross_tenant_write');
    await assert.rejects(
      q(client, `insert into api_keys(project_id,name,key_prefix,key_hash) values ($1,'x','x',$2)`, [projectB, `cross-${randomUUID()}`]),
      /row-level security|policy/i
    );
    await q(client, 'rollback to savepoint cross_tenant_write');
    await q(client, 'rollback');
  } finally {
    await client.end();
  }
});
