"use client";

// 섹션을 기본 접힌 상태로 두고, 펼칠 때 "데이터가 살아난다"는 느낌을 주기
// 위한 공용 컴포넌트. 데이터/로직은 전혀 안 건드리고 프레젠테이션만 감쌉니다.
//
//   <SectionGroup> 여러 섹션을 묶어 "모두 펼치기" + 스포트라이트(형제 카드
//                  일시 dim)를 조율합니다. 없어도 CollapsibleSection 단독으로
//                  동작합니다.
//   <CollapsibleSection> 헤더(버튼) + 내용. 처음 펼칠 때만 useSectionReveal()의
//                        animateIn이 true가 됩니다 — 그 순간에만 숫자
//                        카운트업/바 성장/차트 draw-in을 재생하라는 신호.
//
// 첫 펼침 이후엔 콘텐츠를 마운트 상태로 유지합니다(닫아도 언마운트 안 함).
// 그래서 다시 열 때는 차트가 다시 그려지지 않고 컨테이너만 가볍게
// 펼쳐집니다 — "재열림은 가볍게/즉시"라는 요구사항.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── 첫 펼침 신호를 자식(카운트업/바/차트)에게 내려주는 컨텍스트 ────────────

interface SectionRevealValue {
  /** 이번 렌더에서 "데이터가 처음 살아나는" 애니메이션을 재생해야 하면 true. */
  animateIn: boolean;
  reducedMotion: boolean;
}

const SectionRevealContext = createContext<SectionRevealValue>({
  animateIn: false,
  reducedMotion: false,
});

/** 차트/카운터 등에서 "지금 처음 펼쳐지는 순간인가"를 읽습니다. */
export function useSectionReveal(): SectionRevealValue {
  return useContext(SectionRevealContext);
}

// ── 여러 섹션을 묶어 모두 펼치기/접기 + 스포트라이트를 조율 ─────────────────

interface SectionMember {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}

interface SectionGroupValue {
  register: (id: string, api: SectionMember) => () => void;
  spotlight: (openingId: string) => void;
  dimmedIds: Set<string>;
  expandAll: () => void;
  collapseAll: () => void;
}

const SectionGroupContext = createContext<SectionGroupValue | null>(null);

export function SectionGroup({ children }: { children: React.ReactNode }) {
  const membersRef = useRef(new Map<string, SectionMember>());
  const [dimmedIds, setDimmedIds] = useState<Set<string>>(new Set());
  const dimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const register = useCallback<SectionGroupValue["register"]>((id, api) => {
    membersRef.current.set(id, api);
    return () => {
      membersRef.current.delete(id);
    };
  }, []);

  const spotlight = useCallback((openingId: string) => {
    const others = [...membersRef.current.keys()].filter((id) => id !== openingId);
    if (others.length === 0) return;
    setDimmedIds(new Set(others));
    if (dimTimer.current) clearTimeout(dimTimer.current);
    dimTimer.current = setTimeout(() => setDimmedIds(new Set()), 550);
  }, []);

  const expandAll = useCallback(() => {
    membersRef.current.forEach((m) => m.open());
  }, []);

  const collapseAll = useCallback(() => {
    membersRef.current.forEach((m) => m.close());
  }, []);

  useEffect(() => () => {
    if (dimTimer.current) clearTimeout(dimTimer.current);
  }, []);

  return (
    <SectionGroupContext.Provider value={{ register, spotlight, dimmedIds, expandAll, collapseAll }}>
      {children}
    </SectionGroupContext.Provider>
  );
}

/** <SectionGroup> 안에서 "모두 펼치기 / 모두 접기" 버튼을 만들 때 씁니다. */
export function useSectionGroupControls() {
  const ctx = useContext(SectionGroupContext);
  return {
    expandAll: ctx?.expandAll ?? (() => {}),
    collapseAll: ctx?.collapseAll ?? (() => {}),
    available: ctx != null,
  };
}

// ── CollapsibleSection 본체 ──────────────────────────────────────────────

const FIRST_REVEAL_WINDOW_MS = 900;

export interface CollapsibleSectionProps {
  /** aria/세션 저장용 안정적인 키. 같은 analysisId 안에서 유일해야 합니다. */
  id: string;
  title: string;
  /** 접혀 있을 때 보이는 한 줄 요약. */
  teaser: string;
  /** 접혀 있을 때 헤더 오른쪽에 보이는 작은 미리보기(숫자 하나, 스파크라인 등). */
  previewGlyph?: React.ReactNode;
  defaultOpen?: boolean;
  /** true면 페이지를 새로고침해도 세션 동안 펼침 상태를 기억합니다. */
  persist?: boolean;
  children: React.ReactNode;
  className?: string;
}

function storageKey(id: string) {
  return `tl:section-open:${id}`;
}

