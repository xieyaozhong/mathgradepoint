# MATH//SCAN 數學等級評比器

像素風自適應數學評比，範圍從小學四年級到碩士核心。測驗、計分與結果分析都在使用者的瀏覽器中執行，不需要 ChatGPT 帳號、資料庫或後端服務。

## 評量特色

- 120 題題庫，每個能力級別配置 10 題
- 計算、情境應用、資料判讀、推理與概念辨析交錯出題
- Bayesian 難度校準、領域／題型輪替，以及跨次測驗避重
- 16–20 題完成一次評量，結果同時顯示可能區間與證據強度
- 能力地圖細分為數感、幾何、代數、函數、三角、資料機率、微積分、線性代數與分析證明
- 深度分析題型答對率、相對作答時間、難度帶、前後段趨勢、超預期命中與高預期失誤
- 自動產生三步學習路線、重點錯題診斷與個人化學習武器
- 依本次題型、主題、難度與有效作答時間推薦學習武器，並逐級開放三層「補強」
- 支援 A4 列印、另存 PDF 與 UTF-8 文字診斷下載

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
- `app/page.tsx`：自適應演算法、診斷報告與互動介面
- `scripts/apply-analysis-upgrade.mjs`：建置前套用題庫與分析模組
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
