import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const smokePath = new URL('../scripts/production-auth-readonly-smoke.mjs', import.meta.url);
const workflowPath = new URL('../.github/workflows/ci.yml', import.meta.url);

async function read(url) {
  return readFile(url, 'utf8');
}

test('authenticated production smoke keeps tenant-isolation evidence requirements', async () => {
  const smoke = await read(smokePath);
  const workflow = await read(workflowPath);

  for (const name of [
    'AUREON_E2E_A_TOKEN',
    'AUREON_E2E_B_TOKEN',
    'AUREON_E2E_A_PROJECT',
    'AUREON_E2E_B_PROJECT',
  ]) {
    assert.match(smoke, new RegExp(name));
    assert.match(workflow, new RegExp(name));
  }

  assert.match(smoke, /projects must be different/);
  assert.match(smoke, /createAureon/);

  assert.match(smoke, /tenant A own storage read/);
  assert.match(smoke, /tenant B own storage read/);
  assert.match(smoke, /tenant A private storage write\/read roundtrip/);
  assert.match(smoke, /tenant B private storage write\/read roundtrip/);
  assert.match(smoke, /tenant A cannot list tenant B storage/);
  assert.match(smoke, /tenant B cannot list tenant A storage/);
  assert.match(smoke, /tenant A cannot write tenant B storage/);
  assert.match(smoke, /tenant B cannot write tenant A storage/);
  assert.match(smoke, /tenant A cannot download tenant B private object/);
  assert.match(smoke, /tenant B cannot download tenant A private object/);

  assert.match(smoke, /tenant A own realtime read/);
  assert.match(smoke, /tenant B own realtime read/);
  assert.match(smoke, /tenant A realtime publish\/read roundtrip/);
  assert.match(smoke, /tenant B realtime publish\/read roundtrip/);
  assert.match(smoke, /tenant A cannot read tenant B realtime/);
  assert.match(smoke, /tenant B cannot read tenant A realtime/);
  assert.match(smoke, /tenant A cannot publish to tenant B realtime/);
  assert.match(smoke, /tenant B cannot publish to tenant A realtime/);

  assert.match(smoke, /tenant A storage probe cleanup/);
  assert.match(smoke, /tenant B storage probe cleanup/);
  assert.match(workflow, /partial_test_credentials/);
  assert.match(workflow, /production-validation-evidence-/);
});
