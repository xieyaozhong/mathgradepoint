import type { CSSProperties } from "react";
import { FORMAT_LABELS, TOPIC_LABELS, type QuestionFormat, type Topic } from "./math-data";

export type DeepAnalysisAnswer = {
  correct: boolean;
  topic: Topic;
  format: QuestionFormat;
  level: number;
  elapsedSeconds: number;
  expectedCorrectProbability: number;
  targetSeconds: number;
};

type Metric = {
  label: string;
  sampleCount: number;
  correctCount: number;
  accuracy: number | null;
  paceRatio: number | null;
};

const FORMATS = Object.keys(FORMAT_LABELS) as QuestionFormat[];
const TOPICS = Object.keys(TOPIC_LABELS) as Topic[];

function percent(correct: number, total: number) {
  return total ? Math.round((correct / total) * 100) : null;
}

function metricFor(label: string, answers: DeepAnalysisAnswer[]): Metric {
  const correctCount = answers.filter((answer) => answer.correct).length;
  const validTiming = answers.filter(
    (answer) => answer.targetSeconds > 0 && answer.elapsedSeconds <= answer.targetSeconds * 3,
  );
  const paceRatio = validTiming.length
    ? validTiming.reduce(
        (sum, answer) => sum + answer.elapsedSeconds / answer.targetSeconds,
        0,
      ) / validTiming.length
    : null;
  return {
    label,
    sampleCount: answers.length,
    correctCount,
    accuracy: percent(correctCount, answers.length),
    paceRatio,
  };
}

function metricClass(metric: Metric) {
  if (!metric.sampleCount || metric.sampleCount === 1) return "pending";
  if ((metric.accuracy ?? 0) >= 80 && (metric.paceRatio ?? 1) <= 1.25) return "stable";
  if ((metric.accuracy ?? 0) >= 60) return "basic";
  if ((metric.accuracy ?? 0) >= 40) return "developing";
  return "priority";
}

function metricStatus(metric: Metric) {
  if (!metric.sampleCount) return "尚未取樣";
  if (metric.sampleCount === 1) return "待確認";
  if ((metric.accuracy ?? 0) >= 80 && (metric.paceRatio ?? 1) <= 1.25) return "穩定且流暢";
  if ((metric.accuracy ?? 0) >= 80) return "正確但偏慢";
  if ((metric.accuracy ?? 0) >= 60) return "基本掌握";
  if ((metric.accuracy ?? 0) >= 40) return "表現波動";
  return "優先補強";
}

function paceLabel(ratio: number | null) {
  if (ratio === null) return "未取得";
  if (ratio < 0.6) return "偏快作答";
  if (ratio <= 1.15) return "節奏適中";
  if (ratio <= 1.5) return "需要較多思考";
  return "明顯超時";
}

function evidenceLabel(sampleCount: number) {
  if (sampleCount >= 4) return "證據較充足";
  if (sampleCount >= 2) return "初步訊號";
  if (sampleCount === 1) return "單題取樣";
  return "未取樣";
}

function longestCorrectStreak(answers: DeepAnalysisAnswer[]) {
  let current = 0;
  let longest = 0;
  answers.forEach((answer) => {
    current = answer.correct ? current + 1 : 0;
    longest = Math.max(longest, current);
  });
  return longest;
}

