const baseUrl = (process.env.AUREON_PUBLIC_URL || 'https://aureonbase.vercel.app').replace(/\/$/, '');

async function expectJson(path, expectedStatus, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'error', ...options });
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

const recoveryProbeEmail = `aureon-production-smoke-${Date.now()}@example.invalid`;
const recovery = await expectJson('/auth/request-password-reset', 202, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: recoveryProbeEmail }),
});
if (recovery.ok !== true) {
  throw new Error('Password recovery request did not return the generic accepted response');
}
const recoveryKeys = Object.keys(recovery).sort();
if (recoveryKeys.length !== 1 || recoveryKeys[0] !== 'ok') {
  throw new Error('Password recovery response exposed unexpected account or provider state');
}

console.log(JSON.stringify({
  status: 'PASS',
  base_url: baseUrl,
  ready: true,
  realtime_unauthenticated: 'blocked',
  password_recovery_privacy: 'generic_accepted_response',
}));
