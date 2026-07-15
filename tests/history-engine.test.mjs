import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_HISTORICAL_WEIGHT,
  appendAssessmentSession,
  buildHistoricalPrior,
  createAssessmentSession,
  parseAssessmentHistory,
} from "../app/history-engine.js";

const BANK_VERSION = "test-bank-v1";
const now = Date.now();
const thetaGrid = Array.from({ length: 111 }, (_, index) => 1 + index / 10);
const bank = Array.from({ length: 20 }, (_, index) => ({
  id: `q${index + 1}`,
  a: 1.15,
  b: 3 + index * 0.35,
  choices: ["A", "B", "C", "D"],
  correctIndex: 0,
}));
const correctIndexByQuestion = new Map(bank.map((item) => [item.id, item.correctIndex]));
const choiceCountByQuestion = new Map(bank.map((item) => [item.id, item.choices.length]));

function makeSession(id, completedAt, correct = true, offset = 0) {
  const answers = bank.slice(offset, offset + 14).map((item) => ({
    questionId: item.id,
    selectedChoiceIndex: correct ? 0 : 1,
    correct,
    elapsedSeconds: 40,
  }));
  return createAssessmentSession({
    id,
    bankVersion: BANK_VERSION,
    completedAt,
    result: {
      ability: correct ? 8 : 4,
      sessionAbility: correct ? 8.2 : 3.8,
      sessionLow: correct ? 7 : 3,
      sessionHigh: correct ? 9 : 5,
      low: correct ? 7 : 3,
      high: correct ? 9 : 5,
      levelIndex: correct ? 7 : 3,
      correctCount: correct ? 14 : 0,
    },
    answers,
  });
}

function posteriorMean(posterior) {
  return posterior.reduce((sum, weight, index) => sum + weight * thetaGrid[index], 0);
}

test("history parser validates bank version and recomputes correctness", () => {
  const stored = makeSession("MS-TEST0001-AAAA1111", now, true);
  stored.answers[0].correct = false;
  const parsed = parseAssessmentHistory(JSON.stringify([stored]), correctIndexByQuestion, BANK_VERSION, choiceCountByQuestion);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].answers[0].correct, true);
  const standardTen = makeSession("MS-STANDARD10-ABCD1234", now, true);
  standardTen.answers = standardTen.answers.slice(0, 10);
  assert.equal(
    parseAssessmentHistory(JSON.stringify([standardTen]), correctIndexByQuestion, BANK_VERSION, choiceCountByQuestion).length,
    1,
  );
  assert.equal(parseAssessmentHistory(JSON.stringify([stored]), correctIndexByQuestion, "other-bank", choiceCountByQuestion).length, 0);
  assert.equal(parseAssessmentHistory("{".repeat(300_000), correctIndexByQuestion, BANK_VERSION).length, 0);
  assert.deepEqual(parseAssessmentHistory("not-json", correctIndexByQuestion, BANK_VERSION), []);
});

test("history parser rejects invalid choice positions and oversized sessions", () => {
  const invalidChoice = makeSession("MS-INVALID1-AAAA1111", now, true);
  invalidChoice.answers[0].selectedChoiceIndex = 4;
  assert.equal(
    parseAssessmentHistory(JSON.stringify([invalidChoice]), correctIndexByQuestion, BANK_VERSION, choiceCountByQuestion).length,
    0,
  );

  const tooMany = makeSession("MS-TOOMANY1-BBBB2222", now, true);
  tooMany.answers.push(...bank.slice(14, 17).map((item) => ({
    questionId: item.id,
    selectedChoiceIndex: 0,
    correct: true,
    elapsedSeconds: 40,
  })));
  assert.equal(
    parseAssessmentHistory(JSON.stringify([tooMany]), correctIndexByQuestion, BANK_VERSION, choiceCountByQuestion).length,
    0,
  );

  const tooShort = makeSession("MS-TOOSHORT-EEEE5555", now, true);
  tooShort.answers = tooShort.answers.slice(0, 9);
  assert.equal(
    parseAssessmentHistory(JSON.stringify([tooShort]), correctIndexByQuestion, BANK_VERSION, choiceCountByQuestion).length,
    0,
  );
});

test("session creation caps inactive timing at the parser limit", () => {
  const stored = makeSession("MS-TIMECAP1-CCCC3333", now, true);
  stored.answers[0].elapsedSeconds = 50_000;
  const capped = createAssessmentSession({
    id: "MS-TIMECAP2-DDDD4444",
    bankVersion: BANK_VERSION,
    completedAt: now,
    result: stored,
    answers: stored.answers,
  });
  assert.equal(capped.answers[0].elapsedSeconds, 10_800);
});

test("historical prior is normalized, bounded, and moves with evidence", () => {
  const empty = buildHistoricalPrior([], bank, thetaGrid, now);
  assert.ok(Math.abs(empty.posterior.reduce((sum, value) => sum + value, 0) - 1) < 1e-10);

  const correctPrior = buildHistoricalPrior([makeSession("MS-TEST0002-BBBB2222", now, true)], bank, thetaGrid, now);
  const wrongPrior = buildHistoricalPrior([makeSession("MS-TEST0003-CCCC3333", now, false)], bank, thetaGrid, now);
  assert.ok(posteriorMean(correctPrior.posterior) > posteriorMean(empty.posterior));
  assert.ok(posteriorMean(wrongPrior.posterior) < posteriorMean(empty.posterior));
  assert.ok(correctPrior.effectiveAnswerCount <= MAX_HISTORICAL_WEIGHT);
});

test("only the newest response to a repeated question contributes", () => {
  const older = makeSession("MS-TEST0004-DDDD4444", now - 86_400_000, true);
  const newer = makeSession("MS-TEST0005-EEEE5555", now, false);
  const repeated = buildHistoricalPrior([older, newer], bank, thetaGrid, now);
  const newerOnly = buildHistoricalPrior([newer], bank, thetaGrid, now);

  assert.equal(repeated.uniqueQuestionCount, 14);
  repeated.posterior.forEach((value, index) => assert.ok(Math.abs(value - newerOnly.posterior[index]) < 1e-12));
});

test("session append is idempotent and keeps the newest eight", () => {
  let sessions = [];
  for (let index = 0; index < 10; index += 1) {
    const session = makeSession(`MS-TEST${String(index).padStart(4, "0")}-FFFF${String(index).padStart(4, "0")}`, now + index, index % 2 === 0);
    sessions = appendAssessmentSession(sessions, session);
    sessions = appendAssessmentSession(sessions, session);
  }

  assert.equal(sessions.length, 8);
  assert.equal(new Set(sessions.map((session) => session.id)).size, 8);
  assert.equal(sessions.at(-1).id, "MS-TEST0009-FFFF0009");
});
