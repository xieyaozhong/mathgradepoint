export const HISTORY_VERSION = 3;
export const MAX_HISTORY_SESSIONS = 8;
export const MAX_HISTORICAL_WEIGHT = 10;
export const MIN_SESSION_QUESTIONS = 10;
export const MAX_SESSION_QUESTIONS = 14;

/**
 * @typedef {object} StoredAnswer
 * @property {string} questionId
 * @property {number} selectedChoiceIndex
 * @property {boolean} correct
 * @property {number} elapsedSeconds
 */

/**
 * @typedef {object} AssessmentSession
 * @property {number} version
 * @property {string} bankVersion
 * @property {string} id
 * @property {number} completedAt
 * @property {number} ability
 * @property {number} sessionAbility
 * @property {number} sessionLow
 * @property {number} sessionHigh
 * @property {number} low
 * @property {number} high
 * @property {number} levelIndex
 * @property {number} correctCount
 * @property {number} questionCount
 * @property {StoredAnswer[]} answers
 */

/** @param {unknown} value @param {number} minimum @param {number} maximum */
function finiteNumber(value, minimum, maximum) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

/**
 * Parse and sanitize device-local history. Invalid or partial sessions are ignored rather than
 * affecting a future estimate.
 * @param {string | null} raw
 * @param {Map<string, number>} correctIndexByQuestion
 * @param {string} bankVersion
 * @param {Map<string, number>} [choiceCountByQuestion]
 * @returns {AssessmentSession[]}
 */
export function parseAssessmentHistory(raw, correctIndexByQuestion, bankVersion, choiceCountByQuestion = new Map()) {
  if (!raw || raw.length > 262_144) return [];
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];

  /** @type {Map<string, AssessmentSession>} */
  const sessions = new Map();
  value.forEach((candidate) => {
    if (!candidate || typeof candidate !== "object" || candidate.version !== HISTORY_VERSION) return;
    if (candidate.bankVersion !== bankVersion) return;
    if (typeof candidate.id !== "string" || !/^MS-[A-Z0-9-]{8,72}$/.test(candidate.id)) return;
    if (!finiteNumber(candidate.completedAt, 1_577_836_800_000, Date.now() + 86_400_000)) return;
    if (!finiteNumber(candidate.ability, 1, 12)) return;
    if (!finiteNumber(candidate.sessionAbility, 1, 12)) return;
    if (!finiteNumber(candidate.sessionLow, 1, 12) || !finiteNumber(candidate.sessionHigh, 1, 12)) return;
    if (!finiteNumber(candidate.low, 1, 12) || !finiteNumber(candidate.high, 1, 12)) return;
    if (!Number.isInteger(candidate.levelIndex) || candidate.levelIndex < 0 || candidate.levelIndex > 11) return;
    if (!Array.isArray(candidate.answers)) return;

    /** @type {Map<string, StoredAnswer>} */
    const answersById = new Map();
    let hasInvalidAnswer = false;
    candidate.answers.forEach((answer) => {
      if (!answer || typeof answer !== "object") {
        hasInvalidAnswer = true;
        return;
      }
      if (typeof answer.questionId !== "string" || !correctIndexByQuestion.has(answer.questionId)) {
        hasInvalidAnswer = true;
        return;
      }
      const choiceCount = choiceCountByQuestion.get(answer.questionId) ?? 8;
      if (!Number.isInteger(answer.selectedChoiceIndex) || answer.selectedChoiceIndex < 0 || answer.selectedChoiceIndex >= choiceCount) {
        hasInvalidAnswer = true;
        return;
      }
      if (!finiteNumber(answer.elapsedSeconds, 1, 10_800) || answersById.has(answer.questionId)) {
        hasInvalidAnswer = true;
        return;
      }
      answersById.set(answer.questionId, {
        questionId: answer.questionId,
        selectedChoiceIndex: answer.selectedChoiceIndex,
        correct: answer.selectedChoiceIndex === correctIndexByQuestion.get(answer.questionId),
        elapsedSeconds: Math.round(answer.elapsedSeconds),
      });
    });
    if (hasInvalidAnswer) return;
    const answers = [...answersById.values()];
    if (answers.length < MIN_SESSION_QUESTIONS || answers.length > MAX_SESSION_QUESTIONS) return;

    sessions.set(candidate.id, {
      version: HISTORY_VERSION,
      bankVersion,
      id: candidate.id,
      completedAt: candidate.completedAt,
      ability: candidate.ability,
      sessionAbility: candidate.sessionAbility,
      sessionLow: Math.min(candidate.sessionLow, candidate.sessionHigh),
      sessionHigh: Math.max(candidate.sessionLow, candidate.sessionHigh),
      low: Math.min(candidate.low, candidate.high),
      high: Math.max(candidate.low, candidate.high),
      levelIndex: candidate.levelIndex,
      correctCount: answers.filter((answer) => answer.correct).length,
      questionCount: answers.length,
      answers,
    });
  });

  return [...sessions.values()]
    .sort((left, right) => left.completedAt - right.completedAt)
    .slice(-MAX_HISTORY_SESSIONS);
}

