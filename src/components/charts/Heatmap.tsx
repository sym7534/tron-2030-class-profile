"use client";

import { useState } from "react";
import { AXIS_TEXT, SURFACE, useMeasure, useTooltip, Tooltip } from "./common";

export interface HeatCell {
  x: string;
  y: string;
  count: number;
}

interface Props {
  xLabels: string[];
  yLabels: string[];
  cells: HeatCell[];
  height?: number;
}

const PAD_L = 132;
const PAD_B = 64;
const PAD_T = 6;
const PAD_R = 8;

/** sequential gray fill: 0 -> white, max -> near-black */
function fill(t: number): string {
  const l = Math.round(255 - t * 232); // 255 → 23
  return `rgb(${l},${l},${l})`;
}

export default function Heatmap({ xLabels, yLabels, cells, height }: Props) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();
  const [mode, setMode] = useState<"count" | "row">("count");

  const map = new Map<string, number>();
  for (const c of cells) map.set(c.x + "\u0000" + c.y, c.count);
  const rowTotals = new Map<string, number>();
  for (const y of yLabels) {
    rowTotals.set(
      y,
      xLabels.reduce((a, x) => a + (map.get(x + "\u0000" + y) ?? 0), 0)
    );
  }

  const value = (x: string, y: string) => {
    const c = map.get(x + "\u0000" + y) ?? 0;
    if (mode === "count") return c;
    const t = rowTotals.get(y) ?? 0;
    return t === 0 ? 0 : (c / t) * 100;
  };
  const max = Math.max(
    ...xLabels.flatMap((x) => yLabels.map((y) => value(x, y))),
    mode === "count" ? 1 : 1
  );

  const rowH = Math.max(26, Math.min(40, 320 / Math.max(yLabels.length, 1)));
  const h = height ?? PAD_T + yLabels.length * rowH + PAD_B;
  const plotW = Math.max(width - PAD_L - PAD_R, 40);
  const colW = plotW / Math.max(xLabels.length, 1);

  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "\u2026" : s);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {width > 0 && (
        <svg className="chart-svg" width={width} height={h} role="img">
          {yLabels.map((y, j) =>
            xLabels.map((x, i) => {
              const raw = map.get(x + "\u0000" + y) ?? 0;
              const v = value(x, y);
              const cx = PAD_L + i * colW;
              const cy = PAD_T + j * rowH;
              return (
                <g
                  key={x + y}
                  onPointerMove={(e) => {
                    const r = (
                      e.currentTarget.ownerSVGElement as SVGSVGElement
                    ).getBoundingClientRect();
                    show(e.clientX - r.left, e.clientY - r.top, [
                      { value: String(raw), label: raw === 1 ? "respondent" : "respondents" },
                      { value: "", label: `${y} \u00B7 ${x}` },
                      ...(mode === "row"
                        ? [{ value: `${Math.round(v)}%`, label: "of this row" }]
                        : []),
                    ]);
                  }}
                  onPointerLeave={hide}
                >
                  <rect
                    x={cx + 1}
                    y={cy + 1}
                    width={Math.max(colW - 2, 1)}
                    height={rowH - 2}
                    fill={fill(max === 0 ? 0 : v / max)}
                    stroke="#ececec"
                    strokeWidth={1}
                    rx={2}
                  />
                  {raw > 0 && colW > 26 && (
                    <text
                      x={cx + colW / 2}
                      y={cy + rowH / 2 + 4}
                      textAnchor="middle"
                      fontSize={11}
                      fill={v / max > 0.55 ? SURFACE : "#171717"}
                    >
                      {mode === "count" ? raw : `${Math.round(v)}`}
                    </text>
                  )}
                </g>
              );
            })
          )}
          {yLabels.map((y, j) => (
            <text
              key={`y${y}`}
              x={PAD_L - 8}
              y={PAD_T + j * rowH + rowH / 2 + 4}
              textAnchor="end"
              fontSize={12}
              fontFamily="var(--serif)"
              fill="var(--text-secondary)"
            >
              {clip(y, 20)}
            </text>
          ))}
          {xLabels.map((x, i) => (
            <text
              key={`x${x}`}
              x={PAD_L + i * colW + colW / 2}
              y={PAD_T + yLabels.length * rowH + 12}
              textAnchor="end"
              fontSize={11}
              fill={AXIS_TEXT}
              transform={`rotate(-40 ${PAD_L + i * colW + colW / 2} ${
                PAD_T + yLabels.length * rowH + 12
              })`}
            >
              {clip(x, 16)}
            </text>
          ))}
        </svg>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "baseline" }}>
        <span className="muted" style={{ fontSize: 13 }}>
          darker = more &middot;
        </span>
        <button
          onClick={() => setMode("count")}
          className={mode === "count" ? "toggle-active" : undefined}
        >
          counts
        </button>
        <button
          onClick={() => setMode("row")}
          className={mode === "row" ? "toggle-active" : undefined}
        >
          row %
        </button>
      </div>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}
