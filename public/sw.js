// Smart Grocery service worker: shows reminder pushes and opens the app when one is tapped.
// (No offline caching — the app always loads fresh.)

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Smart Grocery', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Smart Grocery';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    lang: 'he',
    dir: 'auto',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) { await c.focus(); if ('navigate' in c) await c.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
