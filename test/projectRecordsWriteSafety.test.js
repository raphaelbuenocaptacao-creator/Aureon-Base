import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/platformData.js', import.meta.url), 'utf8');
const dataStart = source.indexOf("app.get('/v1/projects/:slug/data/:collection'");
const storageStart = source.indexOf("app.get('/v1/projects/:slug/storage'");
assert.ok(dataStart >= 0 && storageStart > dataStart, 'project data route block missing');

const dataRoutes = source.slice(dataStart, storageStart);

assert.ok(dataRoutes.includes("app.post('/v1/projects/:slug/data/:collection'"), 'record create route missing');
assert.ok(dataRoutes.includes("app.put('/v1/projects/:slug/data/:collection/:id'"), 'record update route missing');
assert.ok(dataRoutes.includes("if (!data || Array.isArray(data) || typeof data !== 'object')"), 'record payload object validation missing');
assert.ok(dataRoutes.includes("if (!canWrite(ctx, col, res)) return;"), 'write authorization guard missing');
assert.ok(source.includes("if (!col.owner_scoped && !ctx.isAdmin)"), 'shared collection admin-write guard missing');

assert.ok(dataRoutes.includes("const ownerId = col.owner_scoped ? (ctx.isAdmin && requestedOwner ? requestedOwner : req.user.sub) : null;"), 'owner assignment rule missing');
assert.ok(dataRoutes.includes("select 1 from project_users where project_id=$1 and user_id=$2"), 'requested owner membership validation missing');
assert.ok(dataRoutes.includes("owner_not_in_project"), 'cross-project owner rejection missing');

const updateStatement = dataRoutes.match(/update project_records set data=\$1,updated_at=now\(\)[^`]+/s)?.[0] || '';
assert.ok(updateStatement, 'record update statement missing');
assert.ok(!/owner_user_id\s*=/.test(updateStatement), 'record update must not permit owner reassignment');
assert.ok(updateStatement.includes('project_id=$3') && updateStatement.includes('environment_id=$4') && updateStatement.includes('collection=$5'), 'record update must remain project/environment/collection scoped');

assert.ok(dataRoutes.includes("event: 'data.record.created'"), 'record creation audit missing');
assert.ok(dataRoutes.includes("event: 'data.record.updated'"), 'record update audit missing');

const scopedWrites = dataRoutes.match(/recordsQuery\(ctx, req\.user\.sub, scopedQuery => scopedQuery\(/g) || [];
assert.ok(scopedWrites.length >= 5, 'project record operations must execute with tenant context');

console.log('project record write safety regression PASS');
