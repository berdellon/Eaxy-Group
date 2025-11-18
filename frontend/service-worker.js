const CACHE_NAME = 'eaxy-cache-v1';
const assets = [
  '/',
  '/index.html',
  '/home.html',
  '/manifest.json',
  '/static/css/style.css',
  '/static/js/app.js'
];

self.addEventListener('install', evt => {
  evt.waitUntil(caches.open(CACHE_NAME).then(cache => 
cache.addAll(assets)));
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  evt.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', evt => {
  evt.respondWith(caches.match(evt.request).then(res => res || 
fetch(evt.request)));
});
