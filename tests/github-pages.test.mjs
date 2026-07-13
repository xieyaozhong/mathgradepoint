import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const outputUrl = new URL("../github-dist/", import.meta.url);

test("GitHub Pages build is self-contained and uses relative assets", async () => {
  const html = await readFile(new URL("index.html", outputUrl), "utf8");
  const pagesBasePath = process.env.PAGES_BASE_PATH?.replace(/\/+$/, "");
  const expectedAssetPrefix = pagesBasePath ? `${pagesBasePath}/assets/` : "./assets/";

  assert.match(html, /<title>數學等級評比器/);
  assert.ok(html.includes(expectedAssetPrefix));
  assert.doesNotMatch(html, /__SITE_URL__/);
  await access(new URL("og.png", outputUrl));
});
