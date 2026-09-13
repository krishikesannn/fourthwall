const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('pwa/app.js', 'utf8');
function fixture(fetch) {
  const storage = new Map();
  const context = vm.createContext({
    liveSession: { token: 'test', user: { id: 'a' } }, LIVE_API: 'http://test',
    navigator: { onLine: true }, crypto: { randomUUID: () => 'new' },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    toast() {}, fetch, ArrayBuffer, Blob,
  });
  vm.runInContext(source.slice(source.indexOf('const readOfflineQueue'), source.indexOf('window.addEventListener("online"')), context);
  return { context, put: rows => storage.set('tfw-offline-queue', JSON.stringify(rows)), read: () => JSON.parse(storage.get('tfw-offline-queue')) };
}
const action = { id: 'one', userId: 'a', path: '/comments', method: 'POST', body: '{}' };
test('failed reconnect preserves the original queued action without duplicating it', async () => {
  const f = fixture(async () => { throw Error('offline'); });
  f.put([action]);
  await f.context.syncOfflineQueue();
  assert.deepEqual(f.read(), [action]);
});
test('replay never sends another account or unowned legacy actions', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; });
  const rows = [{ ...action, userId: 'b' }, { ...action, id: 'legacy', userId: undefined }];
  f.put(rows);
  await f.context.syncOfflineQueue();
  assert.equal(calls, 0);
  assert.equal(f.read().length, 2);
});
test('successful replay preserves actions added during an in-flight request', async () => {
  let finish;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  f.put([action]);
  const replay = f.context.syncOfflineQueue();
  const later = { ...action, id: 'later' };
  f.put([action, later]);
  await f.context.syncOfflineQueue();
  finish({ ok: true, json: async () => ({}) });
  await replay;
  assert.deepEqual(f.read(), [later]);
});
