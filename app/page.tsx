"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type Phase = "intro" | "quiz" | "result";
type Topic =
  | "arithmetic"
  | "geometry"
  | "algebra"
  | "functions"
  | "trigonometry"
  | "calculus"
  | "linear-algebra"
  | "analysis";

type Question = {
  id: string;
  level: number;
  topic: Topic;
  prompt: string;
  choices: readonly string[];
  correctIndex: number;
  rationale: string;
  b: number;
  a: number;
};

type AnswerRecord = {
  questionId: string;
  correct: boolean;
  selected: string;
  topic: Topic;
  level: number;
};

type QuizState = {
  posterior: number[];
  answers: AnswerRecord[];
  askedIds: string[];
  topicCounts: Partial<Record<Topic, number>>;
};

const LEVELS = [
  { short: "小四", full: "小學四年級", rank: "基礎探路者", blurb: "重要的數感與基礎運算已經成形。下一步可加強分數、多步驟問題與圖形判讀。" },
  { short: "小五", full: "小學五年級", rank: "運算行者", blurb: "你能處理分數、小數與面積問題。持續練習估算與拆解題意，會讓判斷更快、更穩。" },
  { short: "小六", full: "小學六年級", rank: "比例偵察員", blurb: "你對比例、百分率與生活數學已有掌握。接著熟悉未知數，就能穩定踏入代數世界。" },
  { short: "國一", full: "國中一年級", rank: "代數新星", blurb: "你已能用符號描述數量與規律。強化正負數、方程式與座標，解題視野會明顯擴張。" },
  { short: "國二", full: "國中二年級", rank: "方程解碼者", blurb: "你能運用方程式、比例與幾何性質。下一步是把複雜條件更精準地翻譯成式子。" },
  { short: "國三", full: "國中三年級", rank: "函數追跡者", blurb: "你開始能從圖形與公式辨認變化關係。強化跨章節整合，就能向高中數學推進。" },
  { short: "高一", full: "高中一年級", rank: "模型築構者", blurb: "你能用函數與代數工具建立模型。深化圖形、數列與邏輯表達，方法會更精準。" },
  { short: "高二", full: "高中二年級", rank: "函數航行者", blurb: "你能在函數、三角與空間關係間切換。持續鍛鍊多步推導，複雜題目會更可控。" },
  { short: "高三", full: "高中三年級", rank: "微積分先鋒", blurb: "你已能用進階代數與微積分初步概念分析變化。下一步是理解方法為何成立。" },
  { short: "大學基礎", full: "大學基礎", rank: "理論鍛造者", blurb: "你具備大學常見的抽象思考與數學工具，能處理微積分與線性代數的核心概念。" },
  { short: "大學進階", full: "大學進階", rank: "結構解析者", blurb: "你已能處理收斂、特徵結構等進階概念。加強嚴謹證明與跨領域建模會更加完整。" },
  { short: "碩士核心", full: "碩士核心", rank: "抽象領航者", blurb: "你能辨認高階結構、定理條件與嚴謹推導。真正的進階，也在於說清楚為什麼成立。" },
] as const;

const TOPIC_LABELS: Record<Topic, string> = {
  arithmetic: "數感運算",
  geometry: "幾何空間",
  algebra: "代數推理",
  functions: "函數規律",
  trigonometry: "三角關係",
  calculus: "微積分",
  "linear-algebra": "線性代數",
  analysis: "分析與證明",
};

const q = (
  id: string,
  level: number,
  topic: Topic,
  prompt: string,
  choices: readonly string[],
  correctIndex: number,
  rationale: string,
  a = 1.28,
): Question => ({ id, level, topic, prompt, choices, correctIndex, rationale, b: level, a });