/**
 * @param {{ id: string; bankVersion: string; completedAt: number; result: { ability: number; sessionAbility: number; sessionLow: number; sessionHigh: number; low: number; high: number; levelIndex: number; correctCount: number }; answers: Array<{ questionId: string; selectedChoiceIndex: number; correct: boolean; elapsedSeconds: number }> }} input
 * @returns {AssessmentSession}
 */
export function createAssessmentSession({ id, bankVersion, completedAt, result, answers }) {
  const storedAnswers = answers.map((answer) => ({
    questionId: answer.questionId,
    selectedChoiceIndex: answer.selectedChoiceIndex,
    correct: answer.correct,
    elapsedSeconds: Math.min(10_800, Math.max(1, Math.round(answer.elapsedSeconds))),
  }));
  return {
    version: HISTORY_VERSION,
    bankVersion,
    id,
    completedAt,
    ability: result.ability,
    sessionAbility: result.sessionAbility,
    sessionLow: result.sessionLow,
    sessionHigh: result.sessionHigh,
    low: result.low,
    high: result.high,
    levelIndex: result.levelIndex,
    correctCount: storedAnswers.filter((answer) => answer.correct).length,
    questionCount: storedAnswers.length,
    answers: storedAnswers,
  };
}

/** @param {AssessmentSession[]} sessions @param {AssessmentSession} session */
export function appendAssessmentSession(sessions, session) {
  return [...sessions.filter((candidate) => candidate.id !== session.id), session]
    .sort((left, right) => left.completedAt - right.completedAt)
    .slice(-MAX_HISTORY_SESSIONS);
}

/**
 * Create a tempered historical prior. Only the newest response to each question is kept, recent
 * sessions matter more, and all historical evidence is capped so the new attempt can still move
 * the result.
 * @param {AssessmentSession[]} sessions
 * @param {Array<{ id: string; a: number; b: number; choices: readonly string[] }>} bank
 * @param {number[]} thetaGrid
 * @param {number} [now]
 */
export function buildHistoricalPrior(sessions, bank, thetaGrid, now = Date.now()) {
  const uniform = thetaGrid.map(() => 1 / thetaGrid.length);
  const itemById = new Map(bank.map((item) => [item.id, item]));
  /** @type {Map<string, { answer: StoredAnswer; sessionIndex: number; completedAt: number }>} */
  const latestByQuestion = new Map();

  sessions.forEach((session, sessionIndex) => {
    session.answers.forEach((answer) => {
      if (itemById.has(answer.questionId)) {
        latestByQuestion.set(answer.questionId, { answer, sessionIndex, completedAt: session.completedAt });
      }
    });
  });

  const weightedAnswers = [...latestByQuestion.values()].map((entry) => {
    const ageDays = Math.max(0, now - entry.completedAt) / 86_400_000;
    const sessionDistance = Math.max(0, sessions.length - 1 - entry.sessionIndex);
    return {
      ...entry,
      rawWeight: 0.62 * 0.5 ** (ageDays / 120) * 0.84 ** sessionDistance,
    };
  }).filter((entry) => entry.rawWeight >= 0.03);

  const rawWeightTotal = weightedAnswers.reduce((sum, entry) => sum + entry.rawWeight, 0);
  const scale = rawWeightTotal > MAX_HISTORICAL_WEIGHT ? MAX_HISTORICAL_WEIGHT / rawWeightTotal : 1;
  const logWeights = uniform.map((weight) => Math.log(weight));

  weightedAnswers.forEach((entry) => {
    const item = itemById.get(entry.answer.questionId);
    if (!item) return;
    const guess = 1 / item.choices.length;
    const evidenceWeight = entry.rawWeight * scale;
    thetaGrid.forEach((theta, index) => {
      const chance = guess + (1 - guess) / (1 + Math.exp(-item.a * (theta - item.b)));
      const likelihood = entry.answer.correct ? chance : 1 - chance;
      logWeights[index] += evidenceWeight * Math.log(Math.max(likelihood, 1e-9));
    });
  });

  const maximumLogWeight = Math.max(...logWeights);
  const unnormalized = logWeights.map((value) => Math.exp(value - maximumLogWeight));
  const total = unnormalized.reduce((sum, value) => sum + value, 0);
  const normalizedPosterior = total > 0 ? unnormalized.map((value) => value / total) : uniform;
  const posterior = normalizedPosterior.map((value, index) => 0.85 * value + 0.15 * uniform[index]);
  return {
    posterior,
    sessionCount: sessions.length,
    uniqueQuestionCount: weightedAnswers.length,
    effectiveAnswerCount: weightedAnswers.reduce((sum, entry) => sum + entry.rawWeight * scale, 0),
    questionIds: weightedAnswers.map((entry) => entry.answer.questionId),
  };
}

/** @param {AssessmentSession[]} sessions */
export function summarizeAssessmentHistory(sessions) {
  return {
    sessionCount: sessions.length,
    uniqueQuestionCount: new Set(sessions.flatMap((session) => session.answers.map((answer) => answer.questionId))).size,
    latestSession: sessions.at(-1) ?? null,
    previousSession: sessions.at(-2) ?? null,
  };
}
