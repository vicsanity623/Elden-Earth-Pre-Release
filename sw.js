// Bump this version string whenever you deploy an update!
const CACHE_NAME = 'elden-EARTH-v22.94';

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
    './js/elden-stops.js',
    './js/chat.js',
    './js/pool.js',
    './js/referrals.js',
    './js/server-anticheat.js',
    './js/pet.js'
];

// 1. Force Immediate Activation without waiting for tabs to close
self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Cache assets individually: one failed fetch must not abort the
            // whole install (cache.addAll() is all-or-nothing).
            return Promise.all(
                ASSETS_TO_CACHE.map((url) =>
                    cache.add(url).catch((err) => {
                        console.warn(`[SW] Could not precache ${url}:`, err);
                    })
                )
            );
        })
    );
});

// 2. Instant Cache Purge & Force-Refresh All Open Tabs
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
            // Take control of all open clients/tabs immediately
            return self.clients.claim();
        }).then(() => {
            // Send a reload broadcast to all active open tabs
            return self.clients.matchAll({ type: 'window' });
        }).then((clients) => {
            clients.forEach((client) => {
                client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
            });
        })
    );
});

// Allow clients to trigger skipWaiting manually if needed
self.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// 3. Cache-First for immutable binaries, Network-First for everything else
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    if (!e.request.url.startsWith(self.location.origin)) return;

    // Immutable binary assets only change when CACHE_NAME is bumped on deploy,
    // so they never need a network round-trip on every page load.
    const path = new URL(e.request.url).pathname;
    if (/\.(glb|gltf|woff2?|ttf|png|jpg|jpeg|webp|avif|mp3|wasm)$/.test(path)) {
        e.respondWith(
            caches.match(e.request).then((cached) => {
                if (cached) return cached;
                return fetch(e.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(e.request, responseClone);
                        });
                    }
                    return networkResponse;
                });
            })
        );
        return;
    }

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