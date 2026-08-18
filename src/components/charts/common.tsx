"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** ink ramp — the only "palette": grayscale steps with wide lightness separation */
export const INK = ["#171717", "#8a8a8a", "#c9c9c9", "#ececec"];
export const GRID = "#ececec";
export const AXIS = "#737373"; // axis lines: clearly darker than gridlines
export const AXIS_TEXT = "#4a4a4a";
export const SURFACE = "#ffffff";

/** shared axis-title text style — plain sans, no italics */
export const AXIS_TITLE_PROPS = {
  fontSize: 13,
  fill: "#404040",
};

/** responsive width via ResizeObserver */
export function useMeasure<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export interface TooltipState {
  x: number;
  y: number;
  lines: { label?: string; value: string }[];
}

export function useTooltip() {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const show = useCallback((x: number, y: number, lines: TooltipState["lines"]) => {
    setTip({ x, y, lines });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

/** floating tooltip anchored inside a position:relative container */
export function Tooltip({ tip, width }: { tip: TooltipState | null; width: number }) {
  if (!tip) return null;
  const flip = width > 0 && tip.x > width - 130;
  return (
    <div
      className="chart-tooltip"
      role="status"
      style={{
        left: flip ? undefined : tip.x + 14,
        right: flip ? width - tip.x + 14 : undefined,
        top: Math.max(0, tip.y - 14),
      }}
    >
      {tip.lines.map((l, i) => (
        <div key={i}>
          <span className="tt-value">{l.value}</span>
          {l.label ? <span> {l.label}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** bar with 4px rounded data-end (right), square baseline (left) */
export function barPathH(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, w, h / 2);
  return `M${x},${y} h${w - rr} a${rr},${rr} 0 0 1 ${rr},${rr} v${h - 2 * rr} a${rr},${rr} 0 0 1 ${-rr},${rr} h${-(w - rr)} z`;
}

/** column with 4px rounded data-end (top), square baseline (bottom) */
export function barPathV(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} v${-(h - rr)} a${rr},${rr} 0 0 1 ${rr},${-rr} h${w - 2 * rr} a${rr},${rr} 0 0 1 ${rr},${rr} v${h - rr} z`;
}

/** deterministic pseudo-random in [-1, 1] from an integer seed (stable jitter) */
export function jitterOf(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** nice ticks for a linear axis — conventional 1/2/5/10 steps only */
export function niceTicks(lo: number, hi: number, target = 5): number[] {
  if (lo === hi) return [lo];
  const span = hi - lo;
  const rawStep = span / target;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? 10 * mag;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return ticks;
}

/**
 * Snap an axis domain to clean tick multiples so gridlines land on labeled
 * values and the plot edges are ticks themselves — no arbitrary bounds.
 */
export function niceDomain(
  values: number[],
  opts: { zero?: boolean; target?: number } = {}
): { lo: number; hi: number; ticks: number[] } {
  const target = opts.target ?? 5;
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (opts.zero) lo = Math.min(0, lo);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const rawStep = (hi - lo) / target;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? 10 * mag;
  lo = Math.floor(lo / step + 1e-9) * step;
  hi = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return { lo: Math.round(lo * 1000) / 1000, hi: Math.round(hi * 1000) / 1000, ticks };
}

/** integer-only ticks for count axes: 0 upward in 1/2/5/10·10^k steps */
export function countDomain(max: number, target = 4): { hi: number; ticks: number[] } {
  const m = Math.max(max, 1);
  const rawStep = m / target;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.max(
    1,
    [1, 2, 5, 10].map((x) => x * mag).find((s) => s >= rawStep) ?? 10 * mag
  );
  const hi = Math.ceil(m / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= hi; t += step) ticks.push(t);
  return { hi, ticks };
}

/** faint lines between major ticks; excludes the majors themselves */
export const MINOR_GRID = "#f4f4f4";
export function minorTicks(ticks: number[], divisions = 5): number[] {
  if (ticks.length < 2 || divisions < 2) return [];
  const step = ticks[1] - ticks[0];
  const out: number[] = [];
  for (let i = 0; i < ticks.length - 1; i++) {
    for (let d = 1; d < divisions; d++) out.push(ticks[i] + (step * d) / divisions);
  }
  return out;
}

export function extent(xs: number[], padFrac = 0.05): [number, number] {
  let lo = Math.min(...xs);
  let hi = Math.max(...xs);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * padFrac;
  return [lo - pad, hi + pad];
}
