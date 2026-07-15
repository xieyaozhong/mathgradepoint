"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BANK,
  FORMAT_LABELS,
  LEVELS,
  SKILL_GROUPS,
  TOPIC_LABELS,
  type Question,
  type QuestionFormat,
  type Topic,
} from "./math-data";
import DeepAnalysisPanel, { makeDeepAnalysis } from "./deep-analysis-panel";
import {
  appendAssessmentSession,
  buildHistoricalPrior,
  createAssessmentSession,
  parseAssessmentHistory,
  summarizeAssessmentHistory,
} from "./history-engine";

type Phase = "intro" | "quiz" | "result";
type AnalysisFilter = "all" | "review" | "secure";

type AnswerRecord = {
  questionId: string;
  selectedChoiceIndex: number;
  correct: boolean;
  selected: string;
  correctAnswer: string;
  rationale: string;
  topic: Topic;
  format: QuestionFormat;
  level: number;
  elapsedSeconds: number;
  expectedCorrectProbability: number;
  targetSeconds: number;
  evidenceWeight: number;
  previouslySeen: boolean;
};

type QuizState = {
  posterior: number[];
  sessionPosterior: number[];
  historyPrior: number[];
  historicalEffectiveAnswerCount: number;
  historicalQuestionIds: string[];
  answers: AnswerRecord[];
  askedIds: string[];
  topicCounts: Partial<Record<Topic, number>>;
  formatCounts: Partial<Record<QuestionFormat, number>>;
};

type SkillDiagnostic = {
  label: string;
  recommendation: string;
  sampleCount: number;
  effectiveCount: number;
  correctCount: number;
  accuracy: number | null;
  averageSeconds: number | null;
  status: "穩定掌握" | "基本掌握" | "發展中" | "建議補強" | "待進一步確認" | "尚未評量";
  evidence: "證據較充足" | "初步訊號" | "單題取樣" | "未取樣";
};

type LearningRouteId = "stepwise" | "visual" | "toolkit";

type LearningRecommendation = {
  id: LearningRouteId;
  publicTitle: "解題流程" | "概念整理" | "重點整理";
  slogan: string;
  reason: string;
  evidenceLabel: string;
  focusLabel: string;
  flow: readonly string[];
  hints: { level: number; title: string; text: string }[];
};

type AssessmentSession = ReturnType<typeof createAssessmentSession>;
type HistoricalBaseline = ReturnType<typeof buildHistoricalPrior>;

type QuestionAnalysis = {
  answer: AnswerRecord;
  item: Question;
  index: number;
  status: "穩定命中" | "高難命中" | "命中但可加速" | "需要再確認";
  tone: "stable" | "challenge" | "slow" | "review";
  needsReview: boolean;
  isSlow: boolean;
  isChallenge: boolean;
  interrupted: boolean;
  timeLabel: string;
  expectedLabel: string;
  observation: string;
  routeTitle: "解題流程" | "概念整理" | "重點整理";
  nextAction: string;
};

const BASE_QUESTIONS = 10;
const MAX_QUESTIONS = 14;
const BANK_VERSION = "2026-07-15-v2-120-items";
const RECENT_ITEMS_KEY = "math-scan-recent-items-v4";
const ASSESSMENT_HISTORY_KEY = "math-scan-assessment-history-v3";
const THETA_GRID = Array.from({ length: 111 }, (_, index) => 1 + index / 10);
const CORRECT_INDEX_BY_QUESTION = new Map(BANK.map((item) => [item.id, item.correctIndex]));
const CHOICE_COUNT_BY_QUESTION = new Map(BANK.map((item) => [item.id, item.choices.length]));

const LEARNING_ROUTE_COPY = {
  stepwise: {
    publicTitle: "解題流程",
    slogan: "一步一步，清楚不出錯",
    flow: ["問題／目標", "已知條件", "找出關係", "逐步推導", "快速檢查"],
  },
  visual: {
    publicTitle: "概念整理",
    slogan: "先看懂畫面，再寫成式子",
    flow: ["整體概念", "生活／圖像", "建立畫面", "整理規則", "小試身手"],
  },
  toolkit: {
    publicTitle: "重點整理",
    slogan: "一眼辨題型，直接啟動解法",
    flow: ["辨認題型", "選擇工具", "確認條件", "固定步驟", "快速檢查"],
  },
} as const;

const BASE_TARGET_SECONDS: Record<QuestionFormat, number> = {
  calculation: 45,
  application: 60,
  data: 55,
  reasoning: 70,
  concept: 50,
};

const LEARNING_ROUTE_WEIGHTS: Record<
  LearningRouteId,
  { format: Record<QuestionFormat, number>; topic: Record<Topic, number> }
> = {
  stepwise: {
    format: { calculation: 0.25, application: 0.7, data: 0.45, reasoning: 1, concept: 0.55 },
    topic: {
      arithmetic: 0.4,
      geometry: 0.5,
      algebra: 0.85,
      functions: 0.7,
      trigonometry: 0.55,
      "data-probability": 0.55,
      calculus: 0.75,
      "linear-algebra": 0.85,
      analysis: 1,
    },
  },
  visual: {
    format: { calculation: 0.2, application: 1, data: 1, reasoning: 0.5, concept: 0.9 },
    topic: {
      arithmetic: 0.65,
      geometry: 1,
      algebra: 0.5,
      functions: 0.9,
      trigonometry: 1,
      "data-probability": 0.95,
      calculus: 0.65,
      "linear-algebra": 0.7,
      analysis: 0.4,
    },
  },
  toolkit: {
    format: { calculation: 1, application: 0.65, data: 0.4, reasoning: 0.35, concept: 0.35 },
    topic: {
      arithmetic: 1,
      geometry: 0.65,
      algebra: 0.95,
      functions: 0.9,
      trigonometry: 0.8,
      "data-probability": 0.7,
      calculus: 1,
      "linear-algebra": 0.9,
      analysis: 0.55,
    },
  },
};

function createInitialState(
  baseline: HistoricalBaseline = buildHistoricalPrior([], BANK, THETA_GRID),
): QuizState {
  const uniform = THETA_GRID.map(() => 1 / THETA_GRID.length);
  return {
    posterior: baseline.posterior,
    sessionPosterior: uniform,
    historyPrior: baseline.posterior,
    historicalEffectiveAnswerCount: baseline.effectiveAnswerCount,
    historicalQuestionIds: baseline.questionIds,
    answers: [],
    askedIds: [],
    topicCounts: {},
    formatCounts: {},
  };
}

function readAssessmentHistory(): AssessmentSession[] {
  try {
    return parseAssessmentHistory(
      window.localStorage.getItem(ASSESSMENT_HISTORY_KEY),
      CORRECT_INDEX_BY_QUESTION,
      BANK_VERSION,
      CHOICE_COUNT_BY_QUESTION,
    );
  } catch {
    return [];
  }
}

function writeAssessmentHistory(sessions: AssessmentSession[]) {
  try {
    window.localStorage.setItem(ASSESSMENT_HISTORY_KEY, JSON.stringify(sessions));
  } catch {
    // A completed assessment still works when storage is unavailable or full.
  }
}

function normalize(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) return values.map(() => 1 / values.length);
  return values.map((value) => value / total);
}

function pCorrect(theta: number, item: Question) {
  const guess = 1 / item.choices.length;
  return guess + (1 - guess) / (1 + Math.exp(-item.a * (theta - item.b)));
}

function posteriorMeanFrom(weights: number[]) {
  return weights.reduce((sum, weight, index) => sum + weight * THETA_GRID[index], 0);
}

function posteriorMean(state: QuizState) {
  return posteriorMeanFrom(state.posterior);
}

function entropy(weights: number[]) {
  return -weights.reduce((sum, weight) => sum + (weight > 0 ? weight * Math.log(weight) : 0), 0);
}

function expectedEntropy(state: QuizState, item: Question) {
  const chances = THETA_GRID.map((theta) => pCorrect(theta, item));
  const chanceRight = state.posterior.reduce((sum, weight, index) => sum + weight * chances[index], 0);
  const ifRight = normalize(state.posterior.map((weight, index) => weight * chances[index]));
  const ifWrong = normalize(state.posterior.map((weight, index) => weight * (1 - chances[index])));
  return chanceRight * entropy(ifRight) + (1 - chanceRight) * entropy(ifWrong);
}

function calibrationFocus(state: QuizState) {
  const topics = new Set<Topic>();
  const formats = new Set<QuestionFormat>();
  const topicOutcomes = new Map<Topic, Set<boolean>>();
  const formatOutcomes = new Map<QuestionFormat, Set<boolean>>();

  state.answers.forEach((answer) => {
    const unusual =
      (answer.correct && answer.expectedCorrectProbability < 0.55) ||
      (!answer.correct && answer.expectedCorrectProbability >= 0.7);
    if (unusual) {
      topics.add(answer.topic);
      formats.add(answer.format);
    }
    const topicSet = topicOutcomes.get(answer.topic) ?? new Set<boolean>();
    topicSet.add(answer.correct);
    topicOutcomes.set(answer.topic, topicSet);
    const formatSet = formatOutcomes.get(answer.format) ?? new Set<boolean>();
    formatSet.add(answer.correct);
    formatOutcomes.set(answer.format, formatSet);
  });

  topicOutcomes.forEach((outcomes, topic) => {
    if (outcomes.size > 1) topics.add(topic);
  });
  formatOutcomes.forEach((outcomes, format) => {
    if (outcomes.size > 1) formats.add(format);
  });
  return { topics, formats };
}

