/*
 * Cleanup worker for the brief period when the PWA lived at the site root.
 * It replaces that old root-scoped worker, clears its cache, and unregisters
 * itself. The actual installable app continues to use /pwa/sw.js.
 */
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
  await self.registration.unregister();
  const windows = await self.clients.matchAll({ type: "window" });
  await Promise.all(windows.map((client) => client.navigate(client.url)));
})()));
