// Bump this version string whenever you deploy an update!
const CACHE_NAME = 'elden-EARTH-v21.77';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './manifest.json',
    './models/CesiumMan.glb',
    './models/Fox.glb',
    './models/Soldier.glb',
    './models/Xbot.glb',
    './js/main.js',
    './js/foliage.js',
    './js/friends.js',
    './js/loading.js',
    './js/leaderboard.js',
    './js/wheel.js',
    './js/diamonds.js',
    './js/auth.js',
    './js/anticheat.js',
    './js/storage.js',
    './js/multiplier.js',
    './js/grid.js',
    './js/geo.js',
    './js/feed.js',
    './js/config.js',
    './js/character.js',
    './js/citadels.js',
    './js/chat.js',
    './js/pool.js',
    './js/referrals.js',
    './js/server-anticheat.js'
];

// 1. Force Immediate Installation
self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. Instant Cache Purge & Take Immediate Control
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((oldCache) => {
                    if (oldCache !== CACHE_NAME) {
                        console.log(`[SW] Deleting stale cache: ${oldCache}`);
                        return caches.delete(oldCache);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// 3. Network-First with cache-busting (bypasses browser HTTP cache entirely)
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    if (!e.request.url.startsWith(self.location.origin)) return;

    e.respondWith(
        fetch(e.request, { cache: 'no-store' })
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(e.request);
            })
    );
});
