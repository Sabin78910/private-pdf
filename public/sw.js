// The build fills in the cache name and the precache list (see src/core/precache.ts),
// so the whole app is cached on first visit and runs offline. OCR files in ./ocr/
// are cached the first time OCR runs, so the large language data is not downloaded up front.
const CACHE = "private-pdf-__BUILD__";
const PRECACHE = self.__PRECACHE__ || [];
const SHELL = ["./", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      // One missing file must not stop the rest from being cached.
      Promise.all([...new Set([...SHELL, ...PRECACHE])].map((u) => c.add(u).catch(() => undefined))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function fromNetwork(req) {
  return fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
}

// Pages are network-first so updates show up; built files are cache-first so the app
// opens instantly and works with no connection.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    event.respondWith(fromNetwork(req).catch(() => caches.match(req).then((hit) => hit || caches.match("./"))));
    return;
  }
  event.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fromNetwork(req)));
});
