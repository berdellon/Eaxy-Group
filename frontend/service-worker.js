const CACHE_NAME = "eaxy-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/home.html",
  "/manifest.json",
  "/static/css/style.css",
  "/static/js/app.js"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => 
cache.addAll(urlsToCache)));
  self.skipWaiting();
});
self.addEventListener("fetch", event => {
  event.respondWith(caches.match(event.request).then(response => response 
|| fetch(event.request)));
});
