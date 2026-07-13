import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const pagePath = resolve(projectRoot, "app/page.tsx");
const cssPath = resolve(projectRoot, "app/globals.css");
const serviceWorkerPath = resolve(projectRoot, "public/sw.js");

const calibrationSignalStyles = `

.topbar.is-calibrating {
  border-color: rgb(255 107 122 / 0.78);
  border-bottom-color: var(--danger);
  background:
    linear-gradient(90deg, rgb(255 107 122 / 0.16), transparent 58%),
    rgb(8 13 26 / 0.96);
  box-shadow:
    0 0 0 2px rgb(255 107 122 / 0.14),
    0 0 28px rgb(255 107 122 / 0.2),
    var(--pixel-shadow);
}

.system-status.is-calibrating {
  color: #fff;
  text-shadow: 0 0 12px rgb(255 107 122 / 0.75);
}

.system-status.is-calibrating > span {
  width: 12px;
  height: 12px;
  background: var(--danger);
  box-shadow:
    0 0 0 4px rgb(255 107 122 / 0.2),
    0 0 20px var(--danger);
  animation: status-pulse 0.7s steps(2, end) infinite;
}

.calibration-alert {
  display: flex;
  gap: 13px;
  align-items: center;
  padding: 13px 16px;
  border: 2px solid var(--danger);
  margin-bottom: 14px;
  background:
    linear-gradient(90deg, rgb(255 107 122 / 0.18), rgb(255 107 122 / 0.04)),
    var(--surface);
  box-shadow:
    0 0 0 2px rgb(255 107 122 / 0.1),
    0 0 24px rgb(255 107 122 / 0.16),
    var(--pixel-shadow);
  color: #fff;
}

.calibration-alert-light {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  background: var(--danger);
  box-shadow:
    0 0 0 5px rgb(255 107 122 / 0.2),
    0 0 22px var(--danger);
  animation: status-pulse 0.7s steps(2, end) infinite;
}

.calibration-alert > div {
  display: grid;
  gap: 4px;
}

.calibration-alert strong {
  color: var(--danger);
  font-size: 0.76rem;
  letter-spacing: 0.14em;
}

.calibration-alert small {
  color: var(--text);
  font-family: "Microsoft JhengHei UI", "PingFang TC", sans-serif;
  font-size: 0.72rem;
  line-height: 1.45;
}

@media (max-width: 720px) {
  .calibration-alert {
    align-items: flex-start;
    padding: 12px 13px;
  }

  .calibration-alert strong {
    font-size: 0.7rem;
  }

  .calibration-alert small {
    font-size: 0.68rem;
  }
}
`;

async function patchPage() {
  let source = await readFile(pagePath, "utf8");

  if (!source.includes("const calibrationRequired =")) {
    source = source.replace(
      '  const isCalibrationQuestion = phase === "quiz" && currentStep > BASE_QUESTIONS;',
      `  const calibrationRequired =
    phase === "quiz" &&
    quizState.answers.length >= BASE_QUESTIONS &&
    !shouldStop(quizState);
  const isCalibrationQuestion =
    phase === "quiz" &&
    (currentStep > BASE_QUESTIONS || (Boolean(feedback) && calibrationRequired));`,
    );
  }

  source = source.replace(
    '<header className="topbar screen-only">',
    '<header className={`topbar screen-only ${isCalibrationQuestion ? "is-calibrating" : ""}`}>',
  );

  if (!source.includes('className="calibration-alert"')) {
    source = source.replace(
      `            <div className="quiz-screen">
              <div className="quiz-hud">`,
      `            <div className="quiz-screen">
              {isCalibrationQuestion && (
                <div className="calibration-alert" role="status" aria-live="assertive">
                  <span className="calibration-alert-light" aria-hidden="true" />
                  <div>
                    <strong>CALIBRATION SIGNAL</strong>
                    <small>校正模式啟動：系統正在確認能力區間</small>
                  </div>
                </div>
              )}
              <div className="quiz-hud">`,
    );
  }

  await writeFile(pagePath, source);
}

async function patchStyles() {
  let source = await readFile(cssPath, "utf8");
  if (!source.includes(".calibration-alert-light")) {
    source += calibrationSignalStyles;
  }
  await writeFile(cssPath, source);
}

async function patchServiceWorker() {
  let source = await readFile(serviceWorkerPath, "utf8");
  source = source.replace(
    /const CACHE_VERSION = "[^"]+";/,
    'const CACHE_VERSION = "v6-calibration-signal-20260713";',
  );
  await writeFile(serviceWorkerPath, source);
}

await patchPage();
await patchStyles();
await patchServiceWorker();
