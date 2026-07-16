export const OBSERVATION_THRESHOLDS = Object.freeze({
  challengeProbability: 0.55,
  boundaryProbability: 0.72,
  unexpectedMissProbability: 0.7,
  rushedRatio: 0.6,
  slowRatio: 1.3,
  interruptedRatio: 3,
  lowInformationCorrectProbability: 0.85,
  lowInformationMissProbability: 0.25,
});

/**
 * @typedef {"stable" | "challenge" | "boundary" | "efficient" | "slow" | "surprise" | "rushed" | "deliberate" | "review"} ObservationTone
 * @typedef {"穩定命中" | "高難命中" | "能力邊界命中" | "快速命中" | "命中但可加速" | "高預期失誤" | "快速作答失誤" | "思考後仍待確認" | "需要再確認"} ObservationStatus
 * @typedef {"improved" | "consistent" | "changed" | "same-choice" | "repeated-miss" | null} RetestSignal
 * @typedef {{ label: string; tone: "slow" | "rushed" | "neutral" | "repeat" | "improved" | "changed" | "review"; icon: string }} ObservationChip
 */

/**
 * Return the newest stored response to a question, excluding the current report when needed.
 * @param {Array<{ id: string; completedAt: number; answers: Array<{ questionId: string; selectedChoiceIndex: number; correct: boolean }> }>} sessions
 * @param {string} questionId
 * @param {string} [excludedSessionId]
 */
export function findLatestHistoricalAnswer(sessions, questionId, excludedSessionId = "") {
  let latest = null;
  sessions.forEach((session) => {
    if (session.id === excludedSessionId) return;
    const answer = session.answers.find((candidate) => candidate.questionId === questionId);
    if (!answer) return;
    if (!latest || session.completedAt > latest.completedAt) {
      latest = { ...answer, completedAt: session.completedAt };
    }
  });
  return latest;
}

/**
 * Classify only observable response signals. The result intentionally avoids claims about
 * confidence, motivation, carelessness, misconceptions, or durable mastery because those
 * constructs are not directly measured by the current assessment.
 * @param {{
 *   correct: boolean;
 *   elapsedSeconds: number;
 *   targetSeconds: number;
 *   expectedCorrectProbability: number;
 *   previouslySeen?: boolean;
 *   selectedChoiceIndex?: number;
 *   previousCorrect?: boolean | null;
 *   previousSelectedChoiceIndex?: number | null;
 * }} input
 */
