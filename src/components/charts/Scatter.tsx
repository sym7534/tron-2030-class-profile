"use client";

import { Field, fmtValue, linreg, cmToFtIn, axisLabel } from "@/lib/data";
import {
  INK,
  GRID,
  AXIS,
  AXIS_TITLE_PROPS,
  AXIS_TEXT,
  SURFACE,
  useMeasure,
  useTooltip,
  Tooltip,
  niceDomain,
  jitterOf,
} from "./common";
import { useMemo, useState } from "react";

export interface ScatterPoint {
  x: number;
  y: number;
  resp: number;
}

interface Props {
  points: ScatterPoint[];
  xField: Field;
  yField: Field;
  height?: number;
  /** draw the y = x reference line (same-unit axes) */
  identity?: boolean;
  trend?: boolean;
}

const PAD_L = 58;
const PAD_B = 46;
const PAD_T = 12;
const PAD_R = 14;

function fmtAxis(f: Field, v: number): string {
  if (f.kind === "date") return fmtValue(f, v);
  return Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 100) / 100);
}

export default function Scatter({ points, xField, yField, height = 320, identity, trend = true }: Props) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();
  const [hover, setHover] = useState<number | null>(null);

  // deterministic jitter on integer scales so stacked respondents separate
  const jx = xField.intScale ? 0.18 : 0;
  const jy = yField.intScale ? 0.18 : 0;
  const jittered = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        px: p.x + jx * jitterOf(p.resp * 2 + 1),
        py: p.y + jy * jitterOf(p.resp * 3 + 2),
      })),
    [points, jx, jy]
  );

  if (points.length === 0) return null;

  // axis domains snapped to clean tick multiples: gridlines land on labeled
  // values and the plot edges are ticks themselves — no arbitrary bounds
  const xd = niceDomain(jittered.map((p) => p.px), { target: 6 });
  const yd = niceDomain(jittered.map((p) => p.py), { target: 5 });
  const xLo = xd.lo, xHi = xd.hi;
  const yLo = yd.lo, yHi = yd.hi;
  const xTicks = xd.ticks;
  const yTicks = yd.ticks;
  const plotW = Math.max(width - PAD_L - PAD_R, 40);
  const plotH = height - PAD_T - PAD_B;
  const sx = (v: number) => PAD_L + ((v - xLo) / (xHi - xLo)) * plotW;
  const sy = (v: number) => PAD_T + plotH - ((v - yLo) / (yHi - yLo)) * plotH;

  const pairs: [number, number][] = points.map((p) => [p.x, p.y]);
  const reg = trend ? linreg(pairs) : null;

  const nearest = (mx: number, my: number) => {
    let best: (typeof jittered)[number] | null = null;
    let bestD = 24 * 24;
    for (const p of jittered) {
      const d = (sx(p.px) - mx) ** 2 + (sy(p.py) - my) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  };

  const fmtPoint = (f: Field, v: number) =>
    f.id === "heightCm" ? `${fmtValue(f, v)} (${cmToFtIn(v)})` : fmtValue(f, v);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {width > 0 && (
        <svg
          className="chart-svg"
          width={width}
          height={height}
          role="img"
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const p = nearest(mx, my);
            if (p) {
              setHover(p.resp);
              show(sx(p.px), sy(p.py), [
                { value: fmtPoint(xField, p.x), label: xField.short.toLowerCase() },
                { value: fmtPoint(yField, p.y), label: yField.short.toLowerCase() },
              ]);
            } else {
              setHover(null);
              hide();
            }
          }}
          onPointerLeave={() => {
            setHover(null);
            hide();
          }}
        >
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={PAD_L} y1={sy(t)} x2={width - PAD_R} y2={sy(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD_L - 7} y={sy(t) + 3.5} textAnchor="end" fontSize={12} fill={AXIS_TEXT}>
                {fmtAxis(yField, t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={`x${t}`}>
              <line x1={sx(t)} y1={PAD_T} x2={sx(t)} y2={PAD_T + plotH} stroke={GRID} strokeWidth={1} />
              <text x={sx(t)} y={PAD_T + plotH + 15} textAnchor="middle" fontSize={12} fill={AXIS_TEXT}>
                {fmtAxis(xField, t)}
              </text>
            </g>
          ))}
          {/* axis frame: left + bottom */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke={AXIS} strokeWidth={1} />
          <line
            x1={PAD_L}
            y1={PAD_T + plotH}
            x2={width - PAD_R}
            y2={PAD_T + plotH}
            stroke={AXIS}
            strokeWidth={1}
          />
          {/* axis titles with units */}
          <text x={PAD_L + plotW / 2} y={height - 6} textAnchor="middle" {...AXIS_TITLE_PROPS}>
            {axisLabel(xField)}
          </text>
          <text
            transform={`rotate(-90 13 ${PAD_T + plotH / 2})`}
            x={13}
            y={PAD_T + plotH / 2}
            textAnchor="middle"
            {...AXIS_TITLE_PROPS}
          >
            {axisLabel(yField)}
          </text>
          {identity &&
            (() => {
              const lo = Math.max(xLo, yLo);
              const hi = Math.min(xHi, yHi);
              if (lo >= hi) return null;
              return (
                <line
                  x1={sx(lo)}
                  y1={sy(lo)}
                  x2={sx(hi)}
                  y2={sy(hi)}
                  stroke={INK[2]}
                  strokeWidth={1}
                />
              );
            })()}
          {reg && (
            <line
              x1={sx(xLo)}
              y1={sy(reg.intercept + reg.slope * xLo)}
              x2={sx(xHi)}
              y2={sy(reg.intercept + reg.slope * xHi)}
              stroke={INK[1]}
              strokeWidth={1.5}
            />
          )}
          {jittered.map((p, i) => (
            <circle
              key={i}
              cx={sx(p.px)}
              cy={sy(p.py)}
              r={hover === p.resp ? 6 : 4.5}
              fill={INK[0]}
              stroke={SURFACE}
              strokeWidth={2}
              opacity={hover === null || hover === p.resp ? 0.85 : 0.35}
            />
          ))}
        </svg>
      )}
      <div className="muted" style={{ fontSize: 13.5, marginTop: 4, fontStyle: "italic" }}>
        {identity && <>thin gray line is y = x</>}
        {identity && (jx > 0 || jy > 0) && <> &middot; </>}
        {(jx > 0 || jy > 0) && <>dots nudged apart where answers overlap</>}
      </div>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}
