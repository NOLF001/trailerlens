import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // 프로덕션(Docker) 빌드에는 eslint를 아예 설치하지 않습니다 — 린트는
    // `pnpm lint`로 별도 실행합니다. 여기서 끄지 않으면 빌드가 eslint를
    // 찾다가 실패합니다.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
    ],
  },
};

export default nextConfig;
