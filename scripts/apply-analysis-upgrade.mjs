import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const pagePath = resolve(projectRoot, "app/page.tsx");
const dataPath = resolve(projectRoot, "app/math-data.ts");

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
    .replace("const MIN_QUESTIONS = 14;", "const MIN_QUESTIONS = 16;")
    .replace("const MAX_QUESTIONS = 16;", "const MAX_QUESTIONS = 20;")
    .replace("const RECENT_ITEMS_KEY = \"math-scan-recent-items-v2\";", "const RECENT_ITEMS_KEY = \"math-scan-recent-items-v3\";")
    .replace("DIAGNOSTIC v2.0", "DIAGNOSTIC v3.0")
    .replace("MATH//SCAN · REPORT v2.0", "MATH//SCAN · REPORT v3.0")
    .replace("<div><strong>14–16</strong><span>自適應題數</span></div>", "<div><strong>{MIN_QUESTIONS}–{MAX_QUESTIONS}</strong><span>自適應題數</span></div>")
    .replace("<div><strong>60 題</strong><span>多元題庫</span></div>", "<div><strong>{BANK.length} 題</strong><span>多元題庫</span></div>");

  if (!source.includes("const deepAnalysis = makeDeepAnalysis(quizState.answers, result.ability);")) {
    source = source.replace(
      "    const reviewItems = quizState.answers.filter((answer) => !answer.correct);",
      "    const reviewItems = quizState.answers.filter((answer) => !answer.correct);\n    const deepAnalysis = makeDeepAnalysis(quizState.answers, result.ability);",
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

  source = source.replace(
    "本工具依本次題目、難度路徑、正確率與作答時間進行 Bayesian 能力估算",
    "本工具依本次題目、難度路徑、正確率、題型剖面、作答時間與前後段穩定性進行 Bayesian 能力估算",
  );
  await writeFile(pagePath, source);
}

await patchMathData();
await patchPage();
