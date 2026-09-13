const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function worker(network) {
  const handlers = {}, puts = [], cached = { source: 'cache' };
  const cache = {
    addAll: async () => {},
    put: async (url, response) => puts.push([url, response]),
    match: async () => cached,
  };
  const caches = { open: async () => cache, match: async () => cached, keys: async () => [] };
  const self = {
    registration: { scope: 'https://site.test/pwa/' },
    clients: { claim: async () => {} },
    addEventListener: (name, handler) => { handlers[name] = handler; },
  };
  vm.runInNewContext(fs.readFileSync('pwa/sw.js', 'utf8'), { self, caches, fetch: network, URL, Set });
  return { handlers, puts, cached };
}

function request(url, authorization = false) {
  return { method: 'GET', url, headers: { has: name => name === 'authorization' && authorization } };
}

test('the service worker never intercepts API, external, or authenticated requests', () => {
  const { handlers } = worker(async () => { throw Error('unused'); });
  for (const item of [
    request('https://site.test/api/projects'),
    request('https://worker.test/api/projects'),
    request('https://site.test/pwa/app.js', true),
  ]) {
    let intercepted = false;
    handlers.fetch({ request: item, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});

test('online shell requests return and cache the newest release', async () => {
  const fresh = { source: 'network', ok: true, type: 'basic', clone() { return this; } };
  const { handlers, puts } = worker(async () => fresh);
  let result;
  handlers.fetch({ request: request('https://site.test/pwa/app.js?v=2'), respondWith: value => { result = value; } });
  assert.equal(await result, fresh);
  assert.equal(puts.length, 1);
  assert.equal(puts[0][0], 'https://site.test/pwa/app.js');
});

test('offline shell requests fall back to the installed cache', async () => {
  const { handlers, cached } = worker(async () => { throw Error('offline'); });
  let result;
  handlers.fetch({ request: request('https://site.test/pwa/app.js'), respondWith: value => { result = value; } });
  assert.equal(await result, cached);
});
