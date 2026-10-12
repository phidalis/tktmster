/*
 * Service worker - offline-first app shell.
 * Bump CACHE when you deploy new assets to force a re-cache.
 */
var CACHE = 'tm-v1';

var APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './store.js',
  './firebase.js',
  './logo.svg',
  './flag.svg',
  './logo-email.svg',
  './confirm.html',
  './confirm.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './admin/',
  './admin/index.html',
  './admin/login.html',
  './admin/login.js',
  './admin/dashboard.html',
  './admin/dashboard.js',
  './admin/admin.css'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        return Promise.all(APP_SHELL.map(function (url) {
          return cache.add(url).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) { return key !== CACHE; })
            .map(function (key) { return caches.delete(key); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);

  // Navigations: network-first, fall back to the cached app shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put('./index.html', copy);
          });
          return response;
        })
        .catch(function () {
          return caches.match('./index.html');
        })
    );
    return;
  }

  // Same-origin assets (js/css/svg): stale-while-revalidate.
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        var network = fetch(request).then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        }).catch(function () { return cached; });
        return cached || network;
      })
    );
    return;
  }

  // Cross-origin (Firebase CDN, event images): cache-first with runtime fill.
  event.respondWith(
    caches.open(CACHE)
      .then(function (cache) {
        return cache.match(request).then(function (cached) {
          if (cached) return cached;
          return fetch(request).then(function (response) {
            if (response && (response.ok || response.type === 'opaque')) {
              var copy = response.clone();
              cache.put(request, copy);
            }
            return response;
          });
        });
      })
      .catch(function () { return fetch(request); })
  );
});