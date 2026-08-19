import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          teal: "hsl(var(--chart-teal))",
          violet: "hsl(var(--chart-violet))",
          magenta: "hsl(var(--chart-magenta))",
          crimson: "hsl(var(--chart-crimson))",
          amber: "hsl(var(--chart-amber))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // 6단계 타입 스케일. 기본 Tailwind 크기(text-xs, text-lg 등)는 그대로
      // 두되(다른 페이지가 아직 씀), 분석 페이지는 이 6개 이름으로만
      // 마이그레이션합니다. 줄간격은 역할별로 고정: 한글 UI/캡션은 넉넉하게,
      // 숫자·헤딩은 타이트하게.
      fontSize: {
        caption: ["12px", { lineHeight: "1.65" }],
        body: ["14px", { lineHeight: "1.7" }],
        "body-lg": ["16px", { lineHeight: "1.7" }],
        heading: ["20px", { lineHeight: "1.35" }],
        display: ["28px", { lineHeight: "1.2" }],
        hero: ["40px", { lineHeight: "1.2" }],
      },
      fontFamily: {
        // --font-sans(globals.css)가 이미 전체 폴백 체인을 담고 있어서
        // 여기서 중복으로 나열하지 않습니다.
        sans: ["var(--font-sans)"],
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
