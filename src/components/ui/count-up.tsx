"use client";

// 섹션이 처음 펼쳐질 때만 0→값으로 카운트업합니다. 재열림/reduced-motion일
// 때는 그냥 최종값을 바로 보여줍니다(useSectionReveal의 animateIn 신호).

import { useEffect, useRef, useState } from "react";
import { useSectionReveal } from "./collapsible-section";

export function CountUp({
  value,
  duration = 700,
  format,
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const { animateIn, reducedMotion } = useSectionReveal();
  const [display, setDisplay] = useState(animateIn && !reducedMotion ? 0 : value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!animateIn || reducedMotion) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // animateIn은 첫 펼침 창에서만 true였다가 다시 false로 떨어지는
    // 일회성 신호라, 그 순간의 value/duration만 반영하면 됩니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateIn]);

  const shown = format ? format(display) : Math.round(display).toLocaleString();
  return <span className={className}>{shown}</span>;
}

/**
 * 0%에서 목표 폭까지 자라나는 바. 첫 펼침에만 애니메이션, 이후엔 바로
 * 목표 폭으로 렌더링합니다.
 */
export function AnimatedBarFill({
  targetPercent,
  color,
  className,
  delayMs = 0,
}: {
  /** 0~100 */
  targetPercent: number;
  color: string;
  className?: string;
  delayMs?: number;
}) {
  const { animateIn, reducedMotion } = useSectionReveal();
  const clamped = Math.min(100, Math.max(0, targetPercent));
  const [width, setWidth] = useState(animateIn && !reducedMotion ? 0 : clamped);

  useEffect(() => {
    if (!animateIn || reducedMotion) {
      setWidth(clamped);
      return;
    }
    setWidth(0);
    const t = setTimeout(() => setWidth(clamped), delayMs + 20);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateIn]);

  return (
    <div
      className={className}
      style={{
        width: `${width}%`,
        background: color,
        transition: "width 640ms cubic-bezier(0.16,1,0.3,1)",
        transitionDelay: `${delayMs}ms`,
      }}
    />
  );
}
