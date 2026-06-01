/* LOVEFLIX — sw.js
   Tiny, safe service worker:
     - precaches the app shell on install
     - cache-first for static assets (css/js/img/font)
     - network-first for HTML (so updates ship immediately)
     - never caches Firebase / firestore / auth calls
*/
const VERSION = "loveflix-v3-2026-06-01";
const SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/perf.css",
  "/mobile.css",
  "/ui-fixes.css",
  "/polish.css",
  "/polish-v2.css",
  "/app.js",
  "/polish.js",
  "/lazy-images.js",
  "/manifest.webmanifest"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // NEVER intercept Firebase / Firestore / Auth / Google APIs
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("firebaseapp.com") ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("identitytoolkit") ||
    url.hostname.includes("securetoken")
  ) {
    return;
  }

  // HTML → network-first
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Static → cache-first
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
