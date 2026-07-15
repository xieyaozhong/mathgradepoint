import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:4173";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  const title = "數學等級評比器｜小四到碩士核心";
  const description = "通常以 10 題完成跨次校準，必要時追加最多 4 題，並產生含每題分析與學習武器的個人診斷單。";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "zh_TW",
      images: [{ url: imageUrl, width: 1729, height: 910, alt: "MATH//SCAN 數學等級評比器" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