export function CollapsibleSection({
  id,
  title,
  teaser,
  previewGlyph,
  defaultOpen = false,
  persist = true,
  children,
  className,
}: CollapsibleSectionProps) {
  const reactId = useId();
  const contentId = `section-content-${reactId}`;
  const reducedMotion = useReducedMotion() ?? false;
  const group = useContext(SectionGroupContext);

  const [open, setOpen] = useState<boolean>(() => {
    if (persist && typeof window !== "undefined") {
      const saved = window.sessionStorage.getItem(storageKey(id));
      if (saved != null) return saved === "1";
    }
    return defaultOpen;
  });
  const [hasOpenedOnce, setHasOpenedOnce] = useState(open);
  const [animateIn, setAnimateIn] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerRef = useRef<HTMLButtonElement>(null);
  const justOpenedRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!group) return;
    return group.register(id, {
      open: () => setOpenState(true),
      close: () => setOpenState(false),
      isOpen: () => openRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, id]);

  useEffect(() => {
    return () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    };
  }, []);

  function setOpenState(next: boolean) {
    setOpen(next);
    if (persist && typeof window !== "undefined") {
      window.sessionStorage.setItem(storageKey(id), next ? "1" : "0");
    }
    if (next) {
      justOpenedRef.current = true;
      if (!hasOpenedOnce) {
        setHasOpenedOnce(true);
        setAnimateIn(true);
        if (revealTimer.current) clearTimeout(revealTimer.current);
        revealTimer.current = setTimeout(() => setAnimateIn(false), FIRST_REVEAL_WINDOW_MS);
      }
      group?.spotlight(id);
    }
  }

  function handleToggle() {
    setOpenState(!open);
  }

  // 펼침 애니메이션이 끝난 뒤 편안한 위치로 스크롤.
  useEffect(() => {
    if (!open || !justOpenedRef.current) return;
    justOpenedRef.current = false;
    const delay = reducedMotion ? 0 : 340;
    const t = setTimeout(() => {
      headerRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }, delay);
    return () => clearTimeout(t);
  }, [open, reducedMotion]);

  const dimmed = group?.dimmedIds.has(id) ?? false;

  return (
    <SectionRevealContext.Provider value={{ animateIn: animateIn && !reducedMotion, reducedMotion }}>
      <div
        className={cn(
          "rounded-lg border bg-card/60 transition-[opacity,border-color] duration-300",
          open ? "border-primary/25" : "border-border/40",
          dimmed && "opacity-50",
          className,
        )}
      >
        <button
          ref={headerRef}
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={handleToggle}
          className="flex w-full items-center gap-3 rounded-lg px-5 py-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.22, ease: "easeOut" }}
            className="flex shrink-0 items-center justify-center text-muted-foreground"
          >
            <ChevronDown className="size-4" aria-hidden />
          </motion.span>

          <span className="min-w-0 flex-1">
            <span className="block text-body-lg font-semibold text-foreground">{title}</span>
            {!open && <span className="mt-0.5 block truncate text-caption text-muted-foreground">{teaser}</span>}
          </span>

          {!open && previewGlyph && (
            <span className="shrink-0 text-right" aria-hidden>
              {previewGlyph}
            </span>
          )}
        </button>

        {/* hasOpenedOnce가 되기 전엔 아예 마운트하지 않습니다(무거운 차트를
            안 열어본 섹션까지 미리 그릴 필요 없음). 한 번 열리면 계속
            마운트 상태를 유지해서, 다시 열 때 차트가 또 애니메이션을 타지
            않고 컨테이너만 가볍게 펼쳐지도록 합니다. */}
        {hasOpenedOnce && (
          <motion.div
            key="content"
            id={contentId}
            role="region"
            aria-label={title}
            aria-hidden={!open}
            inert={!open}
            initial={{ height: 0, opacity: 0 }}
            animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-5 pb-5 pt-1">
              <RevealStagger active={animateIn && !reducedMotion}>{children}</RevealStagger>
            </div>
          </motion.div>
        )}
      </div>
    </SectionRevealContext.Provider>
  );
}

// ── 자식 스태거 진입(translateY + fade) ──────────────────────────────────

function RevealStagger({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active) return <>{children}</>;
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * 섹션 내부에서 개별 블록(카드, 통계 하나 등)을 감싸 스태거 진입시킵니다.
 * animateIn이 아닐 때(재열림, reduced-motion)는 그냥 통과시킵니다.
 */
export function Reveal({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** ol/ul 안에서 쓸 땐 "li"로 — div로 감싸면 마크업이 깨집니다. */
  as?: "div" | "li";
}) {
  const { animateIn } = useSectionReveal();
  const Tag = as;
  if (!animateIn) return <Tag className={className}>{children}</Tag>;
  const MotionTag = as === "li" ? motion.li : motion.div;
  return (
    <MotionTag
      className={className}
      variants={{
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } },
      }}
    >
      {children}
    </MotionTag>
  );
}

// ── 모두 펼치기 / 모두 접기 ───────────────────────────────────────────────

export function ExpandCollapseAll({ className }: { className?: string }) {
  const { expandAll, collapseAll, available } = useSectionGroupControls();
  if (!available) return null;
  return (
    <div className={cn("flex items-center gap-1 text-caption", className)}>
      <button
        type="button"
        onClick={expandAll}
        className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        모두 펼치기
      </button>
      <span className="text-muted-foreground/40" aria-hidden>
        ·
      </span>
      <button
        type="button"
        onClick={collapseAll}
        className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        모두 접기
      </button>
    </div>
  );
}
