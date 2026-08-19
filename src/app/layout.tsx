import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { Clapperboard } from "lucide-react";
import "./globals.css";

// 셀프호스팅 Pretendard Variable. 이전엔 --font-sans 문자열에 이름만
// 적혀 있고 실제로 로드된 적이 없어서, 시스템에 안 깔려 있으면 한글은
// 맑은 고딕, 영문은 Segoe UI로 갈라져 렌더링됐습니다(기준선·굵기가
// 다른 두 서체가 한 문장에 섞임).
const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

export const metadata: Metadata = {
  title: {
    default: "TrailerLens — 게임 트레일러 반응 분석",
    template: "%s | TrailerLens",
  },
  description:
    "유튜브 게임 트레일러의 댓글과 반복 재생 구간을 수집·분석해 사람들이 어떤 장면에 왜 반응했는지 보여주는 분석 도구",
};

export const viewport: Viewport = {
  themeColor: "#070b16",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`dark ${pretendard.variable}`}>
      <body className="min-h-dvh">
        <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-bold tracking-tight"
            >
              <Clapperboard className="size-5 text-primary" aria-hidden />
              <span>
                Trailer<span className="text-primary">Lens</span>
              </span>
            </Link>
            <nav aria-label="주 메뉴" className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                분석
              </Link>
              <Link
                href="/settings"
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                설정
              </Link>
              <Link
                href="/privacy"
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                개인정보
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">{children}</main>
        <footer className="border-t border-border/60 py-6">
          <div className="mx-auto max-w-6xl px-4 text-xs text-muted-foreground">
            TrailerLens는 YouTube Data API의 공개 데이터를 사용합니다. 히트맵 값은
            정규화된 상대 강도이며 시청자 수가 아닙니다.
          </div>
        </footer>
      </body>
    </html>
  );
}
