const baseUrl = (process.env.AUREON_PUBLIC_URL || 'https://aureonbase.vercel.app').replace(/\/$/, '');

async function expectJson(path, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'error' });
  let body = {};
  try { body = await response.json(); } catch {}
  if (response.status !== expectedStatus) {
    throw new Error(`${path} expected HTTP ${expectedStatus}, got ${response.status}`);
  }
  return body;
}

const ready = await expectJson('/ready', 200);
if (ready.configured !== true) throw new Error('/ready did not report configured=true');
if (!ready.database) throw new Error('/ready did not report a database');

const realtime = await expectJson('/api/projects/tradevision/realtime/events', 401);
if (realtime.error !== 'missing_token') {
  throw new Error('Realtime endpoint did not fail closed with missing_token');
}

console.log(JSON.stringify({
  status: 'PASS',
  base_url: baseUrl,
  ready: true,
  realtime_unauthenticated: 'blocked',
}));