export function makeDeepAnalysis(answers: DeepAnalysisAnswer[], ability: number) {
  const formatMetrics = FORMATS.map((format) =>
    metricFor(FORMAT_LABELS[format], answers.filter((answer) => answer.format === format)),
  );
  const topicMetrics = TOPICS.map((topic) =>
    metricFor(TOPIC_LABELS[topic], answers.filter((answer) => answer.topic === topic)),
  ).filter((metric) => metric.sampleCount > 0);

  const validTiming = answers.filter(
    (answer) => answer.targetSeconds > 0 && answer.elapsedSeconds <= answer.targetSeconds * 3,
  );
  const paceRatio = validTiming.length
    ? validTiming.reduce(
        (sum, answer) => sum + answer.elapsedSeconds / answer.targetSeconds,
        0,
      ) / validTiming.length
    : null;
  const overallAccuracy = percent(
    answers.filter((answer) => answer.correct).length,
    answers.length,
  ) ?? 0;

  const split = Math.ceil(answers.length / 2);
  const firstHalf = answers.slice(0, split);
  const secondHalf = answers.slice(split);
  const firstAccuracy = percent(firstHalf.filter((answer) => answer.correct).length, firstHalf.length);
  const secondAccuracy = percent(secondHalf.filter((answer) => answer.correct).length, secondHalf.length);
  const trend =
    firstAccuracy === null || secondAccuracy === null
      ? "樣本不足"
      : secondAccuracy >= firstAccuracy + 15
        ? "後段明顯升溫"
        : secondAccuracy <= firstAccuracy - 15
          ? "後段穩定度下降"
          : "前後段相對穩定";

  const hardWins = answers.filter(
    (answer) => answer.correct && answer.expectedCorrectProbability < 0.55,
  ).length;
  const unexpectedMisses = answers.filter(
    (answer) => !answer.correct && answer.expectedCorrectProbability >= 0.7,
  ).length;
  const calibrationGap = answers.length
    ? Math.round(
        100 *
          (answers.filter((answer) => answer.correct).length / answers.length -
            answers.reduce((sum, answer) => sum + answer.expectedCorrectProbability, 0) /
              answers.length),
      )
    : 0;

  const strongestTopic = [...topicMetrics].sort(
    (left, right) =>
      (right.accuracy ?? -1) - (left.accuracy ?? -1) ||
      right.sampleCount - left.sampleCount,
  )[0] ?? null;
  const priorityTopic = [...topicMetrics]
    .filter((metric) => metric.sampleCount >= 2)
    .sort(
      (left, right) =>
        (left.accuracy ?? 101) - (right.accuracy ?? 101) ||
        (right.paceRatio ?? 0) - (left.paceRatio ?? 0),
    )[0] ?? null;
  const priorityFormat = [...formatMetrics]
    .filter((metric) => metric.sampleCount >= 2)
    .sort(
      (left, right) =>
        (left.accuracy ?? 101) - (right.accuracy ?? 101) ||
        (right.paceRatio ?? 0) - (left.paceRatio ?? 0),
    )[0] ?? null;

  const difficultyBands = [
    {
      label: "基礎確認帶",
      answers: answers.filter((answer) => answer.level < ability - 1),
      note: "低於目前能力估計的題目，觀察基礎是否自動化。",
    },
    {
      label: "核心定位帶",
      answers: answers.filter((answer) => Math.abs(answer.level - ability) <= 1),
      note: "最接近目前能力值的題目，是等級定位的主要證據。",
    },
    {
      label: "延伸挑戰帶",
      answers: answers.filter((answer) => answer.level > ability + 1),
      note: "高於目前能力估計的題目，觀察可延伸的上限。",
    },
  ].map((band) => ({ ...band, metric: metricFor(band.label, band.answers) }));

  return {
    overallAccuracy,
    paceRatio,
    trend,
    firstAccuracy,
    secondAccuracy,
    hardWins,
    unexpectedMisses,
    calibrationGap,
    longestStreak: longestCorrectStreak(answers),
    formatMetrics,
    topicMetrics,
    strongestTopic,
    priorityTopic,
    priorityFormat,
    difficultyBands,
  };
}

