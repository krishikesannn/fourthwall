const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const worker = fs.readFileSync('cloudflare/src/index.js', 'utf8');
const app = fs.readFileSync('pwa/app.js', 'utf8');

test('profile settings can be read only by an authenticated user', () => {
  assert.match(worker, /settings\/profile" && request\.method === "GET"/);
  assert.match(worker, /select language,biometric_lock,theme,updated_at from user_settings where user_id=\?/);
  assert.match(worker, /if \(!user\) return deny\("Sign in required"\)/);
});

test('saved language and theme are applied during authenticated startup', () => {
  assert.match(app, /await live\("\/settings\/profile"\)/);
  assert.match(app, /data\.language = settings\.language/);
  assert.match(app, /data\.theme = settings\.theme === "dark"/);
  assert.match(app, /data\.language = values\.language/);
});
