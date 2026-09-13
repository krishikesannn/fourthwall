const CACHE='fourth-wall-v12',SHELL=['./','./index.html','./styles.css','./editor.css','./calendar.css','./app.js','./manifest.json','./icon.svg'];
const shellUrls = new Set(SHELL.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  // Private API responses must never enter the static shell cache.
  if (event.request.method !== 'GET' || event.request.headers.has('authorization')) return;
  const url = new URL(event.request.url);
  url.search = '';
  if (!shellUrls.has(url.href)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(url.href);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type !== 'opaque') await cache.put(url.href, response.clone());
    return response;
  }));
});
