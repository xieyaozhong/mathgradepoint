const CACHE_PREFIX = "math-scan-pwa";
const CACHE_VERSION = "v8-multiscan-20260715";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const APP_ROOT = new URL(self.registration.scope);
const APP_SHELL = [
  "./",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./app-icon-192.jpg",
  "./icon.svg",
  "./icon-maskable.svg",
  "./og.png",
];

function resolveFromScope(path) {
  return new URL(path, APP_ROOT).toString();
}

function isCacheable(response) {
  return response && response.ok && (response.type === "basic" || response.type === "cors");
}

async function cacheUrl(cache, url) {
  try {
    const response = await fetch(url, { cache: "reload" });
    if (isCacheable(response)) {
      await cache.put(url, response);
    }
  } catch {
    // A single optional resource must not prevent the service worker from installing.
  }
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const rootUrl = resolveFromScope("./");

  await Promise.allSettled(
    APP_SHELL.map((path) => cacheUrl(cache, resolveFromScope(path))),
  );

  try {
    const indexResponse = await fetch(rootUrl, { cache: "reload" });
    if (!isCacheable(indexResponse)) return;

    await cache.put(rootUrl, indexResponse.clone());
    const html = await indexResponse.text();
    const discoveredAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => new URL(match[1], rootUrl))
      .filter(
        (url) =>
          url.origin === self.location.origin &&
          url.pathname.startsWith(APP_ROOT.pathname),
      );

    await Promise.allSettled(
      discoveredAssets.map((url) => cacheUrl(cache, url.toString())),
    );
  } catch {
    // The runtime cache will fill missing resources after the first online load.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await precacheAppShell();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );

      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, preloadResponsePromise) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const preloadResponse = preloadResponsePromise
      ? await preloadResponsePromise
      : undefined;
    const response = preloadResponse || (await fetch(request, { cache: "no-cache" }));

    if (isCacheable(response)) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    return (
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match(resolveFromScope("./"))) ||
      Response.error()
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheable(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(APP_ROOT.pathname)
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, event.preloadResponse));
    return;
  }

  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "worker" ||
    url.pathname.endsWith("manifest.webmanifest")
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
