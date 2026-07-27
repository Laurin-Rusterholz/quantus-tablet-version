const CACHE = "quantus-tablet-v4-speicher";
const SHELL = ["/", "/index.html", "/styles.css", "/tablet-workspace.css", "/sync-core.js", "/tablet-workspace.js", "/app.js", "/icon.svg", "/manifest.webmanifest"];
const NETWORK_TIMEOUT_MS = 3500;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("network-timeout")), ms);
    fetch(request).then(
      (response) => { clearTimeout(timer); resolve(response); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

// Navigationen: Netz zuerst, aber mit hartem Timeout – bei langsamer oder
// fehlender Verbindung startet die App sofort aus dem Cache.
async function networkFirst(request) {
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return (await caches.match(request)) || (await caches.match("/index.html")) || Response.error();
  }
}

// Statische Dateien: sofort aus dem Cache antworten und im Hintergrund
// aktualisieren (stale-while-revalidate) – schnelle Starts, frische Dateien.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || (await caches.match("/index.html")) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
