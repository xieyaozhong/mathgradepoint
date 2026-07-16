import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../scripts/apply-analysis-upgrade.mjs");
await import("../scripts/apply-calibration-signal-fix.mjs");

const coreSourceUrl = new URL("../app/math-data.ts", import.meta.url);
const extraSourceUrl = new URL("../app/extra-questions.ts", import.meta.url);

function extractItems(source) {
  return [...source.matchAll(/q\(\s*"([^"]+)",\s*(\d+),\s*"([^"]+)",\s*"([^"]+)"/g)].map((match) => ({
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

  assert.equal(items.length, 160);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);

  for (let level = 1; level <= 12; level += 1) {
    const levelItems = items.filter((item) => item.level === level);
    assert.ok(levelItems.length >= 12, `level ${level} should have at least twelve items`);
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
  const history = await readFile(new URL("../app/history-engine.js", import.meta.url), "utf8");
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /下載文字診斷/);
  assert.match(page, /localStorage/);
  assert.match(page, /訪客模式/);
  assert.match(page, /clearAssessmentHistory/);
  assert.doesNotMatch(`${page}\n${deepAnalysis}`, /fetch\(|sendBeacon|WebSocket|openai|chatgpt/i);
  assert.doesNotMatch(history, /learnerName|prompt|rationale|correctAnswer/);
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
  assert.match(page, /評量結構：\$\{BASE_QUESTIONS\} 題標準掃描/);
});

test("calibration signal and progress lights turn red when extra evidence is required", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const calibrationRequired =/);
  assert.match(page, /quizState\.answers\.length >= BASE_QUESTIONS/);
  assert.match(page, /!shouldStop\(quizState\)/);
  assert.match(page, /currentStep > BASE_QUESTIONS \|\| \(Boolean\(feedback\) && calibrationRequired\)/);
  assert.match(page, /topbar screen-only \$\{isCalibrationQuestion \? "is-calibrating" : ""\}/);
  assert.match(page, /segment-progress \$\{isCalibrationQuestion \? "is-calibrating" : ""\}/);
  assert.match(page, /index >= BASE_QUESTIONS \? "calibration-segment" : "standard-segment"/);
  assert.match(page, /className="calibration-alert"/);
  assert.match(page, /校正模式啟動：系統正在確認能力區間/);
  assert.match(page, /CALIBRATION SIGNAL/);
  assert.match(css, /\.topbar\.is-calibrating/);
  assert.match(css, /\.system-status\.is-calibrating > span/);
  assert.match(css, /\.segment-progress\.is-calibrating i\.calibration-segment\.done/);
  assert.match(css, /\.segment-progress\.is-calibrating i\.calibration-segment\.current/);
  assert.match(css, /\.calibration-alert-light/);
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

test("multi-attempt scoring is robust to stale and repeated evidence", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const history = await readFile(new URL("../app/history-engine.js", import.meta.url), "utf8");

  assert.match(history, /ageDays \/ 120/);
  assert.match(history, /MAX_HISTORICAL_WEIGHT = 10/);
  assert.match(history, /latestByQuestion\.set/);
  assert.match(history, /0\.85 \* value \+ 0\.15 \* uniform/);
  assert.match(page, /historyWithoutRetestedItems/);
  assert.match(page, /previouslySeen \? 0\.58 : 1/);
  assert.match(page, /posteriorBeforeAnswer/);
  assert.match(page, /activeHistoryBaseline\.effectiveAnswerCount \* historyPower/);
  assert.match(page, /weight = affinity \* relevance \* answer\.evidenceWeight/);
  assert.match(page, /weightedCorrect/);
  assert.match(page, /sessionIntervalWidth > 3\.8/);
  assert.match(page, /historyPower/);
});

test("result provides a complete item-by-item audit", async () => {
  const [page, css, observations] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/answer-observations.js", import.meta.url), "utf8"),
  ]);

  assert.match(page, /每題分析/);
  assert.match(page, /quizState\.answers\.map\(\(answer, index\) =>/);
  assert.match(page, /makeQuestionAnalysis\(answer, index, previousAnswer\)/);
  assert.match(page, /你的答案/);
  assert.match(page, /參考答案/);
  assert.match(page, /作答時間/);
  assert.match(page, /本題證據/);
  assert.match(page, /判讀只描述可觀察的作答訊號/);
  assert.match(page, /快速檢查/);
  assert.match(`${page}\n${observations}`, /重複題降權/);
  assert.match(page, /questionAnalyses\.map/);
  assert.match(page, /狀態色譜/);
  assert.match(page, /命中訊號/);
  assert.match(page, /速度訊號/);
  assert.match(page, /跨次訊號/);
  for (const label of ["穩定命中", "高難命中", "能力邊界命中", "快速命中", "命中但可加速", "高預期失誤", "快速作答失誤", "思考後仍待確認", "需要再確認"]) {
    assert.match(`${page}\n${observations}`, new RegExp(label));
  }
  for (const tone of ["stable", "challenge", "boundary", "efficient", "slow", "surprise", "rushed", "deliberate", "review"]) {
    assert.match(css, new RegExp(`state-${tone}`));
    assert.match(css, new RegExp(`signal-${tone}`));
  }
  assert.doesNotMatch(observations, /你在猜答|你很粗心|已形成迷思|表示你退步|你不專心/);
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
