const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'cloudflare/src/index.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'cloudflare/migrations/0006_brand_assets.sql'), 'utf8');
const app = fs.readFileSync(path.join(root, 'pwa/app.js'), 'utf8');

test('brand assets are project scoped and versioned', () => {
  assert.match(migration, /project_id text not null references projects/);
  assert.match(migration, /version integer not null default 1/);
  assert.match(migration, /is_latest integer not null default 1/);
});

test('asset endpoints enforce project and studio authorization', () => {
  assert.match(worker, /assetsMatch.*request\.method === "GET"/s);
  assert.match(worker, /canAccessProject\(env, user, assetsMatch\[1\]\)/);
  assert.match(worker, /assetsMatch.*request\.method === "POST".*studio\(user\)/s);
});

test('client UI downloads through the authenticated Worker route', () => {
  assert.match(app, /BRAND ASSET LIBRARY/);
  assert.match(app, /downloadProjectFile/);
  assert.doesNotMatch(app, /SUPABASE_SECRET_KEY/);
});
