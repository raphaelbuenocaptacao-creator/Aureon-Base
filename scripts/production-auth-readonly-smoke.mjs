import crypto from 'node:crypto';
import { createAureon } from '../sdk/aureon-v1.js';

const baseUrl = String(process.env.AUREON_BASE_URL || 'https://aureonbase.vercel.app').replace(/\/$/, '');
const tokenA = String(process.env.AUREON_E2E_A_TOKEN || '').trim();
const tokenB = String(process.env.AUREON_E2E_B_TOKEN || '').trim();
const projectA = String(process.env.AUREON_E2E_A_PROJECT || '').trim();
const projectB = String(process.env.AUREON_E2E_B_PROJECT || '').trim();

const missing = [
  ['AUREON_E2E_A_TOKEN', tokenA],
  ['AUREON_E2E_B_TOKEN', tokenB],
  ['AUREON_E2E_A_PROJECT', projectA],
  ['AUREON_E2E_B_PROJECT', projectB],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  console.error(`authenticated_production_smoke_not_configured: missing ${missing.join(', ')}`);
  process.exit(2);
}

if (projectA === projectB) {
  console.error('authenticated_production_smoke_invalid: projects must be different');
  process.exit(2);
}

function tokenStorage(token) {
  return {
    getItem(key) {
      return key === 'aureon_access_token' ? token : '';
    },
    setItem() {},
    removeItem() {},
  };
}

function clientFor(token) {
  return createAureon(baseUrl, { storage: tokenStorage(token) });
}

async function expectDenied(label, action) {
  try {
    await action();
  } catch (error) {
    if (error?.status === 403) {
      console.log(`PASS ${label}: 403`);
      return;
    }
    throw new Error(`${label}: expected 403, got ${error?.status || 'unknown'}`);
  }
  throw new Error(`${label}: expected 403, request succeeded`);
}

const a = clientFor(tokenA);
const b = clientFor(tokenB);
const runId = crypto.randomUUID().replace(/-/g, '');
const topicA = `e2e.${runId}.a`;
const topicB = `e2e.${runId}.b`;
const keyA = `e2e/${runId}-a.txt`;
const keyB = `e2e/${runId}-b.txt`;
const bodyA = Buffer.from(`aureon-e2e-a-${runId}`, 'utf8').toString('base64');
const bodyB = Buffer.from(`aureon-e2e-b-${runId}`, 'utf8').toString('base64');
let uploadedA = false;
let uploadedB = false;

try {
  await a.projects.use(projectA).access();
  console.log('PASS tenant A own project access');
  await b.projects.use(projectB).access();
  console.log('PASS tenant B own project access');

  await a.projects.use(projectA).storage('default').list({ limit: 1 });
  console.log('PASS tenant A own storage read');
  await b.projects.use(projectB).storage('default').list({ limit: 1 });
  console.log('PASS tenant B own storage read');

  await a.projects.use(projectA).realtime().events({ limit: 1 });
  console.log('PASS tenant A own realtime read');
  await b.projects.use(projectB).realtime().events({ limit: 1 });
  console.log('PASS tenant B own realtime read');

  await expectDenied('tenant A cannot access tenant B project', () => a.projects.use(projectB).access());
  await expectDenied('tenant B cannot access tenant A project', () => b.projects.use(projectA).access());
  await expectDenied('tenant A cannot list tenant B storage', () => a.projects.use(projectB).storage('default').list({ limit: 1 }));
  await expectDenied('tenant B cannot list tenant A storage', () => b.projects.use(projectA).storage('default').list({ limit: 1 }));
  await expectDenied('tenant A cannot read tenant B realtime', () => a.projects.use(projectB).realtime().events({ limit: 1 }));
  await expectDenied('tenant B cannot read tenant A realtime', () => b.projects.use(projectA).realtime().events({ limit: 1 }));

  await a.projects.use(projectA).storage('default').upload(keyA, bodyA, { visibility: 'private', contentType: 'text/plain' });
  uploadedA = true;
  const downloadedA = await a.projects.use(projectA).storage('default').download(keyA);
  if (downloadedA?.content_base64 !== bodyA) throw new Error('tenant A storage roundtrip content mismatch');
  console.log('PASS tenant A private storage write/read roundtrip');

  await b.projects.use(projectB).storage('default').upload(keyB, bodyB, { visibility: 'private', contentType: 'text/plain' });
  uploadedB = true;
  const downloadedB = await b.projects.use(projectB).storage('default').download(keyB);
  if (downloadedB?.content_base64 !== bodyB) throw new Error('tenant B storage roundtrip content mismatch');
  console.log('PASS tenant B private storage write/read roundtrip');

  await expectDenied('tenant A cannot write tenant B storage', () => a.projects.use(projectB).storage('default').upload(`e2e/${runId}-cross-a.txt`, bodyA));
  await expectDenied('tenant B cannot write tenant A storage', () => b.projects.use(projectA).storage('default').upload(`e2e/${runId}-cross-b.txt`, bodyB));
  await expectDenied('tenant A cannot download tenant B private object', () => a.projects.use(projectB).storage('default').download(keyB));
  await expectDenied('tenant B cannot download tenant A private object', () => b.projects.use(projectA).storage('default').download(keyA));

  const publishedA = await a.projects.use(projectA).realtime().publish(topicA, 'e2e.probe', { run_id: runId, tenant: 'A' });
  const eventsA = await a.projects.use(projectA).realtime().events({ after: Math.max(Number(publishedA?.event?.id || 1) - 1, 0), topic: topicA, limit: 10 });
  if (!eventsA?.events?.some(event => event?.payload?.run_id === runId && event?.payload?.tenant === 'A')) throw new Error('tenant A realtime event not observable after publish');
  console.log('PASS tenant A realtime publish/read roundtrip');

  const publishedB = await b.projects.use(projectB).realtime().publish(topicB, 'e2e.probe', { run_id: runId, tenant: 'B' });
  const eventsB = await b.projects.use(projectB).realtime().events({ after: Math.max(Number(publishedB?.event?.id || 1) - 1, 0), topic: topicB, limit: 10 });
  if (!eventsB?.events?.some(event => event?.payload?.run_id === runId && event?.payload?.tenant === 'B')) throw new Error('tenant B realtime event not observable after publish');
  console.log('PASS tenant B realtime publish/read roundtrip');

  await expectDenied('tenant A cannot publish to tenant B realtime', () => a.projects.use(projectB).realtime().publish(topicA, 'e2e.cross', { run_id: runId }));
  await expectDenied('tenant B cannot publish to tenant A realtime', () => b.projects.use(projectA).realtime().publish(topicB, 'e2e.cross', { run_id: runId }));

  console.log('PASS authenticated production tenant read/write isolation smoke');
} catch (error) {
  console.error(`FAIL authenticated production tenant read/write isolation smoke: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (uploadedA) {
    try {
      await a.projects.use(projectA).storage('default').remove(keyA);
      console.log('PASS tenant A storage probe cleanup');
    } catch (error) {
      console.error(`FAIL tenant A storage probe cleanup: ${error.message}`);
      process.exitCode = 1;
    }
  }
  if (uploadedB) {
    try {
      await b.projects.use(projectB).storage('default').remove(keyB);
      console.log('PASS tenant B storage probe cleanup');
    } catch (error) {
      console.error(`FAIL tenant B storage probe cleanup: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
