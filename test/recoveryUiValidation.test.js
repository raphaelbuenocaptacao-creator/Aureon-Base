import fs from 'node:fs';
import assert from 'node:assert/strict';

const consoleSource = fs.readFileSync(new URL('../src/console.js', import.meta.url), 'utf8');

assert.ok(consoleSource.includes('id="recoverRequestStep"'), 'recovery request step missing');
assert.ok(consoleSource.includes('id="recoverResetStep" class="hidden"'), 'recovery reset step should start hidden');

for (const id of ['recoverToken', 'recoverNewPassword', 'recoverNewPassword2']) {
  const inputTag = consoleSource.match(new RegExp(`<input id="${id}"[^>]*>`))?.[0] || '';
  assert.ok(inputTag, `${id} input missing`);
  assert.equal(/\srequired(?:\s|>)/.test(inputTag), false, `${id} must not be required while its step is hidden`);
}

console.log('recovery UI hidden-field validation regression PASS');