const BANK: Question[] = [
  q("g4-1", 1, "arithmetic", "28 的 3/4 是多少？", ["18", "21", "24", "25"], 1, "28 ÷ 4 × 3 = 21。"),
  q("g4-2", 1, "arithmetic", "2 小時 35 分鐘再加 50 分鐘，共多久？", ["2 小時 45 分", "3 小時 15 分", "3 小時 25 分", "3 小時 35 分"], 2, "35 + 50 = 85 分，也就是 1 小時 25 分；合計 3 小時 25 分。"),
  q("g5-1", 2, "arithmetic", "2.4 × 0.35 等於多少？", ["0.084", "0.84", "8.4", "84"], 1, "24 × 35 = 840，再放回三位小數，得到 0.840。"),
  q("g5-2", 2, "geometry", "一個長方形面積是 96 平方公分，寬是 8 公分。它的周長是多少？", ["32 公分", "40 公分", "48 公分", "96 公分"], 1, "長為 96 ÷ 8 = 12；周長為 2 × (12 + 8) = 40。"),
  q("g6-1", 3, "arithmetic", "紅球與藍球的數量比是 3:5，共有 32 顆。紅球有幾顆？", ["12", "15", "20", "24"], 0, "共有 8 份，每份 4 顆；紅球為 3 × 4 = 12 顆。"),
  q("g6-2", 3, "arithmetic", "一件商品從 250 元降到 200 元，降價百分比是多少？", ["10%", "20%", "25%", "50%"], 1, "降價 50 元，50 ÷ 250 = 20%。"),
  q("j7-1", 4, "algebra", "若 3(2x − 1) = 15，則 x =？", ["2", "3", "4", "6"], 1, "6x − 3 = 15，所以 6x = 18，x = 3。"),
  q("j7-2", 4, "arithmetic", "算式 (−2)³ + 5 × 2 的值是多少？", ["−18", "−2", "2", "18"], 2, "(−2)³ = −8，−8 + 10 = 2。"),
  q("j8-1", 5, "functions", "通過點 (2, 5) 與 (−1, −1) 的直線斜率是多少？", ["−2", "−1/2", "1/2", "2"], 3, "斜率為 [5 − (−1)] ÷ [2 − (−1)] = 6 ÷ 3 = 2。"),
  q("j8-2", 5, "algebra", "化簡 √50 − √8。", ["√2", "2√2", "3√2", "7√2"], 2, "√50 = 5√2，√8 = 2√2，相減得到 3√2。"),
  q("j9-1", 6, "algebra", "方程式 x² − 5x + 6 = 0 的兩個實根是？", ["−3、−2", "2、3", "−2、−3", "1、6"], 1, "(x − 2)(x − 3) = 0，所以兩根為 2、3。"),
  q("j9-2", 6, "geometry", "一直角三角形的兩股長分別是 6 與 8，斜邊長是多少？", ["7", "10", "12", "14"], 1, "由畢氏定理，斜邊為 √(6² + 8²) = √100 = 10。"),
  q("s10-1", 7, "functions", "函數 f(x) = 2x² − 8x + 3 的最小值是多少？", ["−8", "−5", "3", "5"], 1, "頂點在 x = 2，f(2) = 8 − 16 + 3 = −5。"),
  q("s10-2", 7, "algebra", "等比數列首項為 3、公比為 2，第 6 項是多少？", ["48", "64", "96", "192"], 2, "a₆ = 3 × 2⁵ = 96。"),
  q("s11-1", 8, "trigonometry", "若 θ 在第二象限且 sin θ = 3/5，則 cos θ =？", ["4/5", "−4/5", "3/5", "−3/5"], 1, "由 sin²θ + cos²θ = 1 得 |cos θ| = 4/5；第二象限的餘弦為負。"),
  q("s11-2", 8, "functions", "解方程式 log₂(x − 1) + log₂(x + 1) = 3。", ["−3", "−1", "1", "3"], 3, "定義域要求 x > 1；(x−1)(x+1)=8，得到 x²=9，唯一合格解是 3。"),
  q("s12-1", 9, "calculus", "若 f(x) = x³ − 3x² + 2，則 f′(3) =？", ["0", "3", "9", "18"], 2, "f′(x)=3x²−6x，代入 3 得 27−18=9。"),
  q("s12-2", 9, "calculus", "定積分 ∫₀² (3x² + 1) dx 的值是多少？", ["8", "9", "10", "12"], 2, "原函數為 x³+x；代入上下限得到 8+2=10。"),
  q("u1-1", 10, "linear-algebra", "矩陣 [[2, 1], [3, 4]] 的行列式是多少？", ["5", "8", "11", "−5"], 0, "行列式為 2×4 − 1×3 = 5。"),
  q("u1-2", 10, "calculus", "極限 lim(x→0) (1 − cos x) / x² 等於多少？", ["0", "1/2", "1", "不存在"], 1, "由 1−cos x = 2sin²(x/2)，極限為 1/2。"),
  q("u2-1", 11, "analysis", "無窮級數 Σ(n=1→∞) 1/[n(n+1)] 的和是多少？", ["1/2", "1", "π²/6", "發散"], 1, "1/[n(n+1)] = 1/n − 1/(n+1)，部分和望遠鏡消去後趨近 1。"),
  q("u2-2", 11, "linear-algebra", "實對稱矩陣 [[2, 1], [1, 2]] 的最大特徵值是多少？", ["1", "2", "3", "4"], 2, "特徵多項式是 (2−λ)²−1，特徵值為 1、3。"),
  q("m-1", 12, "analysis", "在完備度量空間中，若 T 滿足 d(Tx, Ty) ≤ q·d(x, y)，其中 0 < q < 1，則必然成立的是？", ["T 有唯一不動點，且任意起點的反覆迭代都收斂到它", "T 至少有一個不動點，但可能不唯一", "只有空間有限時才有不動點", "T 不可能有不動點"], 0, "這是 Banach 不動點定理：壓縮映射有唯一不動點，Picard 迭代會收斂到它。", 1.35),
  q("m-2", 12, "analysis", "設 fₙ 幾乎處處收斂到 f，且對所有 n 有 |fₙ| ≤ g，其中 g 可積。下列何者必然成立？", ["fₙ 一致收斂到 f", "fₙ 在每一點都收斂到 f", "∫|fₙ − f| → 0", "sup |fₙ − f| → 0"], 2, "由支配收斂定理，且 |fₙ−f|≤2g，可得 L¹ 收斂。", 1.35),
];

