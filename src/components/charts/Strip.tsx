"use client";

import { Field, fmtValue, median, cmToFtIn, axisLabel } from "@/lib/data";
import {
  INK,
  GRID,
  AXIS,
  AXIS_TEXT,
  AXIS_TITLE_PROPS,
  SURFACE,
  useMeasure,
  useTooltip,
  Tooltip,
  niceDomain,
  jitterOf,
} from "./common";

export interface StripRow {
  label: string;
  values: { v: number; resp: number }[];
}

interface Props {
  rows: StripRow[];
  numField: Field;
  rowH?: number;
}

const PAD_L = 150;
const PAD_R = 56;
const PAD_T = 6;
const PAD_B = 44;

export default function Strip({ rows, numField, rowH: rowHProp }: Props) {
  // few rows get more vertical room so the jittered dots can actually separate
  const rowH = rowHProp ?? (rows.length <= 3 ? 92 : rows.length <= 6 ? 64 : 44);
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();

  const all = rows.flatMap((r) => r.values.map((x) => x.v));
  if (all.length === 0) return null;
  const { lo, hi, ticks } = niceDomain(all, { target: 6 });
  const plotW = Math.max(width - PAD_L - PAD_R, 40);
  const height = PAD_T + rows.length * rowH + PAD_B;
  const sx = (v: number) => PAD_L + ((v - lo) / (hi - lo)) * plotW;

  const fmtPoint = (v: number) =>
    numField.id === "heightCm" ? `${fmtValue(numField, v)} (${cmToFtIn(v)})` : fmtValue(numField, v);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {width > 0 && (
        <svg className="chart-svg" width={width} height={height} role="img">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={sx(t)}
                y1={PAD_T}
                x2={sx(t)}
                y2={height - PAD_B}
                stroke={GRID}
                strokeWidth={1}
              />
              <text x={sx(t)} y={height - PAD_B + 15} textAnchor="middle" fontSize={12} fill={AXIS_TEXT}>
                {numField.kind === "date"
                  ? fmtValue(numField, t)
                  : Math.abs(t) >= 1000
                    ? `${Math.round(t / 100) / 10}k`
                    : Math.round(t * 100) / 100}
              </text>
            </g>
          ))}
          {/* bottom axis line + title */}
          <line
            x1={PAD_L}
            y1={height - PAD_B}
            x2={PAD_L + plotW}
            y2={height - PAD_B}
            stroke={AXIS}
            strokeWidth={1}
          />
          <text x={PAD_L + plotW / 2} y={height - 6} textAnchor="middle" {...AXIS_TITLE_PROPS}>
            {axisLabel(numField)}
          </text>
          {rows.map((row, i) => {
            const cy = PAD_T + i * rowH + rowH / 2;
            const med = row.values.length ? median(row.values.map((x) => x.v)) : null;
            return (
              <g key={row.label}>
                {i > 0 && (
                  <line
                    x1={0}
                    y1={PAD_T + i * rowH}
                    x2={width}
                    y2={PAD_T + i * rowH}
                    stroke={GRID}
                    strokeWidth={1}
                  />
                )}
                <text
                  x={PAD_L - 10}
                  y={cy - 2}
                  textAnchor="end"
                  fontSize={13.5}
                  fontFamily="var(--serif)"
                  fill="var(--text-secondary)"
                >
                  {row.label.length > 22 ? row.label.slice(0, 21) + "…" : row.label}
                </text>
                <text x={PAD_L - 10} y={cy + 12} textAnchor="end" fontSize={11.5} fill={AXIS_TEXT}>
                  n={row.values.length}
                </text>
                {row.values.map((p) => (
                  <circle
                    key={p.resp}
                    cx={sx(p.v)}
                    cy={cy + jitterOf(p.resp * 5 + i) * (rowH / 2 - 9)}
                    r={4.5}
                    fill={INK[0]}
                    opacity={0.7}
                    stroke={SURFACE}
                    strokeWidth={2}
                    style={{ pointerEvents: "none" }}
                  />
                ))}
                {/* invisible fat hit band per row for tooltips */}
                <rect
                  x={PAD_L}
                  y={PAD_T + i * rowH}
                  width={plotW + PAD_R}
                  height={rowH}
                  fill="transparent"
                  onPointerMove={(e) => {
                    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    const mx = e.clientX - rect.left;
                    // nearest value in this row
                    let best: { v: number; resp: number } | null = null;
                    let bestD = 26;
                    for (const p of row.values) {
                      const d = Math.abs(sx(p.v) - mx);
                      if (d < bestD) {
                        bestD = d;
                        best = p;
                      }
                    }
                    const lines = best
                      ? [{ value: fmtPoint(best.v), label: row.label.toLowerCase() }]
                      : med !== null
                        ? [{ value: fmtPoint(med), label: `median · ${row.label.toLowerCase()}` }]
                        : [];
                    if (lines.length) show(mx, e.clientY - rect.top, lines);
                  }}
                  onPointerLeave={hide}
                />
                {med !== null && (
                  <>
                    <line
                      x1={sx(med)}
                      y1={cy - rowH / 2 + 7}
                      x2={sx(med)}
                      y2={cy + rowH / 2 - 7}
                      stroke={INK[0]}
                      strokeWidth={2}
                    />
                    <text
                      x={width - 4}
                      y={cy + 4}
                      textAnchor="end"
                      fontSize={12}
                      fill={AXIS_TEXT}
                    >
                      {fmtValue(numField, med)}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <div className="muted" style={{ fontSize: 13.5, marginTop: 4, fontStyle: "italic" }}>
        thick tick &amp; right-hand figure = median per row
      </div>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}
