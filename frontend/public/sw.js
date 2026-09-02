// Bump this on any deploy where the shell caching strategy itself changes —
// old-versioned caches are swept in 'activate'. Hashed asset filenames
// already bust themselves on every build, so this isn't needed for normal
// app updates, only for changes to this file.
const SHELL_CACHE = 'crowsnest-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.add('/')));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n.startsWith('crowsnest-shell-') && n !== SHELL_CACHE).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Offline shell: never touch the API or the socket — only cache the app's
// own static output so the UI can still load (even if it can't fetch live
// data) when the network is down.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    // Vite fingerprints these filenames per build, so a cache hit is always
    // the correct, current version — safe to serve without even checking
    // the network first.
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        return res;
      }))
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Crows Nest', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Crows Nest';
  const options = {
    body: data.body || '',
    icon: '/crowsnest.png',
    badge: '/crowsnest.png',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
