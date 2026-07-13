import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const outputUrl = new URL("../github-dist/", import.meta.url);

test("GitHub Pages build is self-contained and uses relative assets", async () => {
  const html = await readFile(new URL("index.html", outputUrl), "utf8");
  const pagesBasePath = process.env.PAGES_BASE_PATH?.replace(/\/+$/, "");
  const expectedAssetPrefix = pagesBasePath ? `${pagesBasePath}/assets/` : "./assets/";
  const expectedPublicPrefix = pagesBasePath ? `${pagesBasePath}/` : "./";

  assert.match(html, /<title>數學等級評比器/);
  assert.match(html, /2026-07-13-calibration-signal-v6/);
  assert.match(html, /標準掃描 10 題/);
  assert.ok(html.includes(expectedAssetPrefix));
  assert.ok(
    html.includes(`href="${expectedPublicPrefix}manifest.webmanifest"`),
  );
  assert.ok(
    html.includes(`href="${expectedPublicPrefix}app-icon-192.jpg"`),
  );
  assert.ok(
    html.includes(`href="${expectedPublicPrefix}apple-touch-icon.png"`),
  );
  assert.doesNotMatch(html, /__SITE_URL__/);

  const manifest = JSON.parse(
    await readFile(new URL("manifest.webmanifest", outputUrl), "utf8"),
  );
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./?source=pwa");
  assert.equal(manifest.scope, "./");
  assert.ok(
    manifest.icons.some(
      (icon) =>
        icon.src === "apple-touch-icon.png" &&
        icon.sizes === "180x180" &&
        icon.type === "image/png",
    ),
  );
  assert.ok(
    manifest.icons.some(
      (icon) =>
        icon.src === "app-icon-192.jpg" &&
        icon.sizes === "192x192" &&
        icon.type === "image/jpeg",
    ),
  );
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));

  const serviceWorker = await readFile(new URL("sw.js", outputUrl), "utf8");
  assert.match(serviceWorker, /addEventListener\("install"/);
  assert.match(serviceWorker, /addEventListener\("fetch"/);
  assert.match(serviceWorker, /navigationPreload/);
  assert.match(serviceWorker, /apple-touch-icon\.png/);
  assert.match(serviceWorker, /app-icon-192\.jpg/);
  assert.match(serviceWorker, /v6-calibration-signal-20260713/);
  assert.match(serviceWorker, /request\.destination === "script"/);
  assert.match(serviceWorker, /cache: "no-cache"/);

  const registrationSource = await readFile(
    new URL("../github/src/main.tsx", import.meta.url),
    "utf8",
  );
  assert.match(registrationSource, /2026-07-13-calibration-signal-v6/);
  assert.match(registrationSource, /controllerchange/);
  assert.match(registrationSource, /SKIP_WAITING/);
  assert.match(registrationSource, /updateViaCache: "none"/);

  await Promise.all([
    access(new URL("og.png", outputUrl)),
    access(new URL("apple-touch-icon.png", outputUrl)),
    access(new URL("app-icon-192.jpg", outputUrl)),
    access(new URL("icon.svg", outputUrl)),
    access(new URL("icon-maskable.svg", outputUrl)),
  ]);
});
