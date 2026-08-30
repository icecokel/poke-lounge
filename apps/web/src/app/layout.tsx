import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poke Lounge",
  description: "친구와 함께 즐기는 브라우저형 포켓몬 팬 게임",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko-KR" className="dark">
      <body>{children}</body>
    </html>
  );
}
