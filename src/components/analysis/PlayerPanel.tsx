"use client";

// YouTube IFrame Player. Other components dispatch
// window.dispatchEvent(new CustomEvent("tl-seek", { detail: { seconds } }))
// to jump the player to a scene.

import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: { onReady?: () => void };
        },
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function seekPlayer(seconds: number) {
  window.dispatchEvent(new CustomEvent("tl-seek", { detail: { seconds } }));
}

export function PlayerPanel({ videoId, isMock }: { videoId: string; isMock: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isMock) return;

    let cancelled = false;

    function create() {
      if (cancelled || !hostRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: { onReady: () => !cancelled && setReady(true) },
      });
    }

    if (window.YT?.Player) {
      create();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        create();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId, isMock]);

  useEffect(() => {
    function onSeek(e: Event) {
      const seconds = (e as CustomEvent<{ seconds: number }>).detail?.seconds ?? 0;
      const p = playerRef.current;
      if (p) {
        p.seekTo(seconds, true);
        p.playVideo();
      }
    }
    window.addEventListener("tl-seek", onSeek);
    return () => window.removeEventListener("tl-seek", onSeek);
  }, []);

  if (isMock) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/40 text-sm text-muted-foreground">
        <Film aria-hidden />
        Mock 모드에서는 실제 영상 재생이 제공되지 않습니다
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-black">
      <div className="aspect-video w-full">
        <div ref={hostRef} className="h-full w-full" />
      </div>
      {!ready && (
        <p className="p-2 text-center text-xs text-muted-foreground">
          플레이어 로딩 중…
        </p>
      )}
    </div>
  );
}
