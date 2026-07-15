import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished assessment shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>數學等級評比器/);
  assert.match(html, /MATH\/\/SCAN/);
  assert.match(html, /DIAGNOSTIC v4\.0/);
  assert.match(html, /120(?:<!-- -->)?-ITEM BANK/);
  assert.match(html, /通常以 10 題完成能力定位/);
  assert.match(html, /多次評量採近期加權、同題去重/);
  assert.match(html, /訪客模式不讀取也不寫入歷史/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Codex is working/i);
});

test("keeps starter preview files removed", async () => {
  await assert.rejects(access(new URL("../app/_sites-preview/", import.meta.url)));
});
