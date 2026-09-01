import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('production recovery validation remains available as an explicit command', () => {
  assert.equal(pkg.scripts['validate:production'], 'node src/validateProductionConfig.js');
});

test('Vercel production builds fail closed when recovery provider configuration is missing', () => {
  const build = pkg.scripts['vercel-build'];
  assert.match(build, /npm run migrate/);
  assert.match(build, /npm run validate:production/);
  assert.match(build, /password-recovery-readiness-report\.js/);
  assert.ok(
    build.indexOf('npm run validate:production') < build.indexOf('password-recovery-readiness-report.js'),
    'production validation must run before readiness is reported',
  );
});
