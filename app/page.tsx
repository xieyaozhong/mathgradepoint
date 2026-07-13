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

type Phase = "intro" | "quiz" | "result";

type AnswerRecord = {
  questionId: string;
  correct: boolean;
  selected: string;
  correctAnswer: string;
  rationale: string;
  topic: Topic;
  format: QuestionFormat;
  level: number;
  elapsedSeconds: number;
};

type QuizState = {
  posterior: number[];
  answers: AnswerRecord[];
  askedIds: string[];
  topicCounts: Partial<Record<Topic, number>>;
  formatCounts: Partial<Record<QuestionFormat, number>>;
};

type SkillDiagnostic = {
  label: string;
  recommendation: string;
  sampleCount: number;
  correctCount: number;
  accuracy: number | null;
  averageSeconds: number | null;
  status: "穩定掌握" | "基本掌握" | "發展中" | "建議補強" | "待進一步確認" | "尚未評量";
  evidence: "證據較充足" | "初步訊號" | "單題取樣" | "未取樣";
};

const MIN_QUESTIONS = 14;
const MAX_QUESTIONS = 16;
const RECENT_ITEMS_KEY = "math-scan-recent-items-v2";
const THETA_GRID = Array.from({ length: 111 }, (_, index) => 1 + index / 10);

function createInitialState(): QuizState {
  return {
    posterior: THETA_GRID.map(() => 1 / THETA_GRID.length),
    answers: [],
    askedIds: [],
    topicCounts: {},
    formatCounts: {},
  };
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

function posteriorMean(state: QuizState) {
  return state.posterior.reduce((sum, weight, index) => sum + weight * THETA_GRID[index], 0);
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

function chooseNextQuestion(state: QuizState, recentIds: string[]) {
  const mean = posteriorMean(state);
  const unused = BANK.filter((item) => !state.askedIds.includes(item.id));
  const nearby = unused.filter((item) => Math.abs(item.b - mean) <= 3);
  const candidates = nearby.length >= 5 ? nearby : unused;
  const lastTopic = state.answers.at(-1)?.topic;
  const currentEntropy = entropy(state.posterior);

  const scored = candidates.map((item) => {
    const informationGain = currentEntropy - expectedEntropy(state, item);
    const unseenTopicBonus = state.topicCounts[item.topic] ? 0 : 0.13;
    const unseenFormatBonus = state.formatCounts[item.format] ? 0 : 0.08;
    const topicRepeatPenalty = 0.07 * (state.topicCounts[item.topic] ?? 0);
    const formatRepeatPenalty = 0.04 * (state.formatCounts[item.format] ?? 0);
    const consecutivePenalty = lastTopic === item.topic ? 0.15 : 0;
    const recentExposurePenalty = recentIds.includes(item.id) ? 0.11 : 0;
    const distancePenalty = 0.008 * Math.abs(item.b - mean);
    const jitter = Math.random() * 0.025;
    return {
      item,
      utility:
        informationGain +
        unseenTopicBonus +
        unseenFormatBonus +
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

function updatePosterior(state: QuizState, item: Question, correct: boolean) {
  return normalize(
    state.posterior.map((weight, index) => {
      const chance = pCorrect(THETA_GRID[index], item);
      return weight * (correct ? chance : 1 - chance);
    }),
  );
}

function quantile(state: QuizState, target: number) {
  let cumulative = 0;
  for (let index = 0; index < state.posterior.length; index += 1) {
    cumulative += state.posterior[index];
    if (cumulative >= target) return THETA_GRID[index];
  }
  return 12;
}

function shouldStop(state: QuizState) {
  if (state.answers.length < MIN_QUESTIONS) return false;
  if (state.answers.length >= MAX_QUESTIONS) return true;
  return quantile(state, 0.9) - quantile(state, 0.1) <= 2.6;
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
  const low = quantile(state, 0.1);
  const high = quantile(state, 0.9);
  const width = high - low;
  return {
    levelIndex,
    ability,
    low,
    high,
    confidence: width <= 1.8 ? "高" : width <= 2.8 ? "中" : "初步",
    score: Math.max(0, Math.min(100, Math.round(((ability - 1) / 11) * 100))),
    correctCount: state.answers.filter((answer) => answer.correct).length,
  };
}

function shuffleChoices(item: Question) {
  const choices = item.choices.map((text, index) => ({ text, correct: index === item.correctIndex }));
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
    const accuracy = sampled.length ? Math.round((correctCount / sampled.length) * 100) : null;
    const averageSeconds = sampled.length
      ? Math.round(sampled.reduce((sum, answer) => sum + answer.elapsedSeconds, 0) / sampled.length)
      : null;
    const evidence = sampled.length >= 3 ? "證據較充足" : sampled.length === 2 ? "初步訊號" : sampled.length === 1 ? "單題取樣" : "未取樣";

    let status: SkillDiagnostic["status"] = "尚未評量";
    if (sampled.length === 1) status = "待進一步確認";
    else if (accuracy !== null && accuracy >= 80 && sampled.length >= 3) status = "穩定掌握";
    else if (accuracy !== null && accuracy >= 60) status = "基本掌握";
    else if (accuracy !== null && accuracy >= 40) status = "發展中";
    else if (accuracy !== null) status = "建議補強";

    return {
      label: group.label,
      recommendation: group.recommendation,
      sampleCount: sampled.length,
      correctCount,
      accuracy,
      averageSeconds,
      status,
      evidence,
    };
  });
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
  const [choiceOrder, setChoiceOrder] = useState<{ text: string; correct: boolean }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [learnerName, setLearnerName] = useState("");
  const [reportGeneratedAt, setReportGeneratedAt] = useState<Date | null>(null);
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const questionStartedAtRef = useRef(0);
  const recentQuestionIdsRef = useRef<string[]>([]);

  const result = useMemo(() => (phase === "result" ? makeResult(quizState) : null), [phase, quizState]);
  const diagnostics = useMemo(() => makeSkillDiagnostics(quizState.answers), [quizState.answers]);
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
        .filter((item) => item.sampleCount > 0)
        .sort((left, right) => {
          const evidenceDifference = Number(right.sampleCount >= 2) - Number(left.sampleCount >= 2);
          if (evidenceDifference) return evidenceDifference;
          return (left.accuracy ?? 101) - (right.accuracy ?? 101) || right.sampleCount - left.sampleCount;
        })
        .slice(0, 3),
    [diagnostics],
  );
  const strongestDiagnostic = useMemo(
    () =>
      diagnostics
        .filter((item) => item.sampleCount >= 2)
        .sort((left, right) => (right.accuracy ?? -1) - (left.accuracy ?? -1) || right.sampleCount - left.sampleCount)[0] ?? null,
    [diagnostics],
  );
  const reportId = useMemo(
    () => (reportGeneratedAt ? `MS-${reportGeneratedAt.getTime().toString(36).toUpperCase()}` : ""),
    [reportGeneratedAt],
  );

  const presentQuestion = (item: Question) => {
    setQuestion(item);
    setChoiceOrder(shuffleChoices(item));
    setSelectedIndex(null);
    setFeedback(null);
    questionStartedAtRef.current = window.performance.now();
  };

  const startQuiz = () => {
    const initial = createInitialState();
    let recentIds: string[] = [];
    try {
      const saved = JSON.parse(window.localStorage.getItem(RECENT_ITEMS_KEY) ?? "[]");
      if (Array.isArray(saved)) recentIds = saved.filter((value): value is string => typeof value === "string").slice(-36);
    } catch {
      recentIds = [];
    }
    recentQuestionIdsRef.current = recentIds;
    setQuizState(initial);
    setReportGeneratedAt(null);
    setLearnerName("");
    setPhase("quiz");
    presentQuestion(chooseNextQuestion(initial, recentIds));
  };

  const submitAnswer = () => {
    if (!question || selectedIndex === null || feedback) return;
    const selected = choiceOrder[selectedIndex];
    const posterior = updatePosterior(quizState, question, selected.correct);
    const elapsedSeconds = Math.max(1, Math.round((window.performance.now() - questionStartedAtRef.current) / 1000));
    const nextState: QuizState = {
      posterior,
      answers: [
        ...quizState.answers,
        {
          questionId: question.id,
          correct: selected.correct,
          selected: selected.text,
          correctAnswer: question.choices[question.correctIndex],
          rationale: question.rationale,
          topic: question.topic,
          format: question.format,
          level: question.level,
          elapsedSeconds,
        },
      ],
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
      persistRecentItems();
      setReportGeneratedAt(new Date());
      setPhase("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    presentQuestion(chooseNextQuestion(quizState, recentQuestionIdsRef.current));
  };

  const downloadDiagnostic = () => {
    if (!result || !reportGeneratedAt) return;
    const reviewItems = quizState.answers.filter((answer) => !answer.correct);
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
      "",
      "能力地圖",
      ...diagnostics.map((item) => `${item.label}：${item.status}｜${item.evidence}｜${item.accuracy === null ? "未取樣" : `${item.correctCount}/${item.sampleCount}（${item.accuracy}%）`}`),
      "",
      "建議學習路線",
      ...prioritizedDiagnostics.map((item, index) => `${index + 1}. ${item.label}：${item.recommendation}`),
      `階段建議：${stageAdvice(result.levelIndex)}`,
      "",
      "錯題回顧",
      ...(reviewItems.length
        ? reviewItems.map((answer, index) => `${index + 1}. [${TOPIC_LABELS[answer.topic]}／${LEVELS[answer.level - 1].short}] ${BANK.find((item) => item.id === answer.questionId)?.prompt}\n   我的答案：${answer.selected}\n   參考答案：${answer.correctAnswer}\n   關鍵觀念：${answer.rationale}`)
        : ["本次沒有錯題；建議以變化題再次確認概念是否穩定。"]),
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
  const reviewAnswers = result
    ? quizState.answers
        .filter((answer) => !answer.correct)
        .sort((left, right) => Math.abs(left.level - result.ability) - Math.abs(right.level - result.ability))
        .slice(0, 4)
    : [];

  return (
    <main className="site-frame">
      <header className="topbar screen-only">
        <a className="brand" href="#top" aria-label="數學等級評比器首頁">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>MATH//SCAN</span>
        </a>
        <div className="system-status"><span aria-hidden="true" /> ADAPTIVE SYSTEM ONLINE</div>
      </header>

      <div className="mobile-level-strip screen-only" aria-hidden="true">
        <span>小四</span><b>···</b><span>{activeLevel ? LEVELS[activeLevel - 1].short : result ? LEVELS[result.levelIndex].short : "探索中"}</span><b>···</b><span>碩士</span>
      </div>

      <div className="workspace" id="top">
        <LevelLadder activeLevel={activeLevel} resultLevel={result ? result.levelIndex + 1 : undefined} />

        <section className="main-stage">
          {phase === "intro" && (
            <div className="intro-screen">
              <div className="eyebrow"><span>DIAGNOSTIC v2.0</span><span>{BANK.length}-ITEM BANK</span></div>
              <div className="hero-grid">
                <div>
                  <p className="hero-code">{"// FIND YOUR CURRENT MATH ZONE"}</p>
                  <h1>數學等級<br /><strong>評比器</strong></h1>
                  <p className="hero-copy">從小學四年級到碩士核心，以多元題型、自適應難度與跨領域取樣，產生可下載的個人能力診斷。</p>
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
                <div><strong>14–16</strong><span>自適應題數</span></div>
                <div><strong>5 種</strong><span>題型輪替</span></div>
                <div><strong>60 題</strong><span>多元題庫</span></div>
              </div>

              <div className="briefing pixel-panel">
                <div>
                  <div className="panel-kicker">MISSION BRIEF</div>
                  <h2>這趟遠征怎麼進行？</h2>
                </div>
                <ul>
                  <li><span>01</span> 計算、應用、資料、推理與概念題交錯出現</li>
                  <li><span>02</span> 難度依作答表現調整，並避免連續相同領域</li>
                  <li><span>03</span> 完成後可列印、存成 PDF 或下載文字診斷</li>
                </ul>
                <button className="pixel-button primary" onClick={startQuiz}>
                  開始能力掃描 <span aria-hidden="true">▶</span>
                </button>
              </div>
              <p className="micro-note">所有計算皆在你的裝置上完成；結果不等同正式學力鑑定。</p>
            </div>
          )}

          {phase === "quiz" && question && (
            <div className="quiz-screen">
              <div className="quiz-hud">
                <div>
                  <span className="hud-label">QUESTION</span>
                  <strong>{String(currentStep).padStart(2, "0")}<small>/{MAX_QUESTIONS} MAX</small></strong>
                </div>
                <div className="hud-chip"><span>ZONE</span>{LEVELS[question.level - 1].short}</div>
                <div className="hud-chip"><span>DOMAIN</span>{TOPIC_LABELS[question.topic]}</div>
                <div className="hud-chip"><span>FORMAT</span>{FORMAT_LABELS[question.format]}</div>
              </div>

              <div className="segment-progress" role="progressbar" aria-label="測驗進度" aria-valuemin={0} aria-valuemax={MAX_QUESTIONS} aria-valuenow={quizState.answers.length}>
                {Array.from({ length: MAX_QUESTIONS }, (_, index) => <i key={index} className={index < quizState.answers.length ? "done" : index === quizState.answers.length ? "current" : ""} />)}
              </div>

              <div className="question-card pixel-panel">
                <div className="question-meta"><span>關卡 {String(currentStep).padStart(2, "0")}</span><span>選出唯一正確答案</span></div>
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
                  <span className="adaptive-note"><i aria-hidden="true" /> DIVERSITY + BAYES CALIBRATION</span>
                  {!feedback ? (
                    <button className="pixel-button primary" disabled={selectedIndex === null} onClick={submitAnswer}>確認答案 <span aria-hidden="true">↵</span></button>
                  ) : (
                    <button className="pixel-button primary" onClick={continueQuiz}>{shouldStop(quizState) ? "產生診斷單" : "進入下一關"} <span aria-hidden="true">▶</span></button>
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
                  <div><span>MATH//SCAN · REPORT v2.0</span><h2>數學能力診斷單</h2></div>
                  <strong>{reportId}</strong>
                </div>
                <div className="report-identity">
                  <label className="screen-only">姓名／代號<input value={learnerName} maxLength={30} onChange={(event) => setLearnerName(event.target.value)} placeholder="可選填，列印時會顯示" /></label>
                  <div className="print-only"><span>姓名／代號</span><strong>{learnerName.trim() || "＿＿＿＿＿＿＿＿"}</strong></div>
                  <div><span>產生日期</span><strong>{reportGeneratedAt.toLocaleDateString("zh-TW")}</strong></div>
                  <div><span>作答計時</span><strong>{formatDuration(totalAnswerSeconds)}</strong></div>
                  <div><span>題型覆蓋</span><strong>{coveredFormatCount} / 5 種</strong></div>
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
                  <div><span>作答證據</span><strong>{result.correctCount} / {quizState.answers.length} 命中</strong></div>
                  <div><span>結果穩定度</span><strong>{result.confidence}</strong></div>
                  <div><span>能力值</span><strong>{result.ability.toFixed(1)} / 12</strong></div>
                </div>
                <p className="evidence-note">目前證據集中於 {LEVELS[levelIndexFromTheta(result.low)].short} 到 {LEVELS[levelIndexFromTheta(result.high)].short}。這是本次題型下的估計區間，不代表能力上限。</p>
              </section>

              <section className="skill-card pixel-panel">
                <div className="section-heading"><div><div className="panel-kicker">SKILL EVIDENCE</div><h2>能力地圖</h2></div><span>同時顯示樣本數，避免單題過度解讀</span></div>
                <div className="skill-list">
                  {diagnostics.map((item) => (
                    <div className={`skill-row ${diagnosticClass(item.status)}`} key={item.label}>
                      <div className="skill-name"><span>{item.label}</span><small>{item.status}</small></div>
                      <div className="skill-track" style={{ "--skill": `${item.accuracy ?? 0}%` } as CSSProperties}><i /></div>
                      <div className="skill-value"><strong>{item.accuracy === null ? "—" : `${item.accuracy}%`}</strong><small>{item.sampleCount ? `${item.correctCount}/${item.sampleCount} · ${item.evidence}` : "未取樣"}</small></div>
                    </div>
                  ))}
                </div>
              </section>

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

              {reviewAnswers.length > 0 && (
                <section className="review-card pixel-panel detail-page">
                  <div className="section-heading"><div><div className="panel-kicker">ANSWER AUDIT</div><h2>重點錯題診斷</h2></div><span>依接近目前能力值排序</span></div>
                  <div className="review-list">
                    {reviewAnswers.map((answer) => {
                      const item = BANK.find((candidate) => candidate.id === answer.questionId)!;
                      return (
                        <article key={answer.questionId}>
                          <span>{TOPIC_LABELS[item.topic]} · {LEVELS[item.level - 1].short} · {FORMAT_LABELS[item.format]}</span>
                          <h3>{item.prompt}</h3>
                          <dl><div><dt>你的答案</dt><dd>{answer.selected}</dd></div><div><dt>參考答案</dt><dd>{answer.correctAnswer}</dd></div><div><dt>作答時間</dt><dd>{answer.elapsedSeconds} 秒</dd></div></dl>
                          <p><strong>關鍵觀念：</strong>{answer.rationale}</p>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="action-plan print-only">
                <h2>個人行動計畫</h2>
                <p>本週優先補強：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</p>
                <p>預計完成：＿＿題／＿＿分鐘　完成日期：＿＿年＿＿月＿＿日</p>
                <p>我會如何確認理解：□ 口頭說明　□ 完整列式　□ 變化題　□ 限時練習</p>
              </section>

              <div className="result-actions screen-only">
                <button className="pixel-button primary" onClick={() => window.print()}>列印／另存 PDF <span aria-hidden="true">▣</span></button>
                <button className="pixel-button ghost" onClick={downloadDiagnostic}>下載文字診斷 <span aria-hidden="true">↓</span></button>
                <button className="pixel-button ghost" onClick={startQuiz}>重新掃描 <span aria-hidden="true">↻</span></button>
              </div>

              <section className="method-note" id="method">
                <strong>評量與隱私說明</strong>
                <p>本工具依本次題目、難度路徑、正確率與作答時間進行 Bayesian 能力估算，僅供自我了解、教學討論與學習規劃。結果不等同學校年級、正式成績、入學資格、智力測驗或學位認證；未出現的能力不代表不具備，單次答錯也不足以判定概念未掌握。</p>
                <p>作答與姓名只在你的瀏覽器中處理，不會傳送到 GPT 或外部評分服務。</p>
              </section>
            </div>
          )}
        </section>
      </div>

      <footer className="screen-only"><span>© 2026 MATH//SCAN</span><span>用好奇心校準，不用分數定義自己。</span></footer>
    </main>
  );
}
