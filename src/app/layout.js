import { Noto_Sans_SC, Space_Grotesk } from "next/font/google";
import "./globals.css";

const notoSansSc = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata = {
  title: "任意门",
  description: "一个用抽象图形交换状态、视角和一点点未来感的双人小游戏",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="zh-CN"
      className={`${notoSansSc.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
