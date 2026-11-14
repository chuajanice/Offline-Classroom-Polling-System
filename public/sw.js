
const CACHE_NAME = "pollify-offline-v2";
const OFFLINE_PAGE = "/offline.html";
const CONNECTION_TIMEOUT = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_PAGE))
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("pollify-offline-") &&
                key !== CACHE_NAME
            )
            .map((key) => caches.delete(key))
        )
      ),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        CONNECTION_TIMEOUT
      );

      try {
        return await fetch(request, {
          signal: controller.signal,
        });
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const offlinePage = await cache.match(OFFLINE_PAGE);

        return (
          offlinePage ||
          new Response("Pollify is unavailable.", {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
            },
          })
        );
      } finally {
        clearTimeout(timeout);
      }
    })()
  );
});
