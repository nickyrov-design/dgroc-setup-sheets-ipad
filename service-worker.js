/* Setup Sheets PWA — offline cache.
   Bump CACHE_VERSION on any code/template change so installed clients pick it up. */

const CACHE_VERSION = "v4";
const CACHE_NAME = `setup-sheets-${CACHE_VERSION}`;

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/app.css",
  "./vendor/pdf-lib.min.js",
  "./assets/icons/logo.png",
  "./assets/icons/logo_notext.png",
  "./assets/templates/extremity_template.pdf",
  "./assets/templates/head_and_neck_template.pdf",
  "./assets/templates/omniboard_template.pdf",
  "./scripts/app.js",
  "./scripts/router.js",
  "./scripts/storage.js",
  "./scripts/share.js",
  "./scripts/draft.js",
  "./scripts/therapistsPanel.js",
  "./scripts/settingsPanel.js",
  "./scripts/setupSheetLanding.js",
  "./scripts/setupSheetForm.js",
  "./scripts/setupSheetHistory.js",
  "./scripts/setupSheetConfigs/index.js",
  "./scripts/setupSheetConfigs/extremityConfig.js",
  "./scripts/setupSheetConfigs/headAndNeckConfig.js",
  "./scripts/setupSheetConfigs/omniboardConfig.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (!resp || resp.status !== 200 || resp.type === "opaque") return resp;
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return resp;
      }).catch(() => cached);
    })
  );
});