export default function DeepAnalysisPanel({
  answers,
  ability,
}: {
  answers: DeepAnalysisAnswer[];
  ability: number;
}) {
  const analysis = makeDeepAnalysis(answers, ability);

  return (
    <section className="skill-card pixel-panel detail-page" aria-label="深度表現分析">
      <div className="section-heading">
        <div><div className="panel-kicker">DEEP PERFORMANCE ANALYSIS</div><h2>深度表現分析</h2></div>
        <span>題型、速度、難度與穩定性</span>
      </div>

      <div className="result-metrics">
        <div><span>整體命中率</span><strong>{analysis.overallAccuracy}%</strong></div>
        <div><span>平均作答節奏</span><strong>{paceLabel(analysis.paceRatio)}</strong></div>
        <div><span>最長連續命中</span><strong>{analysis.longestStreak} 題</strong></div>
        <div><span>前後段趨勢</span><strong>{analysis.trend}</strong></div>
      </div>

      <div className="section-heading">
        <div><div className="panel-kicker">FORMAT PROFILE</div><h2>題型剖面</h2></div>
        <span>答對率搭配相對作答時間</span>
      </div>
      <div className="skill-list">
        {analysis.formatMetrics.map((metric) => (
          <div className={`skill-row ${metricClass(metric)}`} key={metric.label}>
            <div className="skill-name"><span>{metric.label}</span><small>{metricStatus(metric)}</small></div>
            <div className="skill-track" style={{ "--skill": `${metric.accuracy ?? 0}%` } as CSSProperties}><i /></div>
            <div className="skill-value">
              <strong>{metric.accuracy === null ? "—" : `${metric.accuracy}%`}</strong>
              <small>{metric.sampleCount ? `${metric.correctCount}/${metric.sampleCount} · ${paceLabel(metric.paceRatio)}` : "未取樣"}</small>
            </div>
          </div>
        ))}
      </div>

      <div className="section-heading">
        <div><div className="panel-kicker">DIFFICULTY BANDS</div><h2>難度帶表現</h2></div>
        <span>區分基礎穩定、核心定位與延伸能力</span>
      </div>
      <div className="learning-grid">
        {analysis.difficultyBands.map((band) => (
          <article key={band.label}>
            <span>{evidenceLabel(band.metric.sampleCount)}</span>
            <h3>{band.label}</h3>
            <strong>{band.metric.accuracy === null ? "尚未取樣" : `${band.metric.correctCount}/${band.metric.sampleCount} · ${band.metric.accuracy}%`}</strong>
            <p>{band.note}</p>
          </article>
        ))}
      </div>

      <div className="section-heading">
        <div><div className="panel-kicker">SIGNAL INTERPRETATION</div><h2>關鍵訊號</h2></div>
        <span>只解讀具有足夠證據的部分</span>
      </div>
      <div className="learning-grid">
        <article>
          <span>STRENGTH</span>
          <h3>{analysis.strongestTopic?.label ?? "尚未形成"}</h3>
          <strong>{analysis.strongestTopic ? `${analysis.strongestTopic.accuracy}% · ${evidenceLabel(analysis.strongestTopic.sampleCount)}` : "需要更多題目"}</strong>
          <p>這是本次相對穩定的領域；建議用變化題確認是否能跨情境遷移。</p>
        </article>
        <article>
          <span>PRIORITY</span>
          <h3>{analysis.priorityTopic?.label ?? analysis.priorityFormat?.label ?? "先增加取樣"}</h3>
          <strong>{analysis.priorityTopic ? `${analysis.priorityTopic.accuracy}% · ${paceLabel(analysis.priorityTopic.paceRatio)}` : "證據仍少"}</strong>
          <p>{analysis.priorityFormat ? `題型上以「${analysis.priorityFormat.label}」最值得優先確認。` : "目前沒有單一題型形成明顯弱點。"}</p>
        </article>
        <article>
          <span>CALIBRATION</span>
          <h3>{analysis.hardWins} 次超預期命中</h3>
          <strong>{analysis.unexpectedMisses} 次基礎失誤 · 校準差 {analysis.calibrationGap > 0 ? "+" : ""}{analysis.calibrationGap}%</strong>
          <p>超預期命中代表可延伸能力；高預期題失誤較多時，應先檢查粗心、讀題與基本流程。</p>
        </article>
      </div>

      <p className="evidence-note">
        前半段命中率 {analysis.firstAccuracy ?? "—"}%、後半段 {analysis.secondAccuracy ?? "—"}%。分析會同時考慮樣本數與作答節奏；單題訊號不會直接被解讀為固定能力。
      </p>
    </section>
  );
}
