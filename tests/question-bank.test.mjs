import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../scripts/apply-analysis-upgrade.mjs");

const coreSourceUrl = new URL("../app/math-data.ts", import.meta.url);
const extraSourceUrl = new URL("../app/extra-questions.ts", import.meta.url);

function extractItems(source) {
  return [...source.matchAll(/q\("([^"]+)",\s*(\d+),\s*"([^"]+)",\s*"([^"]+)"/g)].map((match) => ({
    id: match[1],
    level: Number(match[2]),
    topic: match[3],
    format: match[4],
  }));
}

test("question bank has expanded balanced coverage and diverse formats", async () => {
  const [coreSource, extraSource] = await Promise.all([
    readFile(coreSourceUrl, "utf8"),
    readFile(extraSourceUrl, "utf8"),
  ]);
  const items = [...extractItems(coreSource), ...extractItems(extraSource)];

  assert.equal(items.length, 120);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);

  for (let level = 1; level <= 12; level += 1) {
    const levelItems = items.filter((item) => item.level === level);
    assert.equal(levelItems.length, 10, `level ${level} should have ten items`);
    assert.ok(new Set(levelItems.map((item) => item.format)).size >= 3, `level ${level} should cover at least three formats`);
  }

  assert.deepEqual(
    new Set(items.map((item) => item.format)),
    new Set(["calculation", "application", "data", "reasoning", "concept"]),
  );
  assert.deepEqual(
    new Set(items.map((item) => item.topic)),
    new Set([
      "arithmetic",
      "geometry",
      "algebra",
      "functions",
      "trigonometry",
      "data-probability",
      "calculus",
      "linear-algebra",
      "analysis",
    ]),
  );
  assert.match(coreSource, /\.\.\.CORE_BANK, \.\.\.EXTRA_BANK/);
});

test("diagnostic actions remain browser-local", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const deepAnalysis = await readFile(new URL("../app/deep-analysis-panel.tsx", import.meta.url), "utf8");
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /下載文字診斷/);
  assert.match(page, /localStorage/);
  assert.doesNotMatch(`${page}\n${deepAnalysis}`, /fetch\(|openai|chatgpt/i);
});

test("assessment stops at ten unless calibration signals require more evidence", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /BASE_QUESTIONS = 10/);
  assert.match(page, /MAX_QUESTIONS = 14/);
  assert.match(page, /function calibrationReasons/);
  assert.match(page, /intervalWidth > 3\.4/);
  assert.match(page, /coveredTopics < 4/);
  assert.match(page, /coveredFormats < 4/);
  assert.match(page, /hardWins >= 2/);
  assert.match(page, /highExpectationMisses >= 2/);
  assert.match(page, /Math\.abs\(firstAccuracy - secondAccuracy\) >= 50/);
  assert.match(page, /return calibrationReasons\(state\)\.length === 0/);
  assert.match(page, /calibrationNearby/);
  assert.match(page, /calibrationTopicBonus/);
  assert.match(page, /CALIBRATION MODE/);
  assert.match(page, /進入校正題/);
  assert.match(page, /10 題標準掃描/);
});

test("calibration questions switch the top status light to red", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const isCalibrationQuestion = phase === "quiz" && currentStep > BASE_QUESTIONS/);
  assert.match(page, /isCalibrationQuestion \? "is-calibrating" : ""/);
  assert.match(page, /CALIBRATION SIGNAL/);
  assert.match(css, /\.system-status\.is-calibrating/);
  assert.match(css, /\.system-status\.is-calibrating > span/);
  assert.match(css, /background: var\(--danger\)/);
});

test("result includes granular performance analysis", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const deepAnalysis = await readFile(new URL("../app/deep-analysis-panel.tsx", import.meta.url), "utf8");

  assert.match(page, /DeepAnalysisPanel/);
  assert.match(deepAnalysis, /題型剖面/);
  assert.match(deepAnalysis, /難度帶表現/);
  assert.match(deepAnalysis, /前後段趨勢/);
  assert.match(deepAnalysis, /超預期命中/);
  assert.match(deepAnalysis, /校準差/);
  assert.match(deepAnalysis, /平均作答節奏/);
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
