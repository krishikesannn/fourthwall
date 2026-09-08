const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Android app includes a Capacitor 8 compatible biometric lock', () => {
  const pkg = JSON.parse(read('package.json'));
  const app = read('pwa/app.js');
  assert.match(pkg.dependencies['@aparajita/capacitor-biometric-auth'], /^\^9\./);
  assert.match(app, /BiometricAuth/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /nativeUnlock\(true\)/);
  assert.match(app, /\/settings\/profile/);
});

test('weekly digest is scheduled and dispatched by the Worker', () => {
  const worker = read('cloudflare/src/index.js');
  assert.match(worker, /async function sendWeeklyDigests/);
  assert.match(worker, /async scheduled\(/);
  assert.match(worker, /weekly_digest=1/);
  assert.match(worker, /api\.resend\.com\/emails/);
  for (const file of ['wrangler.toml', 'cloudflare/wrangler.toml']) {
    assert.match(read(file), /crons = \["0 4 \* \* 1"\]/);
  }
});

test('service worker cache includes the native settings release or newer', () => {
  const version = Number(read('pwa/sw.js').match(/fourth-wall-v(\d+)/)?.[1]);
  assert.ok(version >= 9);
});
