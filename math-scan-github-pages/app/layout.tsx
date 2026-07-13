import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:4173";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  const title = "數學等級評比器｜小四到碩士核心";
  const description = "透過 10–12 題自適應數學關卡，估算你從小學四年級到碩士核心的目前能力區間。";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "zh_TW",
      images: [{ url: imageUrl, width: 1728, height: 906, alt: "MATH//SCAN 數學等級評比器" }],
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
