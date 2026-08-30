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

  console.log('PASS authenticated production read-only isolation smoke');
} catch (error) {
  console.error(`FAIL authenticated production read-only isolation smoke: ${error.message}`);
  process.exit(1);
}
