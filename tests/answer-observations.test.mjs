import test from "node:test";
import assert from "node:assert/strict";

import {
  OBSERVATION_THRESHOLDS,
  classifyAnswerObservation,
  findLatestHistoricalAnswer,
} from "../app/answer-observations.js";

const base = {
  elapsedSeconds: 100,
  targetSeconds: 100,
  expectedCorrectProbability: 0.8,
  previouslySeen: false,
  selectedChoiceIndex: 1,
  previousCorrect: null,
  previousSelectedChoiceIndex: null,
};

function classify(overrides = {}) {
  return classifyAnswerObservation({ ...base, correct: true, ...overrides });
}

test("classifies all nine primary answer states", () => {
  assert.equal(classify({ expectedCorrectProbability: 0.549 }).status, "高難命中");
  assert.equal(classify({ expectedCorrectProbability: 0.55 }).status, "能力邊界命中");
  assert.equal(classify({ expectedCorrectProbability: 0.72 }).status, "穩定命中");
  assert.equal(classify({ elapsedSeconds: 59 }).status, "快速命中");
  assert.equal(classify({ elapsedSeconds: 130 }).status, "命中但可加速");
  assert.equal(classify({ correct: false, expectedCorrectProbability: 0.7 }).status, "高預期失誤");
  assert.equal(classify({ correct: false, expectedCorrectProbability: 0.69, elapsedSeconds: 59 }).status, "快速作答失誤");
  assert.equal(classify({ correct: false, expectedCorrectProbability: 0.69, elapsedSeconds: 130 }).status, "思考後仍待確認");
  assert.equal(classify({ correct: false, expectedCorrectProbability: 0.69 }).status, "需要再確認");
});

test("keeps threshold boundaries explicit and ignores interrupted speed", () => {
  assert.deepEqual(OBSERVATION_THRESHOLDS, {
    challengeProbability: 0.55,
    boundaryProbability: 0.72,
    unexpectedMissProbability: 0.7,
    rushedRatio: 0.6,
    slowRatio: 1.3,
    interruptedRatio: 3,
    lowInformationCorrectProbability: 0.85,
    lowInformationMissProbability: 0.25,
  });
  assert.equal(classify({ elapsedSeconds: 60 }).isRushed, false);
  assert.equal(classify({ elapsedSeconds: 300 }).isSlow, true);
  const interrupted = classify({ correct: false, expectedCorrectProbability: 0.69, elapsedSeconds: 301 });
  assert.equal(interrupted.interrupted, true);
  assert.equal(interrupted.isSlow, false);
  assert.equal(interrupted.isRushed, false);
  assert.equal(interrupted.status, "需要再確認");
  assert.ok(interrupted.chips.some((chip) => chip.label === "時間不判讀"));
});

test("uses one primary state and retains secondary pace signals", () => {
  const hardAndSlow = classify({ expectedCorrectProbability: 0.3, elapsedSeconds: 150 });
  assert.equal(hardAndSlow.status, "高難命中");
  assert.equal(hardAndSlow.tone, "challenge");
  assert.ok(hardAndSlow.chips.some((chip) => chip.label === "慢速訊號"));

  const surprisingAndFast = classify({
    correct: false,
    expectedCorrectProbability: 0.8,
    elapsedSeconds: 40,
  });
  assert.equal(surprisingAndFast.status, "高預期失誤");
  assert.equal(surprisingAndFast.tone, "surprise");
  assert.ok(surprisingAndFast.chips.some((chip) => chip.label === "偏快作答"));
});

test("describes repeated-answer changes without overdiagnosing causes", () => {
  const cases = [
    [{ previousCorrect: false, correct: true }, "improved", "本輪修正"],
    [{ previousCorrect: true, correct: true }, "consistent", "同題再測命中"],
    [{ previousCorrect: true, correct: false }, "changed", "再測有波動"],
    [{ previousCorrect: false, correct: false, previousSelectedChoiceIndex: 1 }, "same-choice", "相同選項再現"],
    [{ previousCorrect: false, correct: false, previousSelectedChoiceIndex: 2 }, "repeated-miss", "再測仍待確認"],
  ];

  for (const [overrides, signal, chipLabel] of cases) {
    const result = classify({ previouslySeen: true, ...overrides });
    assert.equal(result.retestSignal, signal);
    assert.ok(result.chips.some((chip) => chip.label === chipLabel));
    assert.doesNotMatch(result.observation, /你在猜答|你很粗心|已形成迷思|表示你退步|你不專心/);
  }
});

test("marks low-information outcomes as a secondary signal", () => {
  assert.ok(classify({ expectedCorrectProbability: 0.9 }).chips.some((chip) => chip.label === "低資訊作答"));
  assert.ok(classify({ correct: false, expectedCorrectProbability: 0.2 }).chips.some((chip) => chip.label === "低資訊作答"));
  assert.equal(classify({ expectedCorrectProbability: 0.7 }).isLowInformation, false);
});

test("finds the newest prior response while excluding the current report", () => {
  const sessions = [
    { id: "MS-OLD-0001", completedAt: 100, answers: [{ questionId: "q1", selectedChoiceIndex: 0, correct: false }] },
    { id: "MS-CURRENT-1", completedAt: 300, answers: [{ questionId: "q1", selectedChoiceIndex: 2, correct: false }] },
    { id: "MS-NEW-0002", completedAt: 200, answers: [{ questionId: "q1", selectedChoiceIndex: 1, correct: true }] },
  ];
  assert.deepEqual(findLatestHistoricalAnswer(sessions, "q1", "MS-CURRENT-1"), {
    questionId: "q1",
    selectedChoiceIndex: 1,
    correct: true,
    completedAt: 200,
  });
  assert.equal(findLatestHistoricalAnswer(sessions, "missing"), null);
});
