// SAMA XHEL n'utilise plus de « service worker » : il gardait une ancienne version de l'application
// (et des voix) dans le navigateur. Celui-ci remplace l'ancien, vide ses caches puis se désinstalle.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
  })());
});
