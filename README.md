# MATH//SCAN 數學等級評比器

像素風自適應數學評比，範圍從小學四年級到碩士核心。測驗、計分與結果分析都在使用者的瀏覽器中執行，不需要 ChatGPT 帳號、資料庫或後端服務。

## GitHub Pages 自動部署

專案已包含 `.github/workflows/deploy-pages.yml`。推送到 GitHub 後：

1. 在 repository 的 **Settings → Pages** 將 **Source** 設為 **GitHub Actions**。
2. 確認預設分支為 `main`。
3. 推送到 `main`，或在 **Actions → Deploy GitHub Pages** 手動執行。
4. 完成後網址通常是 `https://<帳號>.github.io/<repository>/`。

工作流程會自動安裝依賴、建立完全靜態的網站、驗證資源路徑，並發布到 GitHub Pages。靜態版採相對路徑，因此也能部署到自訂網域或任何一般靜態主機。

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

- `app/page.tsx`：測驗題庫、自適應演算法與互動介面
- `app/globals.css`：像素風響應式設計
- `github/`：GitHub Pages 專用靜態入口
- `vite.github.config.ts`：可攜式靜態建置設定
- `.github/workflows/deploy-pages.yml`：GitHub Pages 自動部署
- `public/og.png`：社群分享預覽圖

## 評量聲明

結果僅供自我了解與學習規劃，不等同正式學力鑑定、學校成績、入學資格或學術認證。
