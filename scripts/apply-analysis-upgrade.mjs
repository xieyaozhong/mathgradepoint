import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const pagePath = resolve(projectRoot, "app/page.tsx");
const dataPath = resolve(projectRoot, "app/math-data.ts");
const cssPath = resolve(projectRoot, "app/globals.css");

const skillGroups = `export const SKILL_GROUPS: SkillGroup[] = [
  { label: "數感與運算", topics: ["arithmetic"], recommendation: "依序檢查數感、四則運算、分數小數、比例百分率與單位轉換；先估算範圍，再用逆運算確認。" },
  { label: "幾何與空間", topics: ["geometry"], recommendation: "先畫圖並完整標記已知條件，再辨認周長、面積、相似、圓與座標幾何所需性質。" },
  { label: "代數推理", topics: ["algebra"], recommendation: "把文字條件翻成等式、不等式或因式結構；逐行保留等價變形，最後代回檢查。" },
  { label: "函數與規律", topics: ["functions"], recommendation: "在表格、圖形、公式與數列之間切換，特別留意定義域、變化率、平移與極限行為。" },
  { label: "三角關係", topics: ["trigonometry"], recommendation: "先確認象限、角度與邊的對應，再使用基本恆等式、特殊角或角度和差公式。" },
  { label: "資料與機率", topics: ["data-probability"], recommendation: "區分資料中心、離散程度、條件機率與隨機變數；先寫清楚樣本空間與事件。" },
  { label: "微積分與變化", topics: ["calculus"], recommendation: "把極限、導數、積分與微分方程連回變化率、累積量與局部近似，再完成符號推導。" },
  { label: "線性代數", topics: ["linear-algebra"], recommendation: "從向量空間、線性映射、矩陣、秩與特徵結構逐層整理，並檢查維度與基底條件。" },
  { label: "分析與證明", topics: ["analysis"], recommendation: "每一步標明定義、量詞、定理條件與結論；特別檢查完備、緊緻、收斂型態與交換極限的前提。" },
];`;

const calibrationStatusStyles = `

.system-status.is-calibrating {
  color: var(--danger);
}

.system-status.is-calibrating > span {
  background: var(--danger);
  box-shadow: 0 0 0 3px rgb(255 107 122 / 0.18), 0 0 16px var(--danger);
  animation-duration: 0.85s;
}
`;

async function patchMathData() {
  let source = await readFile(dataPath, "utf8");
  if (!source.includes('import { EXTRA_BANK } from "./extra-questions";')) {
    source = `import { EXTRA_BANK } from "./extra-questions";\n\n${source}`;
  }
  source = source.replace(
    /export const SKILL_GROUPS: SkillGroup\[\] = \[[\s\S]*?\n\];/,
    skillGroups,
  );
  source = source.replace(
    /^export const BANK: Question\[\] = \[$/m,
    "const CORE_BANK: Question[] = [",
  );
  if (!source.includes("export const BANK: Question[] = [...CORE_BANK, ...EXTRA_BANK];")) {
    source = source.replace(
      /\n\];\s*$/,
      "\n];\n\nexport const BANK: Question[] = [...CORE_BANK, ...EXTRA_BANK];\n",
    );
  }
  await writeFile(dataPath, source);
}