const THETA_GRID = Array.from({ length: 111 }, (_, index) => 1 + index / 10);

function createInitialState(): QuizState {
  return {
    posterior: THETA_GRID.map(() => 1 / THETA_GRID.length),
    answers: [],
    askedIds: [],
    topicCounts: {},
  };
}

function normalize(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
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

function chooseNextQuestion(state: QuizState) {
  const mean = posteriorMean(state);
  const unused = BANK.filter((item) => !state.askedIds.includes(item.id));
  const nearby = unused.filter((item) => Math.abs(item.b - mean) <= 3);
  const candidates = nearby.length ? nearby : unused;
  return candidates.reduce((best, item) => {
    const itemScore = expectedEntropy(state, item) + 0.05 * (state.topicCounts[item.topic] ?? 0);
    const bestScore = expectedEntropy(state, best) + 0.05 * (state.topicCounts[best.topic] ?? 0);
    return itemScore < bestScore ? item : best;
  });
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
  if (state.answers.length < 10) return false;
  if (state.answers.length >= 12) return true;
  return quantile(state, 0.9) - quantile(state, 0.1) <= 3;
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
    confidence: width <= 1.8 ? "高" : width <= 3 ? "中" : "探索中",
    score: Math.round(((ability - 1) / 11) * 100),
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

const SKILL_GROUPS: { label: string; topics: Topic[] }[] = [
  { label: "數感與運算", topics: ["arithmetic"] },
  { label: "代數與函數", topics: ["algebra", "functions"] },
  { label: "幾何與三角", topics: ["geometry", "trigonometry"] },
  { label: "微積分", topics: ["calculus"] },
  { label: "抽象與證明", topics: ["linear-algebra", "analysis"] },
];

export default function Home() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [quizState, setQuizState] = useState<QuizState>(() => createInitialState());
  const [question, setQuestion] = useState<Question | null>(null);
  const [choiceOrder, setChoiceOrder] = useState<{ text: string; correct: boolean }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);

  const result = useMemo(() => (phase === "result" ? makeResult(quizState) : null), [phase, quizState]);

  const presentQuestion = (item: Question) => {
    setQuestion(item);
    setChoiceOrder(shuffleChoices(item));
    setSelectedIndex(null);
    setFeedback(null);
  };

  const startQuiz = () => {
    const initial = createInitialState();
    setQuizState(initial);
    setPhase("quiz");
    presentQuestion(chooseNextQuestion(initial));
  };

  const submitAnswer = () => {
    if (!question || selectedIndex === null || feedback) return;
    const selected = choiceOrder[selectedIndex];
    const posterior = updatePosterior(quizState, question, selected.correct);
    const nextState: QuizState = {
      posterior,
      answers: [...quizState.answers, { questionId: question.id, correct: selected.correct, selected: selected.text, topic: question.topic, level: question.level }],
      askedIds: [...quizState.askedIds, question.id],
      topicCounts: { ...quizState.topicCounts, [question.topic]: (quizState.topicCounts[question.topic] ?? 0) + 1 },
    };
    setQuizState(nextState);
    setFeedback(selected.correct ? "correct" : "incorrect");
  };

  const continueQuiz = () => {
    if (!feedback) return;
    if (shouldStop(quizState)) {
      setPhase("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    presentQuestion(chooseNextQuestion(quizState));
  };

  useEffect(() => {
    if (phase === "quiz" && question) questionHeadingRef.current?.focus();
  }, [phase, question]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (phase !== "quiz" || !question) return;
      if ((event.target as HTMLElement).tagName === "BUTTON") return;
      if (!feedback && ["1", "2", "3", "4"].includes(event.key)) {
        setSelectedIndex(Number(event.key) - 1);
      }
      if (event.key === "Enter") {
        if (feedback) continueQuiz();
        else submitAnswer();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const activeLevel = phase === "quiz" ? question?.level : undefined;
  const currentStep = Math.min(quizState.answers.length + (feedback ? 0 : 1), 12);

  return (
    <main className="site-frame">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="數學等級評比器首頁">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>MATH//SCAN</span>
        </a>
        <div className="system-status"><span aria-hidden="true" /> ADAPTIVE SYSTEM ONLINE</div>
      </header>

      <div className="mobile-level-strip" aria-hidden="true">
        <span>小四</span><b>···</b><span>{activeLevel ? LEVELS[activeLevel - 1].short : result ? LEVELS[result.levelIndex].short : "探索中"}</span><b>···</b><span>碩士</span>
      </div>

      <div className="workspace" id="top">
        <LevelLadder activeLevel={activeLevel} resultLevel={result ? result.levelIndex + 1 : undefined} />

        <section className="main-stage">
          {phase === "intro" && (
            <div className="intro-screen">
              <div className="eyebrow"><span>DIAGNOSTIC v1.0</span><span>12-LEVEL ENGINE</span></div>
              <div className="hero-grid">
                <div>
                  <p className="hero-code">{"// FIND YOUR CURRENT MATH ZONE"}</p>
                  <h1>數學等級<br /><strong>評比器</strong></h1>
                  <p className="hero-copy">從小學四年級到碩士核心，透過自適應題目估算你目前最接近的數學能力區間。</p>
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
                <div><strong>10–12</strong><span>自適應題數</span></div>
                <div><strong>約 8 分</strong><span>完成時間</span></div>
                <div><strong>12 級</strong><span>能力區間</span></div>
              </div>

              <div className="briefing pixel-panel">
                <div>
                  <div className="panel-kicker">MISSION BRIEF</div>
                  <h2>這趟遠征怎麼進行？</h2>
                </div>
                <ul>
                  <li><span>01</span> 題目會依作答表現即時升降難度</li>
                  <li><span>02</span> 建議準備紙筆，請不要搜尋答案</li>
                  <li><span>03</span> 不熟悉很正常，系統會自動校準路線</li>
                </ul>
                <button className="pixel-button primary" onClick={startQuiz}>
                  開始能力掃描 <span aria-hidden="true">▶</span>
                </button>
              </div>
              <p className="micro-note">結果用於自我了解與學習規劃，不等同正式學力鑑定。</p>
            </div>
          )}

          {phase === "quiz" && question && (
            <div className="quiz-screen">
              <div className="quiz-hud">
                <div>
                  <span className="hud-label">QUESTION</span>
                  <strong>{String(currentStep).padStart(2, "0")}<small>/12 MAX</small></strong>
                </div>
                <div className="hud-chip"><span>ZONE</span>{LEVELS[question.level - 1].short}</div>
                <div className="hud-chip"><span>DOMAIN</span>{TOPIC_LABELS[question.topic]}</div>
              </div>

              <div className="segment-progress" role="progressbar" aria-label="測驗進度" aria-valuemin={0} aria-valuemax={12} aria-valuenow={quizState.answers.length}>
                {Array.from({ length: 12 }, (_, index) => <i key={index} className={index < quizState.answers.length ? "done" : index === quizState.answers.length ? "current" : ""} />)}
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
                  {feedback === "correct" && <><strong>判定成功</strong><span>這項能力已點亮，系統正在提升探測深度。</span></>}
                  {feedback === "incorrect" && <><strong>路線校準</strong><span>已記錄這次判定，下一關會更貼近你的程度。</span></>}
                  {!feedback && <><strong>操作提示</strong><span>按 1–4 選擇，按 Enter 確認。</span></>}
                </div>

                <div className="quiz-actions">
                  <span className="adaptive-note"><i aria-hidden="true" /> BAYESIAN CALIBRATION ACTIVE</span>
                  {!feedback ? (
                    <button className="pixel-button primary" disabled={selectedIndex === null} onClick={submitAnswer}>確認答案 <span aria-hidden="true">↵</span></button>
                  ) : (
                    <button className="pixel-button primary" onClick={continueQuiz}>{shouldStop(quizState) ? "查看評比結果" : "進入下一關"} <span aria-hidden="true">▶</span></button>
                  )}
                </div>
              </div>
            </div>
          )}

          {phase === "result" && result && (
            <div className="result-screen">
              <div className="result-header">
                <div>
                  <div className="eyebrow"><span>SCAN COMPLETE</span><span>CONFIDENCE: {result.confidence}</span></div>
                  <p className="hero-code">{"// YOUR CURRENT MATH ZONE"}</p>
                  <h1>遠征完成</h1>
                </div>
                <div className="result-score"><strong>{result.score}</strong><span>ABILITY INDEX</span></div>
              </div>

              <section className="rank-card pixel-panel">
                <div className="rank-code">LEVEL {String(result.levelIndex + 1).padStart(2, "0")}</div>
                <div className="rank-main">
                  <div className="rank-emblem" aria-hidden="true"><span>Σ</span></div>
                  <div>
                    <p>你的目前數學等級接近</p>
                    <h2>{LEVELS[result.levelIndex].full}</h2>
                    <strong>{LEVELS[result.levelIndex].rank}</strong>
                  </div>
                </div>
                <p className="rank-blurb">{LEVELS[result.levelIndex].blurb}</p>
                <div className="result-metrics">
                  <div><span>可能區間</span><strong>{LEVELS[levelIndexFromTheta(result.low)].short} — {LEVELS[levelIndexFromTheta(result.high)].short}</strong></div>
                  <div><span>作答紀錄</span><strong>{result.correctCount} / {quizState.answers.length} 命中</strong></div>
                  <div><span>能力值</span><strong>{result.ability.toFixed(1)} / 12</strong></div>
                </div>
              </section>

              <section className="skill-card pixel-panel">
                <div className="section-heading"><div><div className="panel-kicker">SKILL MAP</div><h2>能力取樣</h2></div><span>依本次出題領域</span></div>
                <div className="skill-list">
                  {SKILL_GROUPS.map((group) => {
                    const sampled = quizState.answers.filter((answer) => group.topics.includes(answer.topic));
                    const score = sampled.length ? Math.round((sampled.filter((answer) => answer.correct).length / sampled.length) * 100) : null;
                    return (
                      <div className="skill-row" key={group.label}>
                        <span>{group.label}</span>
                        <div className="skill-track" style={{ "--skill": `${score ?? 0}%` } as CSSProperties}><i /></div>
                        <strong>{score === null ? "未取樣" : `${score}%`}</strong>
                      </div>
                    );
                  })}
                </div>
              </section>

              {quizState.answers.some((answer) => !answer.correct) && (
                <section className="review-card pixel-panel">
                  <div className="section-heading"><div><div className="panel-kicker">NEXT QUEST</div><h2>建議回補關卡</h2></div><span>顯示最多 3 題</span></div>
                  <div className="review-list">
                    {quizState.answers.filter((answer) => !answer.correct).slice(0, 3).map((answer) => {
                      const item = BANK.find((candidate) => candidate.id === answer.questionId)!;
                      return <article key={answer.questionId}><span>{TOPIC_LABELS[item.topic]} · {LEVELS[item.level - 1].short}</span><h3>{item.prompt}</h3><p>{item.rationale}</p></article>;
                    })}
                  </div>
                </section>
              )}

              <div className="result-actions">
                <button className="pixel-button primary" onClick={startQuiz}>重新掃描 <span aria-hidden="true">↻</span></button>
                <a className="pixel-button ghost" href="#method">評量說明 <span aria-hidden="true">↓</span></a>
              </div>

              <section className="method-note" id="method">
                <strong>評量說明</strong>
                <p>本工具以本次作答、題型與難度進行 Bayesian 能力估算，僅供自我了解與學習規劃。結果不等同學校成績、正式檢定、智力測驗、入學資格或學術認證；單次結果也不代表你的能力上限。</p>
              </section>
            </div>
          )}
        </section>
      </div>

      <footer><span>© 2026 MATH//SCAN</span><span>用好奇心校準，不用分數定義自己。</span></footer>
    </main>
  );
}
