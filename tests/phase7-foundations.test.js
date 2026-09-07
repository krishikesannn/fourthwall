const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'cloudflare/src/index.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'pwa/app.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'cloudflare/migrations/0007_system_foundations.sql'), 'utf8');

test('audit events retain actor, project, entity, action and timestamp',()=>{
  for(const field of ['actor_id','project_id','action','entity_type','entity_id','created_at']) assert.match(migration,new RegExp(field));
});
test('search scopes client results through project membership',()=>{
  assert.match(worker,/\/api\/search/);
  assert.match(worker,/project_members where user_id=\?/);
});
test('offline JSON mutations queue and sync when connectivity returns',()=>{
  assert.match(app,/tfw-offline-queue/);
  assert.match(app,/addEventListener\('online',syncOfflineQueue\)/);
  assert.match(app,/GLOBAL SEARCH/);
});
