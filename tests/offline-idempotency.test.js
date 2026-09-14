const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const worker = fs.readFileSync('cloudflare/src/index.js', 'utf8');
const app = fs.readFileSync('pwa/app.js', 'utf8');
const migration = fs.readFileSync('cloudflare/migrations/0017_offline_mutation_receipts.sql', 'utf8');

const start = worker.indexOf('function offlineMutationAllowed(');
const end = worker.indexOf('async function handleRequest(');
const context = vm.createContext({});
vm.runInContext(`${worker.slice(start, end)}; globalThis.allowed = offlineMutationAllowed;`, context);

test('server replay allowlist matches safe collaboration actions', () => {
  assert.equal(context.allowed('/projects/p1/reviews', 'POST'), true);
  assert.equal(context.allowed('/content-posts/c1/feedback', 'POST'), true);
  assert.equal(context.allowed('/inquiries/i1', 'PATCH'), true);
  assert.equal(context.allowed('/projects/p1/invoices', 'POST'), false);
  assert.equal(context.allowed('/projects/p1/meetings', 'POST'), false);
  assert.equal(context.allowed('/projects/p1/files', 'POST'), false);
});

test('receipts are user scoped and preserve completed responses', () => {
  assert.match(migration, /primary key\(user_id,id\)/i);
  assert.match(migration, /references users\(id\) on delete cascade/i);
  assert.match(worker, /select state,response_status,response_body from offline_mutation_receipts where user_id=\? and id=\?/);
  assert.match(worker, /x-idempotent-replay/);
  assert.match(worker, /delete from offline_mutation_receipts where user_id=\? and id=\?/);
});

test('client sends queued actions through the idempotent replay endpoint', () => {
  assert.match(app, /await live\("\/offline-sync"/);
  assert.match(app, /body: JSON\.stringify\(item\)/);
  assert.match(app, /replay: true/);
});