export function classifyAnswerObservation(input) {
  const expected = Math.max(0, Math.min(1, input.expectedCorrectProbability));
  const target = input.targetSeconds > 0 ? input.targetSeconds : 0;
  const ratio = target > 0 ? input.elapsedSeconds / target : 1;
  const interrupted = target <= 0 || input.elapsedSeconds > target * OBSERVATION_THRESHOLDS.interruptedRatio;
  const isSlow = !interrupted && ratio >= OBSERVATION_THRESHOLDS.slowRatio;
  const isRushed = !interrupted && ratio < OBSERVATION_THRESHOLDS.rushedRatio;
  const isChallenge = input.correct && expected < OBSERVATION_THRESHOLDS.challengeProbability;
  const isBoundary = input.correct
    && expected >= OBSERVATION_THRESHOLDS.challengeProbability
    && expected < OBSERVATION_THRESHOLDS.boundaryProbability;
  const isUnexpectedMiss = !input.correct
    && expected >= OBSERVATION_THRESHOLDS.unexpectedMissProbability;
  const isLowInformation = (input.correct && expected >= OBSERVATION_THRESHOLDS.lowInformationCorrectProbability)
    || (!input.correct && expected <= OBSERVATION_THRESHOLDS.lowInformationMissProbability);

  /** @type {RetestSignal} */
  let retestSignal = null;
  if (typeof input.previousCorrect === "boolean") {
    if (!input.previousCorrect && input.correct) retestSignal = "improved";
    else if (input.previousCorrect && input.correct) retestSignal = "consistent";
    else if (input.previousCorrect && !input.correct) retestSignal = "changed";
    else if (
      input.previousSelectedChoiceIndex !== null
      && input.previousSelectedChoiceIndex !== undefined
      && input.selectedChoiceIndex === input.previousSelectedChoiceIndex
    ) retestSignal = "same-choice";
    else retestSignal = "repeated-miss";
  }

  /** @type {ObservationStatus} */
  let status;
  /** @type {ObservationTone} */
  let tone;
  let icon;
  let observation;

  if (input.correct && isChallenge) {
    status = "高難命中";
    tone = "challenge";
    icon = "◆";
    observation = `作答前預估命中率約 ${Math.round(expected * 100)}%，本題仍成功命中；這是超出目前預估的正向訊號，應再用相近難度的未見變式確認。`;
  } else if (input.correct && isBoundary) {
    status = "能力邊界命中";
    tone = "boundary";
    icon = "◎";
    observation = `作答前預估命中率約 ${Math.round(expected * 100)}%，位於目前能力邊界且成功命中；這題對能力定位較有辨識力，可再用一題相近難度交叉確認。`;
  } else if (input.correct && isRushed) {
    status = "快速命中";
    tone = "efficient";
    icon = "⚡";
    observation = `答案正確，作答時間約為參考時間的 ${ratio.toFixed(1)} 倍；可能表示操作熟練，也可能受題型熟悉影響，建議用未見變式確認。`;
  } else if (input.correct && isSlow) {
    status = "命中但可加速";
    tone = "slow";
    icon = "◷";
    observation = `答案正確，作答時間約為參考時間的 ${ratio.toFixed(1)} 倍；保留目前方法，再將步驟整理成較短的檢查流程。`;
  } else if (input.correct) {
    status = "穩定命中";
    tone = "stable";
    icon = "✓";
    observation = interrupted
      ? "答案與關鍵觀念一致；計時可能包含頁面閒置，因此本題不以速度判讀。"
      : "答案與關鍵觀念一致，作答時間也落在可接受範圍；可用不同表示方式的變化題確認轉移。";
  } else if (isUnexpectedMiss) {
    status = "高預期失誤";
    tone = "surprise";
    icon = "!";
    observation = `模型原先預估本題命中率約 ${Math.round(expected * 100)}%，但本題結果不同；這是需要複核的落差，不代表能力下降，也不能由單題判定原因。`;
  } else if (isRushed) {
    status = "快速作答失誤";
    tone = "rushed";
    icon = "↯";
    observation = `作答時間約為參考時間的 ${ratio.toFixed(1)} 倍，且答案與參考答案不同；可能原因不只一種，先重新讀取條件與所求。`;
  } else if (isSlow) {
    status = "思考後仍待確認";
    tone = "deliberate";
    icon = "◇";
    observation = `作答時間約為參考時間的 ${ratio.toFixed(1)} 倍，答案仍與參考答案不同；先確認概念連結或方法選擇，再用同技能變式複核。`;
  } else {
    status = "需要再確認";
    tone = "review";
    icon = "?";
    observation = interrupted
      ? "本題答案與參考答案不同，且計時可能包含頁面閒置；本題只用正誤作為能力證據，不判讀作答速度。"
      : "本題答案與參考答案不同。這是一個值得回看的單題訊號，不代表整個領域尚未掌握。";
  }

  if (isLowInformation) {
    observation += " 依作答前能力估計，這個結果對等級調整的資訊量較低；仍保留供學習檢查。";
  }
  if (input.previouslySeen) {
    observation += " 此題曾在歷次評量出現，本輪只保留最新作答並降低證據權重，避免熟題把結果虛高。";
  }

  if (retestSignal === "improved") {
    observation += " 相較最近一次同題作答，本輪已修正；這是改善訊號，仍需未見變式確認。";
  } else if (retestSignal === "consistent") {
    observation += " 最近一次同題也命中，呈現同題再測一致；由於存在熟悉效應，仍視為重複證據。";
  } else if (retestSignal === "changed") {
    observation += " 最近一次同題命中、本輪結果不同，呈現再測波動；可能原因不只一種，請用未見變式複核。";
  } else if (retestSignal === "same-choice") {
    observation += " 相同選項再次出現，代表這個選擇模式值得檢查；僅憑選項仍不能判定迷思原因。";
  } else if (retestSignal === "repeated-miss") {
    observation += " 最近一次同題也未命中，表示此題持續需要回看；仍應用同技能未見變式確認是否為穩定缺口。";
  }

  /** @type {ObservationChip[]} */
  const chips = [];
  if (isSlow && tone !== "slow" && tone !== "deliberate") {
    chips.push({ label: "慢速訊號", tone: "slow", icon: "◷" });
  }
  if (isRushed && tone !== "efficient" && tone !== "rushed") {
    chips.push({ label: "偏快作答", tone: "rushed", icon: "↯" });
  }
  if (interrupted) chips.push({ label: "時間不判讀", tone: "neutral", icon: "Ⅱ" });
  if (isLowInformation) chips.push({ label: "低資訊作答", tone: "neutral", icon: "·" });
  if (input.previouslySeen) chips.push({ label: "重複題降權", tone: "repeat", icon: "↻" });
  if (retestSignal === "improved") chips.push({ label: "本輪修正", tone: "improved", icon: "↑" });
  if (retestSignal === "consistent") chips.push({ label: "同題再測命中", tone: "repeat", icon: "=" });
  if (retestSignal === "changed") chips.push({ label: "再測有波動", tone: "changed", icon: "≈" });
  if (retestSignal === "same-choice") chips.push({ label: "相同選項再現", tone: "review", icon: "↺" });
  if (retestSignal === "repeated-miss") chips.push({ label: "再測仍待確認", tone: "review", icon: "×" });

  return {
    status,
    tone,
    icon,
    needsReview: !input.correct || isSlow || interrupted,
    isSlow,
    isRushed,
    isChallenge,
    isBoundary,
    isUnexpectedMiss,
    isLowInformation,
    interrupted,
    ratio,
    retestSignal,
    chips,
    hasPaceSignal: isSlow || isRushed || interrupted,
    hasRetestSignal: retestSignal !== null,
    observation,
  };
}