async function patchPage() {
  let source = await readFile(pagePath, "utf8");
  if (!source.includes('from "./deep-analysis-panel"')) {
    source = source.replace(
      '} from "./math-data";\n',
      '} from "./math-data";\nimport DeepAnalysisPanel, { makeDeepAnalysis } from "./deep-analysis-panel";\n',
    );
  }

  source = source
    .replace(
      /const (?:MIN|BASE)_QUESTIONS = \d+;\nconst MAX_QUESTIONS = \d+;/,
      "const BASE_QUESTIONS = 10;\nconst MAX_QUESTIONS = 14;",
    )
    .replace(
      /const RECENT_ITEMS_KEY = "math-scan-recent-items-v\d+";/,
      'const RECENT_ITEMS_KEY = "math-scan-recent-items-v4";',
    )
    .replace(/DIAGNOSTIC v\d+\.\d+/, "DIAGNOSTIC v4.0")
    .replace(/MATH\/\/SCAN · REPORT v\d+\.\d+/, "MATH//SCAN · REPORT v4.0")
    .replace(
      /<div><strong>(?:14–16|\{MIN_QUESTIONS\}–\{MAX_QUESTIONS\}|\{BASE_QUESTIONS\}–\{MAX_QUESTIONS\})<\/strong><span>自適應題數<\/span><\/div>/,
      "<div><strong>{BASE_QUESTIONS} 題</strong><span>標準掃描</span></div>",
    )
    .replace(
      "<div><strong>5 種</strong><span>題型輪替</span></div>",
      "<div><strong>最多 {MAX_QUESTIONS}</strong><span>特殊校正</span></div>",
    )
    .replace(
      "<div><strong>60 題</strong><span>多元題庫</span></div>",
      "<div><strong>{BANK.length} 題</strong><span>多元題庫</span></div>",
    )
    .replace(
      "從小學四年級到碩士核心，以多元題型、自適應難度與跨領域取樣，產生可下載的個人能力診斷。",
      "從小學四年級到碩士核心，通常以 10 題完成能力定位；只有證據矛盾或區間過寬時，才追加校正題。",
    )
    .replace(
      "<li><span>02</span> 難度依作答表現調整，並避免連續相同領域</li>",
      "<li><span>02</span> 先完成 10 題；特殊訊號出現時才追加最多 4 題校正</li>",
    );

  if (!source.includes("function calibrationFocus(")) {
    source = source.replace(
      "function chooseNextQuestion(state: QuizState, recentIds: string[]) {",
      `function calibrationFocus(state: QuizState) {
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

function chooseNextQuestion(state: QuizState, recentIds: string[]) {`,
    );
  }

  if (!source.includes("const calibrating = state.answers.length >= BASE_QUESTIONS;")) {
    source = source.replace(
      `  const mean = posteriorMean(state);
  const unused = BANK.filter((item) => !state.askedIds.includes(item.id));
  const nearby = unused.filter((item) => Math.abs(item.b - mean) <= 3);
  const candidates = nearby.length >= 5 ? nearby : unused;`,
      `  const mean = posteriorMean(state);
  const calibrating = state.answers.length >= BASE_QUESTIONS;
  const calibration = calibrationFocus(state);
  const unused = BANK.filter((item) => !state.askedIds.includes(item.id));
  const nearby = unused.filter((item) => Math.abs(item.b - mean) <= 3);
  const calibrationNearby = unused.filter((item) => Math.abs(item.b - mean) <= 1.5);
  const candidates =
    calibrating && calibrationNearby.length >= 4
      ? calibrationNearby
      : nearby.length >= 5
        ? nearby
        : unused;`,
    );
    source = source.replace(
      "    const distancePenalty = 0.008 * Math.abs(item.b - mean);",
      `    const calibrationTopicBonus =
      calibrating && calibration.topics.has(item.topic) ? 0.16 : 0;
    const calibrationFormatBonus =
      calibrating && calibration.formats.has(item.format) ? 0.1 : 0;
    const distancePenalty =
      (calibrating ? 0.035 : 0.008) * Math.abs(item.b - mean);`,
    );
    source = source.replace(
      `        unseenFormatBonus +
        jitter -`,
      `        unseenFormatBonus +
        calibrationTopicBonus +
        calibrationFormatBonus +
        jitter -`,
    );
  }

  if (!source.includes("function calibrationReasons(")) {
    source = source.replace(
      /function shouldStop\(state: QuizState\) \{[\s\S]*?\n\}/,
      `function calibrationReasons(state: QuizState) {
  if (state.answers.length < BASE_QUESTIONS) return [] as string[];

  const reasons: string[] = [];
  const intervalWidth = quantile(state, 0.9) - quantile(state, 0.1);
  if (intervalWidth > 3.4) reasons.push("能力區間仍寬");

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
}`,
    );
  }

  if (!source.includes("const calibrationCount = Math.max(0, quizState.answers.length - BASE_QUESTIONS);")) {
    source = source.replace(
      "    const reviewItems = quizState.answers.filter((answer) => !answer.correct);",
      `    const reviewItems = quizState.answers.filter((answer) => !answer.correct);
    const calibrationCount = Math.max(0, quizState.answers.length - BASE_QUESTIONS);
    const finalCalibrationReasons = calibrationReasons(quizState);`,
    );
  }

  if (!source.includes("const deepAnalysis = makeDeepAnalysis(quizState.answers, result.ability);")) {
    source = source.replace(
      "    const finalCalibrationReasons = calibrationReasons(quizState);",
      "    const finalCalibrationReasons = calibrationReasons(quizState);\n    const deepAnalysis = makeDeepAnalysis(quizState.answers, result.ability);",
    );
  }

  if (!source.includes("評量結構：${BASE_QUESTIONS} 題標準掃描")) {
    source = source.replace(
      '      `作答計時：${formatDuration(totalAnswerSeconds)}`,',
      '      `作答計時：${formatDuration(totalAnswerSeconds)}`,\n      `評量結構：${BASE_QUESTIONS} 題標準掃描 + ${calibrationCount} 題校正`,\n      `校正狀態：${calibrationCount ? (finalCalibrationReasons.length ? `達上限後仍有：${finalCalibrationReasons.join("、")}` : "校正後證據已收斂") : "第 10 題後證據一致，未追加題目"}`,',
    );
  }

  if (!source.includes('"深度表現分析",')) {
    source = source.replace(
      '      "推薦學習武器",',
      '      "深度表現分析",\n      `整體命中率：${deepAnalysis.overallAccuracy}%`,\n      `平均節奏：${deepAnalysis.paceRatio === null ? "未取得" : `${Math.round(deepAnalysis.paceRatio * 100)}% 目標時間`}`,\n      `前後段趨勢：${deepAnalysis.trend}`,\n      `最長連續命中：${deepAnalysis.longestStreak} 題`,\n      `超預期命中：${deepAnalysis.hardWins} 題｜高預期失誤：${deepAnalysis.unexpectedMisses} 題`,\n      ...deepAnalysis.formatMetrics.map((item) => `${item.label}：${item.accuracy === null ? "未取樣" : `${item.correctCount}/${item.sampleCount}（${item.accuracy}%）`}`),\n      "",\n      "推薦學習武器",',
    );
  }

  if (!source.includes("<DeepAnalysisPanel answers={quizState.answers} ability={result.ability} />")) {
    source = source.replace(
      '              <section className="learning-card pixel-panel">',
      '              <DeepAnalysisPanel answers={quizState.answers} ability={result.ability} />\n\n              <section className="learning-card pixel-panel">',
    );
  }

  if (!source.includes("校正題：確認能力區間")) {
    source = source.replace(
      '<div className="question-meta"><span>關卡 {String(currentStep).padStart(2, "0")}</span><span>選出唯一正確答案</span></div>',
      '<div className="question-meta"><span>關卡 {String(currentStep).padStart(2, "0")}</span><span>{quizState.answers.length >= BASE_QUESTIONS ? "校正題：確認能力區間" : "選出唯一正確答案"}</span></div>',
    );
  }

  if (!source.includes("CALIBRATION MODE")) {
    source = source.replace(
      '<span className="adaptive-note"><i aria-hidden="true" /> DIVERSITY + BAYES CALIBRATION</span>',
      '<span className="adaptive-note"><i aria-hidden="true" /> {quizState.answers.length >= BASE_QUESTIONS ? "CALIBRATION MODE" : "DIVERSITY + BAYES CALIBRATION"}</span>',
    );
  }

  if (!source.includes('"進入校正題"')) {
    source = source.replace(
      '{shouldStop(quizState) ? "產生診斷單" : "進入下一關"}',
      '{shouldStop(quizState) ? "產生診斷單" : quizState.answers.length >= BASE_QUESTIONS ? "進入校正題" : "進入下一關"}',
    );
  }

  if (!source.includes("const isCalibrationQuestion = phase === \"quiz\" && currentStep > BASE_QUESTIONS;")) {
    source = source.replace(
      "  const currentStep = Math.min(quizState.answers.length + (feedback ? 0 : 1), MAX_QUESTIONS);",
      '  const currentStep = Math.min(quizState.answers.length + (feedback ? 0 : 1), MAX_QUESTIONS);\n  const isCalibrationQuestion = phase === "quiz" && currentStep > BASE_QUESTIONS;',
    );
  }

  if (!source.includes("CALIBRATION SIGNAL")) {
    source = source.replace(
      '<div className="system-status"><span aria-hidden="true" /> ADAPTIVE SYSTEM ONLINE</div>',
      '<div className={`system-status ${isCalibrationQuestion ? "is-calibrating" : ""}`} aria-live="polite"><span aria-hidden="true" /> {isCalibrationQuestion ? "CALIBRATION SIGNAL" : "ADAPTIVE SYSTEM ONLINE"}</div>',
    );
  }

  if (!source.includes("評量結構</span>")) {
    source = source.replace(
      '<div><span>題型覆蓋</span><strong>{coveredFormatCount} / 5 種</strong></div>',
      '<div><span>題型覆蓋</span><strong>{coveredFormatCount} / 5 種</strong></div>\n                  <div><span>評量結構</span><strong>{BASE_QUESTIONS} + {Math.max(0, quizState.answers.length - BASE_QUESTIONS)} 題校正</strong></div>',
    );
  }

  source = source.replace(
    "本工具依本次題目、難度路徑、正確率與作答時間進行 Bayesian 能力估算",
    "本工具依本次題目、難度路徑、正確率、題型剖面、作答時間與前後段穩定性進行 Bayesian 能力估算",
  );

  await writeFile(pagePath, source);
}

async function patchStyles() {
  let source = await readFile(cssPath, "utf8");
  if (!source.includes(".system-status.is-calibrating > span")) {
    source += calibrationStatusStyles;
  }
  await writeFile(cssPath, source);
}

await patchMathData();
await patchPage();
await patchStyles();
