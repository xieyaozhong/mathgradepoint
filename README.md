# MATH//SCAN 數學等級評比器

像素風自適應數學評比，範圍從小學四年級到碩士核心。測驗、計分與結果分析都在使用者的瀏覽器中執行，不需要 ChatGPT 帳號、資料庫或後端服務。

## 評量特色

- 120 題題庫，每個能力級別配置 10 題
- 計算、情境應用、資料判讀、推理與概念辨析交錯出題
- Bayesian 難度校準、領域／題型輪替，以及跨次新題優先
- 標準流程為 10 題；只有能力區間過寬、取樣覆蓋不足、前後段波動或表現明顯偏離預估時，才追加校正題
- 校正題會優先選擇目前能力值附近，以及出現矛盾訊號的領域與題型，總題數最多 14 題
- 最多綜合最近 8 次完整評量：120 天半衰期、同題只採最新一次、重複曝光降權
- 同時保留「本次獨立結果」與「跨次綜合結果」，新表現可推翻過時基準
- 能力地圖細分為數感、幾何、代數、函數、三角、資料機率、微積分、線性代數與分析證明
- 深度分析題型答對率、相對作答時間、難度帶、前後段趨勢、超預期命中與高預期失誤
- 自動產生三步學習路線、完整 10–14 題逐題診斷與個人化學習武器
- 每題呈現正誤、答案、時間、難度訊號、證據權重、快速檢查與下一步
- 依本次題型、主題、難度與有效作答時間推薦學習武器，並逐級開放三層「補強」
- 支援 A4 列印、另存 PDF 與 UTF-8 文字診斷下載
- 裝置共用時可改用訪客模式；歷史資料僅留在瀏覽器並可隨時清除

## 十題與校正機制

完成第 10 題後，系統會先檢查本次證據是否足以定位。一般情況會直接產生診斷；以下特殊訊號才會觸發校正題：

- 80% 能力區間仍然過寬
- 作答只涵蓋少於 4 個領域或少於 4 種題型
- 累積至少 2 題超預期高難度命中
- 累積至少 2 題高預期題失誤
- 前半段與後半段答對率相差至少 50 個百分點

校正階段最多追加 4 題。選題會集中在目前能力估計附近，並優先確認表現矛盾的領域或題型。

## PWA 安裝與離線使用

GitHub Pages 版本已支援 Progressive Web App：

- 可從支援的瀏覽器安裝成獨立 App
- iPhone／iPad 可從 Safari 分享選單選擇「加入主畫面」
- 首次在線開啟後，會快取應用程式外殼與已載入資源，供離線再次啟動
- 新版本部署後，Service Worker 會更新快取
- PWA 路徑採相對設定，可正確部署在 GitHub Pages 的 repository 子路徑

## GitHub Pages 自動部署

專案已包含 `.github/workflows/deploy-pages.yml`。推送到 GitHub 後：

1. 在 repository 的 **Settings → Pages** 將 **Source** 設為 **GitHub Actions**。
2. 確認預設分支為 `main`。
3. 推送到 `main`，或在 **Actions → Deploy GitHub Pages** 手動執行。
4. 完成後網址通常是 `https://<帳號>.github.io/<repository>/`。

工作流程會自動安裝依賴、產生 PWA 圖示、套用題庫與分析升級、建立完全靜態的網站、驗證資源路徑，並發布到 GitHub Pages。靜態版採相對路徑，因此也能部署到自訂網域或任何一般靜態主機。

## 本機驗證 GitHub 版本

```bash
npm ci
npm run check:github
npm run preview:github
```

靜態輸出位於 `github-dist/`。這個資料夾是建置產物，不需要提交。

## Sites／Cloudflare 版本

原本的 Vinext 架構仍完整保留：

```bash
npm run dev
npm run build
```

## 主要結構

- `app/math-data.ts`：能力級別、核心題庫與細分領域學習建議
- `app/extra-questions.ts`：新增的 60 題擴充題庫
- `app/deep-analysis-panel.tsx`：題型、節奏、難度帶與穩定性分析
- `app/page.tsx`：自適應演算法、跨次校準、逐題診斷報告與互動介面
- `app/history-engine.js`：本機歷史驗證、時間衰減、同題去重與弱先驗
- `scripts/apply-analysis-upgrade.mjs`：建置前套用題庫、十題校正流程與分析模組
- `app/globals.css`：像素風響應式設計
- `github/`：GitHub Pages 專用靜態入口與 Service Worker 註冊
- `vite.github.config.ts`：可攜式靜態建置設定
- `.github/workflows/deploy-pages.yml`：GitHub Pages 自動部署
- `public/manifest.webmanifest`：PWA 安裝資訊
- `public/sw.js`：離線快取與更新策略
- `public/icon.svg`、`public/icon-maskable.svg`：一般與遮罩式 App 圖示
- `public/og.png`：社群分享預覽圖與 Apple 主畫面圖示備援

## 評量聲明

結果僅供自我了解與學習規劃，不等同正式學力鑑定、學校成績、入學資格或學術認證。
