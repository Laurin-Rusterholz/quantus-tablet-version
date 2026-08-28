const CACHE = "quantus-tablet-v14-lerncockpit-tipp";
const SHELL = [
  "/", "/index.html", "/styles.css", "/tablet-workspace.css", "/apps.css",
  "/quantus-tablet-expansion.css",
  "/sync-core.js", "/tablet-workspace.js", "/springboard.js", "/mail-app.js", "/flowertech-app.js", "/app.js",
  "/quantus-tablet-expansion.js",
  "/icon.svg", "/manifest.webmanifest"
];
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

async function networkFirst(request, { shellFallback = false } = {}) {
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Nur Seitenaufrufe duerfen auf die Startseite zurueckfallen. Bekaeme ein
    // Skript oder Stylesheet die HTML-Startseite als Antwort, wuerde die App
    // beim Start abbrechen und keine Bedienung mehr reagieren.
    if (shellFallback) return (await caches.match("/index.html")) || Response.error();
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

// Programmcode und Gestaltung immer zuerst aus dem Netz laden. Sonst laeuft auf
// dem Tablet nach einer Aktualisierung eine Mischung aus alten und neuen
// Dateien, in der Knoepfe ins Leere greifen.
const CODE_ASSET = /\.(?:js|css|html|webmanifest)$/i;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, { shellFallback: true }));
    return;
  }
  if (CODE_ASSET.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
