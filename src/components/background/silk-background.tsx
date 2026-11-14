"use client";

// Decorative silk strands. Motion uses CSS transforms driven by two CSS variables,
// written from one requestAnimationFrame loop. React state is never updated per frame.
import { useEffect, useRef } from "react";
import { useAppearance, type PerformanceMode } from "@/components/theme/theme-provider";

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 1000;
const STRAND_TOTAL = 12;
const IDLE_MS = 2500;

type Strand = {
  index: number;
  d: string;
  depth: number;
  width: number;
  opacity: number;
  soft: boolean;
};

const fmt = (n: number) => n.toFixed(1);

// Fixed maths, no randomness, so server and browser produce identical markup.
function buildStrand(index: number): Strand {
  const p = index * 0.83;
  const baseY = 90 + index * (820 / (STRAND_TOTAL - 1));
  const sway = 70 + (index % 4) * 35;
  const y0 = baseY + Math.sin(p) * 40;
  const y1 = baseY + Math.sin(p * 1.6 + 1.1) * sway;
  const y2 = baseY + Math.cos(p * 1.2 + 0.4) * sway;
  const yMid = baseY + Math.sin(p * 0.7 + 2.2) * sway * 0.6;
  const y3 = baseY + Math.cos(p * 1.9 + 0.8) * sway;
  const y4 = baseY + Math.sin(p * 1.3 + 3.1) * sway;
  const y5 = baseY + Math.cos(p * 2.4) * 60;
  return {
    index,
    d: `M-80 ${fmt(y0)} C320 ${fmt(y1)} 520 ${fmt(y2)} 800 ${fmt(yMid)} C1080 ${fmt(y3)} 1280 ${fmt(y4)} 1680 ${fmt(y5)}`,
    depth: 0.25 + (index % 5) * 0.18,
    width: 1 + (index % 3) * 0.7,
    opacity: 0.35 + ((index * 7) % 5) * 0.1,
    soft: index % 2 === 1,
  };
}

const ALL_STRANDS = Array.from({ length: STRAND_TOTAL }, (_, i) => buildStrand(i));

const LEVELS: Record<PerformanceMode, { keep: (index: number) => boolean; opacityScale: number; gain: number }> = {
  elegant: { keep: () => true, opacityScale: 1, gain: 1 },
  balanced: { keep: (i) => i % 3 !== 1, opacityScale: 0.6, gain: 0.55 },
  minimal: { keep: (i) => i % 3 === 0, opacityScale: 0.35, gain: 0 },
};

export function SilkBackground() {
  const { performanceMode } = useAppearance();
  const rootRef = useRef<HTMLDivElement>(null);
  const level = LEVELS[performanceMode];
  const strands = ALL_STRANDS.filter((strand) => level.keep(strand.index));

  useEffect(() => {
    const rootElement = rootRef.current;
    if (!rootElement) return;

    const root: HTMLDivElement = rootElement;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const animate = performanceMode !== "minimal" && !reduceMotion;
    if (!animate) {
      root.style.setProperty("--silk-x", "0px");
      root.style.setProperty("--silk-y", "0px");
      return;
    }

    const gain = LEVELS[performanceMode].gain;
    const t0 = performance.now();
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let lastPointerAt = -Infinity;
    let frame = 0;
    let lastFrame = 0;

    function onPointerMove(event: PointerEvent) {
      targetX = (event.clientX / window.innerWidth) * 2 - 1;
      targetY = (event.clientY / window.innerHeight) * 2 - 1;
      lastPointerAt = performance.now();
    }

    function tick(now: number) {
      const dt = lastFrame ? Math.min(now - lastFrame, 64) : 16;
      lastFrame = now;
      const seconds = (now - t0) / 1000;
      const followingPointer = finePointer && now - lastPointerAt < IDLE_MS;
      // Follow the cursor when recently moved; otherwise drift slowly on its own.
      const goalX = followingPointer ? targetX * 36 : Math.sin(seconds * 0.21) * 22;
      const goalY = followingPointer ? targetY * 26 : Math.cos(seconds * 0.17) * 16;
      // Frame-rate independent easing toward the goal.
      const ease = 1 - Math.pow(0.9, dt / 16);
      currentX += (goalX * gain - currentX) * ease;
      currentY += (goalY * gain - currentY) * ease;
      root.style.setProperty("--silk-x", `${currentX.toFixed(2)}px`);
      root.style.setProperty("--silk-y", `${currentY.toFixed(2)}px`);
      frame = requestAnimationFrame(tick);
    }

    function startLoop() {
      if (!frame && !document.hidden) {
        lastFrame = 0;
        frame = requestAnimationFrame(tick);
      }
    }

    function stopLoop() {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }

    function onVisibilityChange() {
      if (document.hidden) stopLoop();
      else startLoop();
    }

    if (finePointer) window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    startLoop();

    return () => {
      stopLoop();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [performanceMode]);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="silk-background-viewport pointer-events-none fixed inset-x-0 top-0 -z-10 overflow-hidden"
    >
      <div className="silk-smoke absolute inset-0" />
      <svg
        className="absolute inset-0 size-full"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        focusable="false"
      >
        {strands.map((strand) => (
          <path
            key={strand.index}
            d={strand.d}
            strokeWidth={strand.width}
            strokeLinecap="round"
            strokeOpacity={strand.opacity * level.opacityScale}
            className={strand.soft ? "silk-strand silk-strand--soft" : "silk-strand"}
            style={{
              transform: `translate3d(calc(var(--silk-x, 0px) * ${strand.depth}), calc(var(--silk-y, 0px) * ${strand.depth}), 0)`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
