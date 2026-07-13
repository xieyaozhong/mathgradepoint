import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const pagesBasePath = process.env.PAGES_BASE_PATH?.trim();
const base = pagesBasePath
  ? `${pagesBasePath.replace(/\/+$/, "")}/`
  : process.env.GITHUB_ACTIONS
    ? "/"
    : "./";
const siteUrl = process.env.SITE_URL?.replace(/\/+$/, "") || ".";

export default defineConfig({
  root: resolve(projectRoot, "github"),
  base,
  plugins: [
    react(),
    {
      name: "github-pages-metadata",
      transformIndexHtml(html) {
        return html.replaceAll("__SITE_URL__", siteUrl);
      },
    },
  ],
  publicDir: resolve(projectRoot, "public"),
  build: {
    outDir: resolve(projectRoot, "github-dist"),
    emptyOutDir: true,
    target: "es2022",
  },
});