function chooseNextQuestion(state: QuizState, recentIds: string[]) {
  const mean = posteriorMean(state);
  const calibrating = state.answers.length >= BASE_QUESTIONS;
  const calibration = calibrationFocus(state);
  const unused = BANK.filter((item) => !state.askedIds.includes(item.id));
  const nearby = unused.filter((item) => Math.abs(item.b - mean) <= 3);
  const calibrationNearby = unused.filter((item) => Math.abs(item.b - mean) <= 1.5);
  const freshNearby = nearby.filter((item) => !recentIds.includes(item.id));
  const fresh = unused.filter((item) => !recentIds.includes(item.id));
  const freshCalibrationNearby = calibrationNearby.filter((item) => !recentIds.includes(item.id));
  const candidates = calibrating && freshCalibrationNearby.length >= 4
    ? freshCalibrationNearby
    : calibrating && calibrationNearby.length >= 4
      ? calibrationNearby
      : freshNearby.length >= 5
        ? freshNearby
        : fresh.length >= 5
          ? fresh
          : nearby.length >= 5
            ? nearby
            : unused;
  const lastTopic = state.answers.at(-1)?.topic;
  const currentEntropy = entropy(state.posterior);

  const scored = candidates.map((item) => {
    const informationGain = currentEntropy - expectedEntropy(state, item);
    const unseenTopicBonus = state.topicCounts[item.topic] ? 0 : 0.13;
    const unseenFormatBonus = state.formatCounts[item.format] ? 0 : 0.08;
    const topicRepeatPenalty = 0.07 * (state.topicCounts[item.topic] ?? 0);
    const formatRepeatPenalty = 0.04 * (state.formatCounts[item.format] ?? 0);
    const consecutivePenalty = lastTopic === item.topic ? 0.15 : 0;
    const recentExposurePenalty = recentIds.includes(item.id) ? 0.25 : 0;
    const calibrationTopicBonus =
      calibrating && calibration.topics.has(item.topic) ? 0.16 : 0;
    const calibrationFormatBonus =
      calibrating && calibration.formats.has(item.format) ? 0.1 : 0;
    const distancePenalty =
      (calibrating ? 0.035 : 0.008) * Math.abs(item.b - mean);
    const jitter = Math.random() * 0.025;
    return {
      item,
      utility:
        informationGain +
        unseenTopicBonus +
        unseenFormatBonus +
        calibrationTopicBonus +
        calibrationFormatBonus +
        jitter -
        topicRepeatPenalty -
        formatRepeatPenalty -
        consecutivePenalty -
        recentExposurePenalty -
        distancePenalty,
    };
  });

  const pool = scored.sort((left, right) => right.utility - left.utility).slice(0, 5);
  const maxUtility = pool[0].utility;
  const weights = pool.map((candidate) => Math.exp((candidate.utility - maxUtility) / 0.08));
  const target = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
  let cumulative = 0;
  for (let index = 0; index < pool.length; index += 1) {
    cumulative += weights[index];
    if (cumulative >= target) return pool[index].item;
  }
  return pool[0].item;
}

function updateDistribution(posterior: number[], item: Question, correct: boolean, evidenceWeight = 1) {
  return normalize(
    posterior.map((weight, index) => {
      const chance = pCorrect(THETA_GRID[index], item);
      return weight * (correct ? chance : 1 - chance) ** evidenceWeight;
    }),
  );
}

function quantileFrom(weights: number[], target: number) {
  let cumulative = 0;
  for (let index = 0; index < weights.length; index += 1) {
    cumulative += weights[index];
    if (cumulative >= target) return THETA_GRID[index];
  }
  return 12;
}

function quantile(state: QuizState, target: number) {
  return quantileFrom(state.posterior, target);
}

function recomputeCombinedPosterior(historyPrior: number[], answers: AnswerRecord[], historyPower: number) {
  const temperedPrior = normalize(
    historyPrior.map((probability) => Math.max(probability, 1e-12) ** historyPower),
  );
  return answers.reduce((posterior, answer) => {
    const item = BANK.find((candidate) => candidate.id === answer.questionId)!;
    return updateDistribution(posterior, item, answer.correct, answer.evidenceWeight);
  }, temperedPrior);
}

function calibrationReasons(state: QuizState) {
  if (state.answers.length < BASE_QUESTIONS) return [] as string[];

  const reasons: string[] = [];
  const intervalWidth = quantile(state, 0.9) - quantile(state, 0.1);
  if (intervalWidth > 3.4) reasons.push("能力區間仍寬");
  const sessionIntervalWidth = quantileFrom(state.sessionPosterior, 0.9)
    - quantileFrom(state.sessionPosterior, 0.1);
  if (sessionIntervalWidth > 3.8) reasons.push("本次獨立證據仍寬");

  const coveredTopics = new Set(state.answers.map((answer) => answer.topic)).size;
  const coveredFormats = new Set(state.answers.map((answer) => answer.format)).size;
  if (coveredTopics < 4) reasons.push("領域覆蓋不足");
  if (coveredFormats < 4) reasons.push("題型覆蓋不足");

  const hardWins = state.answers.filter(
    (answer) => answer.correct && answer.expectedCorrectProbability < 0.55,
  ).length;
  const highExpectationMisses = state.answers.filter(
    (answer) => !answer.correct && answer.expectedCorrectProbability >= 0.7,
  ).length;
  if (hardWins >= 2) reasons.push("高難度表現超出預估");
  if (highExpectationMisses >= 2) reasons.push("基礎表現低於預估");

  const split = Math.ceil(state.answers.length / 2);
  const firstHalf = state.answers.slice(0, split);
  const secondHalf = state.answers.slice(split);
  const accuracy = (answers: AnswerRecord[]) =>
    answers.length
      ? (100 * answers.filter((answer) => answer.correct).length) / answers.length
      : null;
  const firstAccuracy = accuracy(firstHalf);
  const secondAccuracy = accuracy(secondHalf);
  if (
    firstAccuracy !== null &&
    secondAccuracy !== null &&
    Math.abs(firstAccuracy - secondAccuracy) >= 50
  ) {
    reasons.push("前後段表現差異較大");
  }

  return reasons;
}

function shouldStop(state: QuizState) {
  if (state.answers.length < BASE_QUESTIONS) return false;
  if (state.answers.length >= MAX_QUESTIONS) return true;
  return calibrationReasons(state).length === 0;
}

function levelIndexFromTheta(theta: number) {
  return Math.max(0, Math.min(LEVELS.length - 1, Math.round(theta) - 1));
}

function makeResult(state: QuizState) {
  const mass = Array(LEVELS.length).fill(0) as number[];
  state.posterior.forEach((weight, index) => {
    mass[levelIndexFromTheta(THETA_GRID[index])] += weight;
  });
  const levelIndex = mass.indexOf(Math.max(...mass));
  const ability = posteriorMean(state);
  const sessionAbility = posteriorMeanFrom(state.sessionPosterior);
  const low = quantile(state, 0.1);
  const high = quantile(state, 0.9);
  const sessionLow = quantileFrom(state.sessionPosterior, 0.1);
  const sessionHigh = quantileFrom(state.sessionPosterior, 0.9);
  const width = high - low;
  const currentEffectiveEvidence = state.answers.reduce((sum, answer) => sum + answer.evidenceWeight, 0);
  const effectiveEvidence = currentEffectiveEvidence + state.historicalEffectiveAnswerCount;
  const uniqueEvidence = new Set([...state.historicalQuestionIds, ...state.askedIds]).size;
  const historyGap = state.historicalEffectiveAnswerCount > 0
    ? Math.abs(sessionAbility - posteriorMeanFrom(state.historyPrior))
    : 0;
  return {
    levelIndex,
    ability,
    low,
    high,
    confidence:
      width <= 1.8 && effectiveEvidence >= 18 && uniqueEvidence >= 12 && historyGap < 1.2
        ? "高"
        : width <= 2.8 && effectiveEvidence >= 10
          ? "中"
          : "初步",
    score: Math.max(0, Math.min(100, Math.round(((ability - 1) / 11) * 100))),
    correctCount: state.answers.filter((answer) => answer.correct).length,
    sessionAbility,
    sessionLow,
    sessionHigh,
    effectiveEvidence,
    currentEffectiveEvidence,
    historicalEffectiveEvidence: state.historicalEffectiveAnswerCount,
    repeatedQuestionCount: state.answers.filter((answer) => answer.previouslySeen).length,
    uniqueEvidence,
    historyGap,
  };
}

function shuffleChoices(item: Question) {
  const choices = item.choices.map((text, index) => ({
    text,
    correct: index === item.correctIndex,
    originalIndex: index,
  }));
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
  }
  return choices;
}

