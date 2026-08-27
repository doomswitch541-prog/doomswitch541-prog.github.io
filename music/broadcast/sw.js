const CACHE_NAME = 'rg-broadcast-shell-20260827-6';
const APP_SHELL = '/music/broadcast/index.html';
const PRECACHE_URLS = [
    '/music/broadcast/',
    APP_SHELL,
    '/music/broadcast/manifest.webmanifest?v=20260827-ios2',
    '/music/broadcast/pwa.js?v=20260827-radio1',
    '/css/styles.css',
    '/css/broadcast.css?v=20260827-ios2',
    '/css/radio-surfaces.css',
    '/js/site.js',
    '/js/broadcast.js?v=20260827-radio1',
    '/music/broadcast/icons/rg-broadcast-180.png?v=20260827-ios2',
    '/music/broadcast/icons/rg-broadcast-192.png?v=20260827-ios2',
    '/music/broadcast/icons/rg-broadcast-512.png?v=20260827-ios2',
    '/music/broadcast/icons/rg-broadcast-maskable-512.png?v=20260827-ios2'
];
const SHELL_PATHS = new Set(PRECACHE_URLS.map(url => new URL(url, self.location.origin).pathname));

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key.startsWith('rg-broadcast-shell-') && key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

async function networkFirstNavigation(request) {
    try {
        return await fetch(request);
    } catch {
        const cached = await caches.match(APP_SHELL, { ignoreSearch: true });
        return cached || new Response('RG Broadcast is offline. Reconnect to load the receiver.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(networkFirstNavigation(request));
        return;
    }

    if (SHELL_PATHS.has(url.pathname)) {
        event.respondWith(
            caches.match(request)
                .then(cached => cached || fetch(request))
        );
    }
});
