import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('production recovery validation remains available as an explicit command', () => {
  assert.equal(pkg.scripts['validate:production'], 'node src/validateProductionConfig.js');
});

test('Vercel build does not block unrelated platform deploys on optional recovery provider config', () => {
  assert.match(pkg.scripts['vercel-build'], /npm run migrate/);
  assert.doesNotMatch(pkg.scripts['vercel-build'], /validate:production/);
});
