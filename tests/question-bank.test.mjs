import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../app/math-data.ts", import.meta.url);

test("question bank has balanced level coverage and diverse formats", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const items = [...source.matchAll(/q\("([^"]+)",\s*(\d+),\s*"([^"]+)",\s*"([^"]+)"/g)].map((match) => ({
    id: match[1],
    level: Number(match[2]),
    topic: match[3],
    format: match[4],
  }));

  assert.equal(items.length, 60);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);

  for (let level = 1; level <= 12; level += 1) {
    assert.equal(items.filter((item) => item.level === level).length, 5, `level ${level} should have five items`);
  }

  assert.deepEqual(
    new Set(items.map((item) => item.format)),
    new Set(["calculation", "application", "data", "reasoning", "concept"]),
  );
  assert.ok(items.some((item) => item.topic === "data-probability"));
});

test("diagnostic actions remain browser-local", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /下載文字診斷/);
  assert.match(page, /localStorage/);
  assert.doesNotMatch(page, /fetch\(|openai|chatgpt/i);
});