function makeSkillDiagnostics(answers: AnswerRecord[]): SkillDiagnostic[] {
  return SKILL_GROUPS.map((group) => {
    const sampled = answers.filter((answer) => group.topics.includes(answer.topic));
    const correctCount = sampled.filter((answer) => answer.correct).length;
    const effectiveCount = sampled.reduce((sum, answer) => sum + answer.evidenceWeight, 0);
    const weightedCorrect = sampled.reduce(
      (sum, answer) => sum + (answer.correct ? answer.evidenceWeight : 0),
      0,
    );
    const accuracy = effectiveCount ? Math.round((weightedCorrect / effectiveCount) * 100) : null;
    const averageSeconds = sampled.length
      ? Math.round(sampled.reduce((sum, answer) => sum + answer.elapsedSeconds, 0) / sampled.length)
      : null;
    const evidence = effectiveCount >= 2.5
      ? "證據較充足"
      : effectiveCount >= 1.5
        ? "初步訊號"
        : effectiveCount > 0
          ? "單題取樣"
          : "未取樣";

    let status: SkillDiagnostic["status"] = "尚未評量";
    if (effectiveCount > 0 && effectiveCount < 1.5) status = "待進一步確認";
    else if (accuracy !== null && accuracy >= 80 && effectiveCount >= 2.5) status = "穩定掌握";
    else if (accuracy !== null && accuracy >= 60) status = "基本掌握";
    else if (accuracy !== null && accuracy >= 40) status = "發展中";
    else if (accuracy !== null) status = "建議補強";

    return {
      label: group.label,
      recommendation: group.recommendation,
      sampleCount: sampled.length,
      effectiveCount,
      correctCount,
      accuracy,
      averageSeconds,
      status,
      evidence,
    };
  });
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function targetSecondsFor(item: Question) {
  const levelFactor = 0.85 + 0.025 * item.level;
  return Math.round(BASE_TARGET_SECONDS[item.format] * levelFactor);
}

function timingSignals(answer: AnswerRecord) {
  if (answer.targetSeconds <= 0 || answer.elapsedSeconds > answer.targetSeconds * 3) {
    return { slow: 0, rushed: 0 };
  }
  const ratio = answer.elapsedSeconds / answer.targetSeconds;
  return {
    slow: clamp01((ratio - 1) / 0.75),
    rushed: clamp01((0.6 - ratio) / 0.3),
  };
}

function makeQuestionAnalysis(answer: AnswerRecord, index: number): QuestionAnalysis {
  const item = BANK.find((candidate) => candidate.id === answer.questionId)!;
  const { slow } = timingSignals(answer);
  const interrupted = answer.elapsedSeconds > answer.targetSeconds * 3;
  const isSlow = !interrupted && slow >= 0.35;
  const isChallenge = answer.correct && answer.expectedCorrectProbability < 0.55;
  const ratio = answer.targetSeconds > 0 ? answer.elapsedSeconds / answer.targetSeconds : 1;

  let status: QuestionAnalysis["status"];
  let tone: QuestionAnalysis["tone"];
  let observation: string;
  if (!answer.correct) {
    status = "需要再確認";
    tone = "review";
    observation = interrupted
      ? "本題答案與參考答案不同，且計時可能包含頁面閒置；本題只用正誤作為能力證據，不判讀作答速度。"
      : isSlow
        ? "花費較多時間後，本題答案仍與參考答案不同；可先確認概念連結或方法選擇，不由單題推定整個領域尚未掌握。"
        : ratio < 0.6
          ? "作答速度較快，但答案與參考答案不同；先重新確認題目條件與所求，再檢查方法。"
          : "本題答案與參考答案不同。這是一個值得回看的單題訊號，不代表整個領域尚未掌握。";
  } else if (isChallenge) {
    status = "高難命中";
    tone = "challenge";
    observation = interrupted
      ? `在作答前預估命中率約 ${Math.round(answer.expectedCorrectProbability * 100)}% 的挑戰題仍成功命中；計時可能包含頁面閒置，因此不以速度判讀。`
      : isSlow
        ? `在作答前預估命中率約 ${Math.round(answer.expectedCorrectProbability * 100)}% 的挑戰題仍成功命中，但耗時較長；可保留完整理由，再練習濃縮步驟。`
        : `在作答前預估命中率約 ${Math.round(answer.expectedCorrectProbability * 100)}% 的挑戰題仍成功命中，顯示你能把既有方法延伸到較高難度。`;
  } else if (interrupted) {
    status = "穩定命中";
    tone = "stable";
    observation = "答案與關鍵觀念一致；計時可能包含頁面閒置，因此本題不以速度判讀。";
  } else if (isSlow) {
    status = "命中但可加速";
    tone = "slow";
    observation = `答案正確；有效作答時間約為參考時間的 ${ratio.toFixed(1)} 倍，可再整理步驟以提升穩定度與效率。`;
  } else {
    status = "穩定命中";
    tone = "stable";
    observation = "答案與關鍵觀念一致，作答時間也落在可接受範圍；可用變化題確認是否能穩定轉移。";
  }

  if (answer.previouslySeen) {
    observation += " 此題曾在歷次評量出現，本輪只保留最新作答並降低證據權重，避免熟題把結果虛高。";
  }

  const needsReview = !answer.correct || isSlow || interrupted;
  const routeTitle: QuestionAnalysis["routeTitle"] = answer.format === "reasoning" || answer.format === "application"
    ? "解題流程"
    : answer.format === "concept" || answer.format === "data"
      ? "概念整理"
      : "重點整理";
  let nextAction: string;
  if (!answer.correct && (answer.format === "reasoning" || answer.format === "application")) {
    nextAction = "先寫下要求與已知，再補出中間關係；逐步推導後用代入或反向檢查驗證。";
  } else if (!answer.correct && (answer.format === "concept" || answer.format === "data")) {
    nextAction = "先不計算，把題意改成圖、表格、數線或生活語言，再整理成正式關係。";
  } else if (!answer.correct) {
    nextAction = "先辨認題型與適用條件，再按固定步驟代入；最後檢查符號、單位與答案範圍。";
  } else if (isSlow) {
    nextAction = "保留目前正確方法，將步驟濃縮成 3–5 個檢查點，再完成一題同型變化題。";
  } else if (isChallenge) {
    nextAction = "嘗試說明每一步使用的理由，再做一題條件略有改變的題目確認理解。";
  } else {
    nextAction = "完成一題不同表示方式的變化題，並用一句話說明為什麼這個方法成立。";
  }

  return {
    answer,
    item,
    index,
    status,
    tone,
    needsReview,
    isSlow,
    isChallenge,
    interrupted,
    timeLabel: interrupted
      ? `${answer.elapsedSeconds} 秒（計時可能中斷，不納入速度判斷）`
      : `${answer.elapsedSeconds} 秒／參考 ${answer.targetSeconds} 秒`,
    expectedLabel: `${Math.round(answer.expectedCorrectProbability * 100)}%`,
    observation,
    routeTitle,
    nextAction,
  };
}

function trendLabel(currentAbility: number, previousAbility: number | null) {
  if (previousAbility === null) return { label: "建立首份基準", delta: null, tone: "neutral" } as const;
  const delta = currentAbility - previousAbility;
  if (delta >= 0.35) return { label: "近期上升", delta, tone: "up" } as const;
  if (delta <= -0.35) return { label: "本次波動", delta, tone: "down" } as const;
  return { label: "維持穩定", delta, tone: "steady" } as const;
}

function routeAffinity(routeId: LearningRouteId, answer: AnswerRecord) {
  const weights = LEARNING_ROUTE_WEIGHTS[routeId];
  return 0.55 * weights.format[answer.format] + 0.45 * weights.topic[answer.topic];
}

type RouteMetric = {
  id: LearningRouteId;
  needScore: number;
  readinessScore: number;
  effectiveWeight: number;
  highNeedCount: number;
  hardCorrectCount: number;
  distinctTopics: number;
};

function answerSignals(answer: AnswerRecord) {
  const expected = Math.max(0.25, Math.min(0.95, answer.expectedCorrectProbability));
  const { slow, rushed } = timingSignals(answer);
  const missNeed = answer.correct ? 0 : expected;
  const supportNeed = clamp01(0.75 * missNeed + 0.2 * slow + 0.05 * (!answer.correct ? rushed : 0));
  const readiness = answer.correct ? clamp01(0.65 + 0.35 * (1 - expected) - 0.2 * slow) : 0;
  const relevance = 0.5 + 0.5 * (4 * expected * (1 - expected));
  return { supportNeed, readiness, relevance };
}

function scoreLearningRoute(id: LearningRouteId, answers: AnswerRecord[]): RouteMetric {
  let weightedNeed = 0;
  let weightedReadiness = 0;
  let effectiveWeight = 0;
  let highNeedCount = 0;
  let hardCorrectCount = 0;
  const topics = new Set<Topic>();

  answers.forEach((answer) => {
    const { supportNeed, readiness, relevance } = answerSignals(answer);
    const affinity = routeAffinity(id, answer);
    const weight = affinity * relevance * answer.evidenceWeight;
    weightedNeed += weight * supportNeed;
    weightedReadiness += weight * readiness;
    effectiveWeight += weight;
    if (affinity >= 0.6) topics.add(answer.topic);
    if (supportNeed >= 0.45 && affinity >= 0.6) highNeedCount += answer.evidenceWeight;
    if (answer.correct && answer.expectedCorrectProbability < 0.55 && affinity >= 0.6) {
      hardCorrectCount += answer.evidenceWeight;
    }
  });

  const denominator = Math.max(effectiveWeight, 0.001);
  return {
    id,
    needScore: Math.round((1000 * weightedNeed) / denominator) / 10,
    readinessScore: Math.round((1000 * weightedReadiness) / denominator) / 10,
    effectiveWeight,
    highNeedCount,
    hardCorrectCount,
    distinctTopics: topics.size,
  };
}

function stableHash(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function strongestSignal<T extends string>(signals: Partial<Record<T, number>>, fallback: T) {
  return (
    (Object.entries(signals) as [T, number][]).sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0]?.[0] ?? fallback
  );
}

function makeLearningRecommendation(answers: AnswerRecord[]): LearningRecommendation {
  const fallbackTopic: Topic = answers[0]?.topic ?? "arithmetic";
  const fallbackFormat: QuestionFormat = answers[0]?.format ?? "concept";
  if (!answers.length) {
    return {
      id: "visual",
      ...LEARNING_ROUTE_COPY.visual,
      reason: "完成評量後，系統會依本次作答證據配置一條可操作的學習路徑。",
      evidenceLabel: "等待作答證據",
      focusLabel: "尚未評量",
      hints: [],
    };
  }

  const routeIds: LearningRouteId[] = ["stepwise", "visual", "toolkit"];
  const metrics = routeIds.map((id) => scoreLearningRoute(id, answers));
  const maxNeed = Math.max(...metrics.map((metric) => metric.needScore));
  const mode: "support" | "extend" = maxNeed >= 18 ? "support" : "extend";
  const sessionSeed = answers.map((answer) => answer.questionId).join(":");

  metrics.sort((left, right) => {
    const leftPrimary = mode === "support" ? left.needScore : left.readinessScore;
    const rightPrimary = mode === "support" ? right.needScore : right.readinessScore;
    if (Math.abs(rightPrimary - leftPrimary) >= 2) return rightPrimary - leftPrimary;
    const leftSignal = mode === "support" ? left.highNeedCount : left.hardCorrectCount;
    const rightSignal = mode === "support" ? right.highNeedCount : right.hardCorrectCount;
    if (rightSignal !== leftSignal) return rightSignal - leftSignal;
    if (Math.abs(right.effectiveWeight - left.effectiveWeight) >= 0.25) {
      return right.effectiveWeight - left.effectiveWeight;
    }
    if (right.distinctTopics !== left.distinctTopics) return right.distinctTopics - left.distinctTopics;
    return stableHash(`${sessionSeed}:${left.id}`) - stableHash(`${sessionSeed}:${right.id}`);
  });

  const primary = metrics[0];
  const primaryScore = mode === "support" ? primary.needScore : primary.readinessScore;
  const secondScore = mode === "support" ? metrics[1].needScore : metrics[1].readinessScore;
  const margin = primaryScore - secondScore;
  const evidenceStrength = primary.effectiveWeight < 2.5 || margin < 4 ? "初步建議" : margin < 10 ? "中等證據" : "較充足證據";
  const topicSignals: Partial<Record<Topic, number>> = {};
  const formatSignals: Partial<Record<QuestionFormat, number>> = {};

  answers.forEach((answer) => {
    const signals = answerSignals(answer);
    const signal = routeAffinity(primary.id, answer)
      * (mode === "support" ? signals.supportNeed : signals.readiness)
      * answer.evidenceWeight;
    topicSignals[answer.topic] = (topicSignals[answer.topic] ?? 0) + signal;
    formatSignals[answer.format] = (formatSignals[answer.format] ?? 0) + signal;
  });

  const focusTopic = strongestSignal(topicSignals, fallbackTopic);
  const focusFormat = strongestSignal(formatSignals, fallbackFormat);
  const focusTopicLabel = TOPIC_LABELS[focusTopic];
  const focusFormatLabel = FORMAT_LABELS[focusFormat];
  const copy = LEARNING_ROUTE_COPY[primary.id];
  const routePurpose: Record<LearningRouteId, { support: string; extend: string }> = {
    stepwise: {
      support: "先找切入點，再把條件串成可驗證的推導。",
      extend: "用完整理由與驗證，讓複雜推導更穩定。",
    },
    visual: {
      support: "先把文字轉成畫面，再整理成正式關係。",
      extend: "切換圖像、文字與式子，確認概念能靈活轉換。",
    },
    toolkit: {
      support: "先辨認題型與適用條件，再按固定步驟操作。",
      extend: "整理方法的適用條件，再用變化題提升效率。",
    },
  };
  const reasonLead =
    mode === "support"
      ? `本次「${focusTopicLabel}」與「${focusFormatLabel}」題顯示較高的補強訊號。`
      : `本次沒有集中的學習缺口；「${focusTopicLabel}」與「${focusFormatLabel}」可作為下一步深化焦點。`;
  const closeEvidence = margin < 4 ? " 三種方向的證據接近，這只是下一輪練習的起點。" : "";

  const hintsByRoute: Record<LearningRouteId, LearningRecommendation["hints"]> = {
    stepwise: [
      { level: 1, title: "方向提示", text: `先寫下「${focusTopicLabel}」練習要求什麼、已知什麼；暫時不要急著選公式。` },
      { level: 2, title: "關鍵缺口", text: `從題目的關鍵已知出發，補出它與目標之間缺少的中間關係。` },
      { level: 3, title: "操作框架", text: "依序完成「整理已知 → 建立關係 → 逐步推導 → 代入檢查」；最後的運算與結論由你完成。" },
    ],
    visual: [
      { level: 1, title: "方向提示", text: `先不要計算，把「${focusTopicLabel}」題意改用圖、數線、表格或生活語言表達。` },
      { level: 2, title: "關鍵缺口", text: "標出全部、部分、變化前與變化後，補上關係線或缺少的標記。" },
      { level: 3, title: "操作框架", text: "依序完成「畫面 → 數量關係 → 正式式子 → 快速檢查」；保留最後計算與答案自行完成。" },
    ],
    toolkit: [
      { level: 1, title: "方向提示", text: `圈出「${focusFormatLabel}」的關鍵字與數值，先判斷題型，不急著代入。` },
      { level: 2, title: "關鍵缺口", text: "從公式或方法中選出適用者，先確認使用條件與單位，再補上第一個代入位置。" },
      { level: 3, title: "操作框架", text: "依序完成「辨認題型 → 選擇工具 → 代入數值 → 計算 → 驗算」；最後運算與答案由你完成。" },
    ],
  };

  return {
    id: primary.id,
    publicTitle: copy.publicTitle,
    slogan: copy.slogan,
    reason: `${reasonLead} ${routePurpose[primary.id][mode]}${closeEvidence}`,
    evidenceLabel:
      mode === "support"
        ? `${(primary.highNeedCount || answers.filter((answer) => !answer.correct).length).toFixed(1)} 題等效補強訊號 · ${evidenceStrength}`
        : `完成 ${answers.length} 題 · ${evidenceStrength}`,
    focusLabel: `${focusTopicLabel} · ${focusFormatLabel}`,
    flow: [...copy.flow],
    hints: hintsByRoute[primary.id],
  };
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒` : `${seconds} 秒`;
}

function stageAdvice(levelIndex: number) {
  if (levelIndex <= 2) return "先建立數感、分數與比例直覺，練習用圖、表格和算式表達同一個問題。";
  if (levelIndex <= 5) return "加強未知數、方程式、函數與幾何推理，養成逐步列式和驗算的習慣。";
  if (levelIndex <= 8) return "整合代數、函數、向量、機率與微積分初步，練習跨章節問題與完整推導。";
  if (levelIndex <= 10) return "深化微積分、線性代數與機率統計，作答時明確寫出定義、條件和證明結構。";
  return "加強抽象結構、模型假設與數學論證，並練習清楚說明方法的適用邊界。";
}

function diagnosticClass(status: SkillDiagnostic["status"]) {
  if (status === "穩定掌握") return "stable";
  if (status === "基本掌握") return "basic";
  if (status === "發展中") return "developing";
  if (status === "建議補強") return "priority";
  return "pending";
}

function LevelLadder({ activeLevel, resultLevel }: { activeLevel?: number; resultLevel?: number }) {
  return (
    <aside className="level-panel pixel-panel" aria-label="數學能力階梯">
      <div className="panel-kicker">LEVEL MAP</div>
      <h2>能力階梯</h2>
      <ol className="level-list">
        {[...LEVELS].reverse().map((level, reverseIndex) => {
          const levelNumber = LEVELS.length - reverseIndex;
          const isActive = levelNumber === activeLevel;
          const isResult = levelNumber === resultLevel;
          return (
            <li key={level.short} className={`${isActive ? "is-active" : ""} ${isResult ? "is-result" : ""}`}>
              <span className="level-node" aria-hidden="true" />
              <span>{level.short}</span>
              {isActive && <em>掃描中</em>}
              {isResult && <em>定位</em>}
            </li>
          );
        })}
      </ol>
      <div className="ladder-foot">BASE 01 → CORE 12</div>
    </aside>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [quizState, setQuizState] = useState<QuizState>(() => createInitialState());
  const [question, setQuestion] = useState<Question | null>(null);
  const [choiceOrder, setChoiceOrder] = useState<{ text: string; correct: boolean; originalIndex: number }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [learnerName, setLearnerName] = useState("");
  const [reportGeneratedAt, setReportGeneratedAt] = useState<Date | null>(null);
  const [reportId, setReportId] = useState("");
  const [revealedHintLevel, setRevealedHintLevel] = useState(0);
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisFilter>("all");
  const [assessmentHistory, setAssessmentHistory] = useState<AssessmentSession[]>([]);
  const [usesHistory, setUsesHistory] = useState(true);
  const [historyCleared, setHistoryCleared] = useState(false);
  const [historicalBaseline, setHistoricalBaseline] = useState<HistoricalBaseline>(() =>
    buildHistoricalPrior([], BANK, THETA_GRID),
  );
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const questionStartedAtRef = useRef(0);
  const recentQuestionIdsRef = useRef<string[]>([]);
  const completionSavedRef = useRef(false);

  const result = useMemo(() => (phase === "result" ? makeResult(quizState) : null), [phase, quizState]);
  const diagnostics = useMemo(() => makeSkillDiagnostics(quizState.answers), [quizState.answers]);
  const learningRecommendation = useMemo(
    () => makeLearningRecommendation(quizState.answers),
    [quizState.answers],
  );
  const totalAnswerSeconds = useMemo(
    () => quizState.answers.reduce((sum, answer) => sum + answer.elapsedSeconds, 0),
    [quizState.answers],
  );
  const coveredFormatCount = useMemo(
    () => new Set(quizState.answers.map((answer) => answer.format)).size,
    [quizState.answers],
  );
  const prioritizedDiagnostics = useMemo(
    () =>
      diagnostics
        .filter((item) => item.effectiveCount > 0)
        .sort((left, right) => {
          const evidenceDifference = Number(right.effectiveCount >= 1.5) - Number(left.effectiveCount >= 1.5);
          if (evidenceDifference) return evidenceDifference;
          return (left.accuracy ?? 101) - (right.accuracy ?? 101) || right.effectiveCount - left.effectiveCount;
        })
        .slice(0, 3),
    [diagnostics],
  );
  const strongestDiagnostic = useMemo(
    () =>
      diagnostics
        .filter((item) => item.effectiveCount >= 1.5)
        .sort((left, right) => (right.accuracy ?? -1) - (left.accuracy ?? -1) || right.effectiveCount - left.effectiveCount)[0] ?? null,
    [diagnostics],
  );
  const historySummary = useMemo(() => summarizeAssessmentHistory(assessmentHistory), [assessmentHistory]);
  const questionAnalyses = useMemo(
    () => quizState.answers.map((answer, index) => makeQuestionAnalysis(answer, index)),
    [quizState.answers],
  );
  const previousSession = useMemo(
    () => usesHistory
      ? assessmentHistory.filter((session) => session.id !== reportId).at(-1) ?? null
      : null,
    [assessmentHistory, reportId, usesHistory],
  );
  const recentTrend = result
    ? trendLabel(result.sessionAbility, previousSession?.sessionAbility ?? null)
    : trendLabel(0, null);

  const presentQuestion = (item: Question) => {
    setQuestion(item);
    setChoiceOrder(shuffleChoices(item));
    setSelectedIndex(null);
    setFeedback(null);
    questionStartedAtRef.current = window.performance.now();
  };

  const startQuiz = (useHistoricalEvidence = true) => {
    const storedHistory = readAssessmentHistory();
    const baseline = useHistoricalEvidence
      ? buildHistoricalPrior(storedHistory, BANK, THETA_GRID)
      : buildHistoricalPrior([], BANK, THETA_GRID);
    const initial = createInitialState(baseline);
    let recentIds: string[] = [];
    if (useHistoricalEvidence) {
      try {
        const saved = JSON.parse(window.localStorage.getItem(RECENT_ITEMS_KEY) ?? "[]");
        if (Array.isArray(saved)) recentIds = saved.filter((value): value is string => typeof value === "string").slice(-36);
      } catch {
        recentIds = [];
      }
    }
    if (useHistoricalEvidence) {
      recentIds = [
        ...storedHistory.slice(-3).flatMap((session) => session.answers.map((answer) => answer.questionId)),
        ...recentIds,
      ].filter((id, index, values) => values.lastIndexOf(id) === index).slice(-48);
    }
    recentQuestionIdsRef.current = recentIds;
    completionSavedRef.current = false;
    setAssessmentHistory(storedHistory);
    setHistoricalBaseline(baseline);
    setUsesHistory(useHistoricalEvidence);
    setHistoryCleared(false);
    setQuizState(initial);
    setReportGeneratedAt(null);
    setReportId("");
    setLearnerName("");
    setRevealedHintLevel(0);
    setAnalysisFilter("all");
    setPhase("quiz");
    presentQuestion(chooseNextQuestion(initial, recentIds));
  };

  const submitAnswer = () => {
    if (!question || selectedIndex === null || feedback) return;
    const selected = choiceOrder[selectedIndex];
    const elapsedSeconds = Math.max(1, Math.round((window.performance.now() - questionStartedAtRef.current) / 1000));
    const previouslySeen = usesHistory && assessmentHistory.some((session) =>
      session.answers.some((answer) => answer.questionId === question.id),
    );
    const evidenceWeight = previouslySeen ? 0.58 : 1;
    const activeQuestionIds = new Set([...quizState.askedIds, question.id]);
    const historyWithoutRetestedItems = usesHistory
      ? assessmentHistory.map((session) => ({
          ...session,
          answers: session.answers.filter((answer) => !activeQuestionIds.has(answer.questionId)),
        }))
      : [];
    const activeHistoryBaseline = buildHistoricalPrior(
      historyWithoutRetestedItems,
      BANK,
      THETA_GRID,
    );
    const gapBeforeAnswer = Math.abs(
      posteriorMeanFrom(activeHistoryBaseline.posterior) - posteriorMeanFrom(quizState.sessionPosterior),
    );
    const powerBeforeAnswer = quizState.answers.length >= 10 && gapBeforeAnswer > 1.5
      ? Math.max(0.35, Math.min(1, 1.5 / gapBeforeAnswer))
      : 1;
    const posteriorBeforeAnswer = recomputeCombinedPosterior(
      activeHistoryBaseline.posterior,
      quizState.answers,
      powerBeforeAnswer,
    );
    const expectedCorrectProbability = pCorrect(posteriorMeanFrom(posteriorBeforeAnswer), question);
    const answerRecord: AnswerRecord = {
      questionId: question.id,
      selectedChoiceIndex: selected.originalIndex,
      correct: selected.correct,
      selected: selected.text,
      correctAnswer: question.choices[question.correctIndex],
      rationale: question.rationale,
      topic: question.topic,
      format: question.format,
      level: question.level,
      elapsedSeconds,
      expectedCorrectProbability,
      targetSeconds: targetSecondsFor(question),
      evidenceWeight,
      previouslySeen,
    };
    const answers = [...quizState.answers, answerRecord];
    const sessionPosterior = updateDistribution(
      quizState.sessionPosterior,
      question,
      selected.correct,
      evidenceWeight,
    );
    const historyGap = Math.abs(
      posteriorMeanFrom(activeHistoryBaseline.posterior) - posteriorMeanFrom(sessionPosterior),
    );
    const historyPower = answers.length >= 10 && historyGap > 1.5
      ? Math.max(0.35, Math.min(1, 1.5 / historyGap))
      : 1;
    const posterior = recomputeCombinedPosterior(activeHistoryBaseline.posterior, answers, historyPower);
    const nextState: QuizState = {
      posterior,
      sessionPosterior,
      historyPrior: activeHistoryBaseline.posterior,
      historicalEffectiveAnswerCount: activeHistoryBaseline.effectiveAnswerCount * historyPower,
      historicalQuestionIds: activeHistoryBaseline.questionIds,
      answers,
      askedIds: [...quizState.askedIds, question.id],
      topicCounts: { ...quizState.topicCounts, [question.topic]: (quizState.topicCounts[question.topic] ?? 0) + 1 },
      formatCounts: { ...quizState.formatCounts, [question.format]: (quizState.formatCounts[question.format] ?? 0) + 1 },
    };
    setQuizState(nextState);
    setFeedback(selected.correct ? "correct" : "incorrect");
  };

  const persistRecentItems = () => {
    const combined = [...recentQuestionIdsRef.current, ...quizState.askedIds];
    const latestUnique = combined.filter((id, index) => combined.lastIndexOf(id) === index).slice(-36);
    recentQuestionIdsRef.current = latestUnique;
    try {
      window.localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(latestUnique));
    } catch {
      // The assessment still works when private browsing blocks local storage.
    }
  };

  const continueQuiz = () => {
    if (!feedback) return;
    if (shouldStop(quizState)) {
      if (completionSavedRef.current) return;
      completionSavedRef.current = true;
      const completedAt = Date.now();
      const randomPart = window.crypto?.randomUUID?.().slice(0, 8).toUpperCase()
        ?? Math.random().toString(36).slice(2, 10).toUpperCase();
      const nextReportId = `MS-${completedAt.toString(36).toUpperCase()}-${randomPart}`;
      const finalResult = makeResult(quizState);
      if (usesHistory) {
        persistRecentItems();
        const latestStoredHistory = readAssessmentHistory();
        const session = createAssessmentSession({
          id: nextReportId,
          bankVersion: BANK_VERSION,
          completedAt,
          result: finalResult,
          answers: quizState.answers,
        });
        const nextHistory = appendAssessmentSession(latestStoredHistory, session);
        writeAssessmentHistory(nextHistory);
        setAssessmentHistory(nextHistory);
      }
      setReportId(nextReportId);
      setReportGeneratedAt(new Date(completedAt));
      setPhase("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    presentQuestion(chooseNextQuestion(quizState, recentQuestionIdsRef.current));
  };

  const downloadDiagnostic = () => {
    if (!result || !reportGeneratedAt) return;
    const calibrationCount = Math.max(0, quizState.answers.length - BASE_QUESTIONS);
    const finalCalibrationReasons = calibrationReasons(quizState);
    const deepAnalysis = makeDeepAnalysis(quizState.answers, result.ability);
    const lines = [
      "數學能力診斷單｜MATH//SCAN",
      `報告編號：${reportId}`,
      `姓名／代號：${learnerName.trim() || "未填寫"}`,
      `產生日期：${reportGeneratedAt.toLocaleString("zh-TW")}`,
      `推定等級：${LEVELS[result.levelIndex].full}（${LEVELS[result.levelIndex].rank}）`,
      `可能區間：${LEVELS[levelIndexFromTheta(result.low)].short} — ${LEVELS[levelIndexFromTheta(result.high)].short}`,
      `結果穩定度：${result.confidence}`,
      `作答紀錄：${result.correctCount} / ${quizState.answers.length} 命中`,
      `作答計時：${formatDuration(totalAnswerSeconds)}`,
      `評量結構：${BASE_QUESTIONS} 題標準掃描 + ${calibrationCount} 題校正`,
      `校正狀態：${calibrationCount ? (finalCalibrationReasons.length ? `達上限後仍有：${finalCalibrationReasons.join("、")}` : "校正後證據已收斂") : "第 10 題後證據一致，未追加題目"}`,
      "",
      "跨次評量校準",
      `評量模式：${usesHistory ? "延續此學習者的本機紀錄" : "訪客模式（未讀取或保存歷史）"}`,
      `累積評量：${usesHistory ? `${historySummary.sessionCount} 次` : "僅本次"}`,
      `歷史有效證據：${result.historicalEffectiveEvidence.toFixed(1)} 題等效權重／${quizState.historicalQuestionIds.length} 題獨立題目`,
      `本次有效證據：${result.currentEffectiveEvidence.toFixed(1)} 題等效權重${result.repeatedQuestionCount ? `（${result.repeatedQuestionCount} 題重複曝光已降權）` : ""}`,
      `本次獨立能力值：${result.sessionAbility.toFixed(1)} / 12`,
      `近期趨勢：${recentTrend.label}${recentTrend.delta === null ? "" : `（${recentTrend.delta >= 0 ? "+" : ""}${recentTrend.delta.toFixed(1)}）`}`,
      "說明：歷史只作弱先驗；同題只採最近一次、舊紀錄會衰減，且本次結果可推翻過時基準。",
      "",
      "能力地圖",
      ...diagnostics.map((item) => `${item.label}：${item.status}｜${item.evidence}｜${item.accuracy === null ? "未取樣" : `${item.correctCount}/${item.sampleCount}；加權 ${item.accuracy}%／有效 ${item.effectiveCount.toFixed(1)} 題`}`),
      "",
      "深度表現分析",
      `整體命中率：${deepAnalysis.overallAccuracy}%`,
      `平均節奏：${deepAnalysis.paceRatio === null ? "未取得" : `${Math.round(deepAnalysis.paceRatio * 100)}% 目標時間`}`,
      `前後段趨勢：${deepAnalysis.trend}`,
      `最長連續命中：${deepAnalysis.longestStreak} 題`,
      `超預期命中：${deepAnalysis.hardWins} 題｜高預期失誤：${deepAnalysis.unexpectedMisses} 題`,
      ...deepAnalysis.formatMetrics.map((item) => `${item.label}：${item.accuracy === null ? "未取樣" : `${item.correctCount}/${item.sampleCount}（${item.accuracy}%）`}`),
      "",
      "推薦學習武器",
      `${learningRecommendation.publicTitle}｜${learningRecommendation.slogan}`,
      `推薦原因：${learningRecommendation.reason}`,
      `本次焦點：${learningRecommendation.focusLabel}`,
      `學習順序：${learningRecommendation.flow.join(" → ")}`,
      "補強：請在線上依第 1 至第 3 級逐步開啟；提示不會直接公布答案。",
      "說明：這不是固定學習風格分類，而是依本次作答證據提供的練習起點。",
      "",
      "建議學習路線",
      ...prioritizedDiagnostics.map((item, index) => `${index + 1}. ${item.label}：${item.recommendation}`),
      `階段建議：${stageAdvice(result.levelIndex)}`,
      "",
      "每題分析",
      ...questionAnalyses.map((analysis) => `${analysis.index + 1}. [${TOPIC_LABELS[analysis.item.topic]}／${LEVELS[analysis.item.level - 1].short}／${FORMAT_LABELS[analysis.item.format]}] ${analysis.item.prompt}\n   狀態：${analysis.status}${analysis.answer.previouslySeen ? "／重複題已降權" : ""}\n   我的答案：${analysis.answer.selected}\n   參考答案：${analysis.answer.correctAnswer}\n   作答時間：${analysis.timeLabel}\n   作答前預估命中率：${analysis.expectedLabel}\n   證據權重：${analysis.answer.evidenceWeight.toFixed(2)}\n   判讀依據：${analysis.observation}\n   快速檢查：${analysis.answer.rationale}\n   下一步：${analysis.routeTitle}｜${analysis.nextAction}`),
      "",
      "說明：本診斷僅供自我了解與學習規劃，不等同學校成績、正式檢定、入學資格或學位認證。",
    ];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `math-scan-${reportId}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const clearAssessmentHistory = () => {
    if (!window.confirm("確定清除這台裝置上的多次評量紀錄？此動作無法復原。")) return;
    try {
      window.localStorage.removeItem(ASSESSMENT_HISTORY_KEY);
      window.localStorage.removeItem(RECENT_ITEMS_KEY);
    } catch {
      // Keep the current report visible even if browser storage is unavailable.
    }
    setHistoryCleared(true);
    if (phase === "intro") {
      setAssessmentHistory([]);
      setHistoricalBaseline(buildHistoricalPrior([], BANK, THETA_GRID));
    }
  };

  const printFullReport = () => {
    setAnalysisFilter("all");
    window.setTimeout(() => window.print(), 0);
  };

  useEffect(() => {
    const syncHistory = () => {
      if (phase === "intro") setAssessmentHistory(readAssessmentHistory());
    };
    const frame = window.requestAnimationFrame(syncHistory);
    window.addEventListener("storage", syncHistory);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("storage", syncHistory);
    };
  }, [phase]);

  useEffect(() => {
    if (phase === "quiz" && question) questionHeadingRef.current?.focus();
  }, [phase, question]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (phase !== "quiz" || !question) return;
      if ((event.target as HTMLElement).tagName === "BUTTON") return;
      if (!feedback && ["1", "2", "3", "4"].includes(event.key)) setSelectedIndex(Number(event.key) - 1);
      if (event.key === "Enter") {
        if (feedback) continueQuiz();
        else submitAnswer();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const activeLevel = phase === "quiz" ? question?.level : undefined;
  const currentStep = Math.min(quizState.answers.length + (feedback ? 0 : 1), MAX_QUESTIONS);
  const calibrationRequired =
    phase === "quiz" &&
    quizState.answers.length >= BASE_QUESTIONS &&
    !shouldStop(quizState);
  const isCalibrationQuestion =
    phase === "quiz" &&
    (currentStep > BASE_QUESTIONS || (Boolean(feedback) && calibrationRequired));

  return (
    <main className="site-frame">
      <header className={`topbar screen-only ${isCalibrationQuestion ? "is-calibrating" : ""}`}>
        <a className="brand" href="#top" aria-label="數學等級評比器首頁">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>MATH//SCAN</span>
        </a>
        <div className={`system-status ${isCalibrationQuestion ? "is-calibrating" : ""}`} aria-live="polite"><span aria-hidden="true" /> {isCalibrationQuestion ? "CALIBRATION SIGNAL" : "ADAPTIVE SYSTEM ONLINE"}</div>
      </header>

      <div className="mobile-level-strip screen-only" aria-hidden="true">
        <span>小四</span><b>···</b><span>{activeLevel ? LEVELS[activeLevel - 1].short : result ? LEVELS[result.levelIndex].short : "探索中"}</span><b>···</b><span>碩士</span>
      </div>

      <div className="workspace" id="top">
        <LevelLadder activeLevel={activeLevel} resultLevel={result ? result.levelIndex + 1 : undefined} />

        <section className="main-stage">
          {phase === "intro" && (
            <div className="intro-screen">
              <div className="eyebrow"><span>DIAGNOSTIC v4.0</span><span>{BANK.length}-ITEM BANK</span></div>
              <div className="hero-grid">
                <div>
                  <p className="hero-code">{"// FIND YOUR CURRENT MATH ZONE"}</p>
                  <h1>數學等級<br /><strong>評比器</strong></h1>
                  <p className="hero-copy">從小學四年級到碩士核心，通常以 10 題完成能力定位；只有證據矛盾或區間過寬時，才追加校正題。</p>
                </div>
                <div className="scanner-art" aria-hidden="true">
                  <div className="scanner-orbit orbit-one" />
                  <div className="scanner-orbit orbit-two" />
                  <div className="scanner-core">Σ</div>
                  <span className="scanner-ping ping-one" />
                  <span className="scanner-ping ping-two" />
                </div>
              </div>

              <div className="stat-row" aria-label="測驗資訊">
                <div><strong>{BASE_QUESTIONS} 題</strong><span>標準掃描</span></div>
                <div><strong>最多 {MAX_QUESTIONS}</strong><span>特殊校正</span></div>
                <div><strong>{BANK.length} 題</strong><span>多元題庫</span></div>
              </div>

              <div className="briefing pixel-panel">
                <div>
                  <div className="panel-kicker">MISSION BRIEF</div>
                  <h2>這趟遠征怎麼進行？</h2>
                </div>
                <ul>
                  <li><span>01</span> 計算、應用、資料、推理與概念題交錯出現</li>
                  <li><span>02</span> 多次評量採近期加權、同題去重，結果會逐次校準</li>
                  <li><span>03</span> 結算提供全部題目的分析、列印與文字診斷</li>
                </ul>
                <button className="pixel-button primary" onClick={() => startQuiz(true)}>
                  {historySummary.sessionCount ? "延續此學習者" : "開始能力掃描"} <span aria-hidden="true">▶</span>
                </button>
              </div>

              <div className="history-resume pixel-panel">
                <div>
                  <span>LOCAL MULTI-SCAN</span>
                  <strong>{historySummary.sessionCount ? `已累積 ${historySummary.sessionCount} 次完整評量` : "完成後建立本機跨次基準"}</strong>
                  <p>{historySummary.sessionCount
                    ? `已涵蓋 ${historySummary.uniqueQuestionCount} 題；舊紀錄會衰減，同題只採最近一次。`
                    : "只保存題號、選項位置、作答時間與估計摘要，不保存姓名或完整題目。"}</p>
                </div>
                <div className="history-resume-actions">
                  <button type="button" onClick={() => startQuiz(false)}>另一位學習者／訪客模式</button>
                  {historySummary.sessionCount > 0 && !historyCleared && (
                    <button className="clear-history-button" type="button" onClick={clearAssessmentHistory}>清除本機紀錄</button>
                  )}
                </div>
              </div>
              <p className="micro-note">訪客模式不讀取也不寫入歷史；所有計算皆在你的裝置上完成。</p>
            </div>
          )}

          {phase === "quiz" && question && (
            <div className="quiz-screen">
              {isCalibrationQuestion && (
                <div className="calibration-alert" role="status" aria-live="assertive">
                  <span className="calibration-alert-light" aria-hidden="true" />
                  <div>
                    <strong>CALIBRATION SIGNAL</strong>
                    <small>校正模式啟動：系統正在確認能力區間</small>
                  </div>
                </div>
              )}
              <div className="quiz-hud">
                <div>
                  <span className="hud-label">QUESTION</span>
                  <strong>{String(currentStep).padStart(2, "0")}<small>/{MAX_QUESTIONS} MAX</small></strong>
                </div>
                <div className="hud-chip"><span>ZONE</span>{LEVELS[question.level - 1].short}</div>
                <div className="hud-chip"><span>DOMAIN</span>{TOPIC_LABELS[question.topic]}</div>
                <div className="hud-chip"><span>FORMAT</span>{FORMAT_LABELS[question.format]}</div>
              </div>

              <div className={`segment-progress ${isCalibrationQuestion ? "is-calibrating" : ""}`} role="progressbar" aria-label="測驗進度" aria-valuemin={0} aria-valuemax={MAX_QUESTIONS} aria-valuenow={quizState.answers.length}>
                {Array.from({ length: MAX_QUESTIONS }, (_, index) => <i key={index} className={`${index < quizState.answers.length ? "done" : index === quizState.answers.length ? "current" : ""} ${index >= BASE_QUESTIONS ? "calibration-segment" : "standard-segment"}`.trim()} />)}
              </div>

              <div className="question-card pixel-panel">
                <div className="question-meta"><span>關卡 {String(currentStep).padStart(2, "0")}</span><span>{quizState.answers.length >= BASE_QUESTIONS ? "校正題：確認能力區間" : "選出唯一正確答案"}</span></div>
                <h1 ref={questionHeadingRef} tabIndex={-1}>{question.prompt}</h1>

                <fieldset disabled={Boolean(feedback)}>
                  <legend className="sr-only">答案選項</legend>
                  <div className="answers-grid">
                    {choiceOrder.map((choice, index) => {
                      const selected = selectedIndex === index;
                      const revealCorrect = Boolean(feedback) && choice.correct;
                      const revealWrong = feedback === "incorrect" && selected;
                      return (
                        <label key={`${question.id}-${choice.text}`} className={`answer-option ${selected ? "selected" : ""} ${revealCorrect ? "correct" : ""} ${revealWrong ? "wrong" : ""}`}>
                          <input type="radio" name="answer" checked={selected} onChange={() => setSelectedIndex(index)} />
                          <span className="answer-key">{index + 1}</span>
                          <span className="answer-text">{choice.text}</span>
                          <span className="answer-state" aria-hidden="true">{revealCorrect ? "✓" : revealWrong ? "×" : selected ? "◆" : "◇"}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className={`feedback-bar ${feedback ?? ""}`} aria-live="polite">
                  {feedback === "correct" && <><strong>判定成功</strong><span>這項能力已點亮，系統正在切換下一個題型。</span></>}
                  {feedback === "incorrect" && <><strong>路線校準</strong><span>已記錄這次判定，診斷單會整理相關觀念。</span></>}
                  {!feedback && <><strong>操作提示</strong><span>按 1–4 選擇，按 Enter 確認。</span></>}
                </div>

                <div className="quiz-actions">
                  <span className="adaptive-note"><i aria-hidden="true" /> {quizState.answers.length >= BASE_QUESTIONS ? "CALIBRATION MODE" : "DIVERSITY + BAYES CALIBRATION"}</span>
                  {!feedback ? (
                    <button className="pixel-button primary" disabled={selectedIndex === null} onClick={submitAnswer}>確認答案 <span aria-hidden="true">↵</span></button>
                  ) : (
                    <button className="pixel-button primary" onClick={continueQuiz}>{shouldStop(quizState) ? "產生診斷單" : quizState.answers.length >= BASE_QUESTIONS ? "進入校正題" : "進入下一關"} <span aria-hidden="true">▶</span></button>
                  )}
                </div>
              </div>
            </div>
          )}

          {phase === "result" && result && reportGeneratedAt && (
            <div className="result-screen">
              <div className="result-header screen-only">
                <div>
                  <div className="eyebrow"><span>SCAN COMPLETE</span><span>CONFIDENCE: {result.confidence}</span></div>
                  <p className="hero-code">{"// YOUR PERSONAL DIAGNOSTIC"}</p>
                  <h1>診斷完成</h1>
                </div>
                <div className="result-score"><strong>{result.score}</strong><span>ABILITY INDEX</span></div>
              </div>

              <section className="report-masthead pixel-panel">
                <div className="report-title">
                  <div><span>MATH//SCAN · REPORT v4.0</span><h2>數學能力診斷單</h2></div>
                  <strong>{reportId}</strong>
                </div>
                <div className="report-identity">
                  <label className="screen-only">姓名／代號<input value={learnerName} maxLength={30} onChange={(event) => setLearnerName(event.target.value)} placeholder="可選填，列印時會顯示" /></label>
                  <div className="print-only"><span>姓名／代號</span><strong>{learnerName.trim() || "＿＿＿＿＿＿＿＿"}</strong></div>
                  <div><span>產生日期</span><strong>{reportGeneratedAt.toLocaleDateString("zh-TW")}</strong></div>
                  <div><span>作答計時</span><strong>{formatDuration(totalAnswerSeconds)}</strong></div>
                  <div><span>題型覆蓋</span><strong>{coveredFormatCount} / 5 種</strong></div>
                  <div><span>評量結構</span><strong>{BASE_QUESTIONS} + {Math.max(0, quizState.answers.length - BASE_QUESTIONS)} 題校正</strong></div>
                </div>
              </section>

              <section className="rank-card pixel-panel">
                <div className="rank-code">LEVEL {String(result.levelIndex + 1).padStart(2, "0")}</div>
                <div className="rank-main">
                  <div className="rank-emblem" aria-hidden="true"><span>Σ</span></div>
                  <div>
                    <p>本次表現最接近</p>
                    <h2>{LEVELS[result.levelIndex].full}</h2>
                    <strong>{LEVELS[result.levelIndex].rank}</strong>
                  </div>
                </div>
                <p className="rank-blurb">{LEVELS[result.levelIndex].blurb}</p>
                <div className="result-metrics">
                  <div><span>可能區間</span><strong>{LEVELS[levelIndexFromTheta(result.low)].short} — {LEVELS[levelIndexFromTheta(result.high)].short}</strong></div>
                  <div><span>本次命中</span><strong>{result.correctCount} / {quizState.answers.length}</strong></div>
                  <div><span>結果穩定度</span><strong>{result.confidence}</strong></div>
                  <div><span>能力值</span><strong>{result.ability.toFixed(1)} / 12</strong></div>
                </div>
                <p className="evidence-note">綜合證據集中於 {LEVELS[levelIndexFromTheta(result.low)].short} 到 {LEVELS[levelIndexFromTheta(result.high)].short}。歷史只作弱先驗，本次 14–16 題仍可推動或修正結果；估計區間不代表能力上限。</p>
              </section>

              <section className="history-card pixel-panel">
                <div className="section-heading">
                  <div><div className="panel-kicker">MULTI-SCAN EVIDENCE</div><h2>跨次評量校準</h2></div>
                  <span>{usesHistory ? "近期加權 · 同題去重 · 可被本次修正" : "訪客模式 · 僅採本次證據"}</span>
                </div>
                <div className="history-metrics">
                  <div><span>完整評量</span><strong>{usesHistory ? historySummary.sessionCount : 1} 次</strong></div>
                  <div><span>歷史等效證據</span><strong>{result.historicalEffectiveEvidence.toFixed(1)} 題</strong></div>
                  <div><span>綜合獨立題目</span><strong>{result.uniqueEvidence} 題</strong></div>
                  <div className={`trend-${recentTrend.tone}`}><span>近期評量趨勢</span><strong>{recentTrend.label}</strong></div>
                </div>
                <div className="history-comparison">
                  <div><span>本次獨立能力值</span><strong>{result.sessionAbility.toFixed(1)}</strong><small>{LEVELS[levelIndexFromTheta(result.sessionAbility)].short}</small></div>
                  <i aria-hidden="true">→</i>
                  <div><span>跨次校準能力值</span><strong>{result.ability.toFixed(1)}</strong><small>{LEVELS[result.levelIndex].short}</small></div>
                  <p>{!usesHistory
                    ? "這次未讀取或保存任何歷史紀錄。"
                    : historicalBaseline.sessionCount === 0
                      ? "這是第一份本機基準；完成下一次評量後才會形成近期趨勢。"
                      : result.historyGap > 1.5
                        ? "本次與舊基準差距較大，系統已自動降低歷史影響，讓近期表現能修正結果。"
                        : `歷史保留 ${quizState.historicalQuestionIds.length} 題獨立且未於本次重做的近期證據；本次趨勢${recentTrend.delta === null ? "仍在累積" : `變化 ${recentTrend.delta >= 0 ? "+" : ""}${recentTrend.delta.toFixed(1)}` }。`}</p>
                </div>
              </section>

              <section className="skill-card pixel-panel">
                <div className="section-heading"><div><div className="panel-kicker">SKILL EVIDENCE</div><h2>能力地圖</h2></div><span>顯示有效題數；重複曝光同步降權</span></div>
                <div className="skill-list">
                  {diagnostics.map((item) => (
                    <div className={`skill-row ${diagnosticClass(item.status)}`} key={item.label}>
                      <div className="skill-name"><span>{item.label}</span><small>{item.status}</small></div>
                      <div className="skill-track" style={{ "--skill": `${item.accuracy ?? 0}%` } as CSSProperties}><i /></div>
                      <div className="skill-value"><strong>{item.accuracy === null ? "—" : `${item.accuracy}%`}</strong><small>{item.sampleCount ? `${item.correctCount}/${item.sampleCount} · 有效 ${item.effectiveCount.toFixed(1)} 題 · ${item.evidence}` : "未取樣"}</small></div>
                    </div>
                  ))}
                </div>
              </section>

              <DeepAnalysisPanel answers={quizState.answers} ability={result.ability} />

              <section className="learning-card pixel-panel">
                <div className="section-heading"><div><div className="panel-kicker">LEARNING ROUTE</div><h2>三步學習路線</h2></div><span>依本次證據排序</span></div>
                <p className="diagnostic-summary">
                  {strongestDiagnostic
                    ? `你在「${strongestDiagnostic.label}」呈現相對穩定的訊號；以下建議以目前最值得確認或補強的領域優先。`
                    : "本次各領域樣本仍少，以下先提供可操作的確認路線，建議完成練習後再次評量。"}
                </p>
                <div className="learning-grid">
                  {prioritizedDiagnostics.map((item, index) => (
                    <article key={item.label}>
                      <span>STEP {String(index + 1).padStart(2, "0")}</span>
                      <h3>{item.label}</h3>
                      <strong>{item.status} · {item.evidence}</strong>
                      <p>{item.recommendation}</p>
                    </article>
                  ))}
                </div>
                <div className="stage-advice"><strong>階段建議</strong><p>{stageAdvice(result.levelIndex)}</p></div>
              </section>

              <section className="item-analysis-card pixel-panel detail-page" id="item-analysis">
                <div className="section-heading">
                  <div><div className="panel-kicker">ITEM AUDIT</div><h2>每題分析</h2></div>
                  <span>完整呈現 {quizState.answers.length} 題 · 保留原作答順序</span>
                </div>
                <p className="item-analysis-note">判讀只描述可觀察的作答訊號，不推測真正思考原因。慢速表示超過參考時間；超過三倍視為可能閒置，不納入速度判斷。</p>
                <div className="item-filter-bar screen-only" role="toolbar" aria-label="篩選每題分析">
                  <button type="button" aria-pressed={analysisFilter === "all"} onClick={() => setAnalysisFilter("all")}>全部 <b>{questionAnalyses.length}</b></button>
                  <button type="button" aria-pressed={analysisFilter === "review"} onClick={() => setAnalysisFilter("review")}>需要回看 <b>{questionAnalyses.filter((analysis) => analysis.needsReview).length}</b></button>
                  <button type="button" aria-pressed={analysisFilter === "secure"} onClick={() => setAnalysisFilter("secure")}>穩定／挑戰命中 <b>{questionAnalyses.filter((analysis) => analysis.answer.correct && !analysis.needsReview).length}</b></button>
                </div>
                <div className="item-analysis-list">
                  {questionAnalyses.map((analysis) => {
                    const matchesFilter = analysisFilter === "all"
                      || (analysisFilter === "review" && analysis.needsReview)
                      || (analysisFilter === "secure" && analysis.answer.correct && !analysis.needsReview);
                    return (
                      <details
                        className={`item-analysis-entry state-${analysis.tone} ${matchesFilter ? "" : "is-filtered-out"}`}
                        key={`${analysis.answer.questionId}-${analysis.index}`}
                      >
                      <summary>
                        <span className="item-number">Q{String(analysis.index + 1).padStart(2, "0")}</span>
                        <span className="item-title">
                          <small>{TOPIC_LABELS[analysis.item.topic]} · {LEVELS[analysis.item.level - 1].short} · {FORMAT_LABELS[analysis.item.format]}</small>
                          <strong>{analysis.item.prompt}</strong>
                        </span>
                        <span className="item-statuses">
                          <span className={analysis.answer.correct ? "status-correct" : "status-incorrect"}>{analysis.answer.correct ? "正確" : "錯誤"}</span>
                          {analysis.isSlow && <span className="status-slow">慢速</span>}
                          {analysis.isChallenge && <span className="status-hard">高難命中</span>}
                          {analysis.interrupted && <span className="status-paused">時間不判讀</span>}
                          {analysis.answer.previouslySeen && <span className="status-repeat">重複題降權</span>}
                        </span>
                        <i className="item-chevron" aria-hidden="true" />
                      </summary>
                      <div className="item-analysis-body">
                        <dl className="item-metrics">
                          <div><dt>你的答案</dt><dd>{analysis.answer.selected}</dd></div>
                          <div><dt>參考答案</dt><dd>{analysis.answer.correctAnswer}</dd></div>
                          <div><dt>作答時間</dt><dd>{analysis.timeLabel}</dd></div>
                          <div><dt>本題證據</dt><dd>預估命中率 {analysis.expectedLabel}／權重 {analysis.answer.evidenceWeight.toFixed(2)}</dd></div>
                        </dl>
                        <div className="item-insight-grid">
                          <section><h3>{analysis.status}</h3><p>{analysis.observation}</p></section>
                          <section><h3>下一步建議</h3><span>{analysis.routeTitle}</span><p>{analysis.nextAction}</p></section>
                        </div>
                        <div className="item-rationale"><strong>快速檢查</strong><p>{analysis.answer.rationale}</p></div>
                      </div>
                      </details>
                    );
                  })}
                </div>
              </section>

              <section
                className={`weapon-card pixel-panel weapon-${learningRecommendation.id}`}
                aria-label="推薦學習武器"
              >
                <div className="section-heading">
                  <div><div className="panel-kicker">RECOMMENDED LOADOUT</div><h2>推薦學習武器</h2></div>
                  <span>依本次作答證據配置</span>
                </div>

                <div className="weapon-overview">
                  <div className={`weapon-icon icon-${learningRecommendation.id}`} aria-hidden="true">
                    <i /><i /><i />
                  </div>
                  <div className="weapon-copy">
                    <span>本次建議</span>
                    <h3>{learningRecommendation.publicTitle}</h3>
                    <strong>{learningRecommendation.slogan}</strong>
                    <p>{learningRecommendation.reason}</p>
                    <div className="weapon-chips">
                      <span>焦點／{learningRecommendation.focusLabel}</span>
                      <span>依據／{learningRecommendation.evidenceLabel}</span>
                    </div>
                  </div>
                </div>

                <ol className="weapon-flow" aria-label="建議學習順序">
                  {learningRecommendation.flow.map((step, index) => (
                    <li key={step}>
                      <b>{String(index + 1).padStart(2, "0")}</b>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>

                <div className="boost-shell">
                  <div className="boost-heading">
                    <div><span>PROGRESSIVE SUPPORT</span><h3>補強</h3></div>
                    <p>需要時再依序開啟；不直接公布答案。</p>
                  </div>
                  <ol className="boost-levels" id="boost-levels" aria-live="polite">
                    {learningRecommendation.hints.map((hint) => {
                      const isRevealed = hint.level <= revealedHintLevel;
                      return (
                        <li className={isRevealed ? "is-revealed" : "is-locked"} key={hint.level}>
                          <b>{String(hint.level).padStart(2, "0")}</b>
                          <span>
                            <strong>第 {hint.level} 級｜{hint.title}</strong>
                            <small>{isRevealed ? hint.text : "尚未開啟"}</small>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  {revealedHintLevel < 3 ? (
                    <button
                      className="boost-button screen-only"
                      type="button"
                      aria-controls="boost-levels"
                      onClick={() => setRevealedHintLevel((level) => Math.min(3, level + 1))}
                    >
                      開啟第 {revealedHintLevel + 1} 級補強 <span aria-hidden="true">＋</span>
                    </button>
                  ) : (
                    <p className="boost-complete">三級補強已開啟；請自行完成最後運算與答案。</p>
                  )}
                </div>

                <p className="weapon-disclaimer">這不是固定學習風格分類，而是依本次作答證據提供的下一輪練習起點。</p>
              </section>

              <section className="action-plan print-only">
                <h2>個人行動計畫</h2>
                <p>本週優先補強：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</p>
                <p>預計完成：＿＿題／＿＿分鐘　完成日期：＿＿年＿＿月＿＿日</p>
                <p>我會如何確認理解：□ 口頭說明　□ 完整列式　□ 變化題　□ 限時練習</p>
              </section>

              <div className="result-actions screen-only">
                <button className="pixel-button primary" onClick={printFullReport}>列印完整診斷 <span aria-hidden="true">▣</span></button>
                <button className="pixel-button ghost" onClick={downloadDiagnostic}>下載文字診斷 <span aria-hidden="true">↓</span></button>
                <button className="pixel-button ghost" onClick={() => startQuiz(usesHistory)}>重新掃描 <span aria-hidden="true">↻</span></button>
                {usesHistory && historySummary.sessionCount > 0 && !historyCleared && <button className="pixel-button ghost danger" onClick={clearAssessmentHistory}>清除本機紀錄</button>}
              </div>

              <section className="method-note" id="method">
                <strong>評量與隱私說明</strong>
                <p>本工具以 Bayesian 能力估算綜合本次作答與裝置內的近期完整評量。歷史證據採時間衰減、同題只取最近一次並限制總影響；若本次與舊基準衝突，系統會降低歷史權重。</p>
                <p>最多保留最近 8 次完整評量，僅保存題號、選項位置、作答時間與估計摘要，不保存姓名或完整題目。資料只在你的瀏覽器中處理，不會傳送到 GPT 或外部評分服務；訪客模式完全不讀寫歷史。</p>
                <p>結果僅供自我了解、教學討論與學習規劃，不等同學校年級、正式成績、入學資格、智力測驗或學位認證。</p>
              </section>
            </div>
          )}
        </section>
      </div>

      <footer className="screen-only"><span>© 2026 MATH//SCAN</span><span>用好奇心校準，不用分數定義自己。</span></footer>
    </main>
  );
}
