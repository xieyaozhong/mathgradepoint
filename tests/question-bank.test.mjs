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

test("result recommends one public learning route with progressive support", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /推薦學習武器/);
  assert.match(page, /解題流程/);
  assert.match(page, /概念整理/);
  assert.match(page, /重點整理/);
  assert.match(page, /方向提示/);
  assert.match(page, /關鍵缺口/);
  assert.match(page, /操作框架/);
  assert.match(page, /revealedHintLevel/);
  assert.match(page, /expectedCorrectProbability/);
  assert.match(page, /targetSeconds/);
  assert.match(page, /不是固定學習風格分類/);
  assert.doesNotMatch(page, /劍系統|弓系統|杖系統|磨刀石|穩定指板|魔石/);
});
