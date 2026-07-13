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
  assert.ok(html.includes(expectedAssetPrefix));
  assert.ok(
    html.includes(`href="${expectedPublicPrefix}manifest.webmanifest"`),
  );
  assert.doesNotMatch(html, /__SITE_URL__/);

  const manifest = JSON.parse(
    await readFile(new URL("manifest.webmanifest", outputUrl), "utf8"),
  );
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./?source=pwa");
  assert.equal(manifest.scope, "./");
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));

  const serviceWorker = await readFile(new URL("sw.js", outputUrl), "utf8");
  assert.match(serviceWorker, /addEventListener\("install"/);
  assert.match(serviceWorker, /addEventListener\("fetch"/);
  assert.match(serviceWorker, /navigationPreload/);

  await Promise.all([
    access(new URL("og.png", outputUrl)),
    access(new URL("icon.svg", outputUrl)),
    access(new URL("icon-maskable.svg", outputUrl)),
  ]);
});
