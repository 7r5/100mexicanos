const CACHE_NAME = "mexicanos-shell-v1";

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

// Network-first passthrough, only needed so browsers consider the app installable.
self.addEventListener("fetch", (event) => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request)),
    );
});
