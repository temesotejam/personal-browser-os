const CACHE_NAME = "personal-browser-os-v6";
const RELEASE = "ja-20261101-6";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?release=" + RELEASE,
  "./app.js?release=" + RELEASE,
  "./manifest.webmanifest",
  "./assets/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((clients) => Promise.all(
        clients.map((client) => client.navigate(client.url).catch(() => null))
      ))
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy))
            .then(() => response);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          return (await caches.match("./index.html")) || (await caches.match("./"));
        }
        return Response.error();
      })
  );
});
