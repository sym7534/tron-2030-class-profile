"use client";

import { Field, fmtValue, axisLabel, mean } from "@/lib/data";
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
} from "./common";

export interface Bucket {
  label: string;
  values: number[];
}

interface Props {
  buckets: Bucket[];
  yField: Field;
  xTitle: string;
  height?: number;
}

const PAD_L = 58;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 46;
const BOX_W = 26; // ±1σ box
const BAND_W = 12; // ±2σ band
const CAP_W = 10; // whisker end caps

function sd(xs: number[], m: number): number {
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

/**
 * Aggregate box plot — deliberately shows no individual respondents.
 * Whiskers span min→max, the light band is mean±2σ, the dark box is mean±1σ,
 * the white line is the mean (σ ranges clamped to the observed min/max).
 */
export default function BucketBox({ buckets, yField, xTitle, height = 380 }: Props) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();

  const stats = buckets.map((b) => {
    const m = mean(b.values);
    const s = sd(b.values, m);
    const min = Math.min(...b.values);
    const max = Math.max(...b.values);
    return {
      label: b.label,
      n: b.values.length,
      mean: m,
      sd: s,
      min,
      max,
      lo1: Math.max(min, m - s),
      hi1: Math.min(max, m + s),
      lo2: Math.max(min, m - 2 * s),
      hi2: Math.min(max, m + 2 * s),
    };
  });
  if (stats.length === 0) return null;

  const all = stats.flatMap((s) => [s.min, s.max]);
  const { lo, hi, ticks } = niceDomain(all, { target: 5 });
  const plotW = Math.max(width - PAD_L - PAD_R, 40);
  const plotH = height - PAD_T - PAD_B;
  const slot = plotW / stats.length;
  const sy = (v: number) => PAD_T + plotH - ((v - lo) / (hi - lo)) * plotH;
  const fmt = (v: number) => fmtValue(yField, v);
  const fmtShort = (v: number) =>
    Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {width > 0 && (
        <svg className="chart-svg" width={width} height={height} role="img">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} y1={sy(t)} x2={width - PAD_R} y2={sy(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD_L - 7} y={sy(t) + 3.5} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                {fmtShort(t)}
              </text>
            </g>
          ))}
          {/* axis frame */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke={AXIS} strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={width - PAD_R} y2={PAD_T + plotH} stroke={AXIS} strokeWidth={1} />

          {stats.map((s, i) => {
            const cx = PAD_L + i * slot + slot / 2;
            return (
              <g
                key={s.label}
                onPointerMove={(e) => {
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  show(e.clientX - r.left, e.clientY - r.top, [
                    { value: s.label, label: `· ${s.n} people` },
                    { value: fmt(s.mean), label: "mean" },
                    { value: `±${fmt(s.sd)}`, label: "one σ" },
                    { value: `${fmt(s.min)} – ${fmt(s.max)}`, label: "min – max" },
                  ]);
                }}
                onPointerLeave={hide}
              >
                {/* hit area */}
                <rect x={PAD_L + i * slot} y={PAD_T} width={slot} height={plotH + PAD_B} fill="transparent" />
                {/* whisker: min → max with caps */}
                <line x1={cx} y1={sy(s.max)} x2={cx} y2={sy(s.min)} stroke={INK[1]} strokeWidth={1.5} />
                <line x1={cx - CAP_W / 2} y1={sy(s.max)} x2={cx + CAP_W / 2} y2={sy(s.max)} stroke={INK[1]} strokeWidth={1.5} />
                <line x1={cx - CAP_W / 2} y1={sy(s.min)} x2={cx + CAP_W / 2} y2={sy(s.min)} stroke={INK[1]} strokeWidth={1.5} />
                {/* ±2σ band (lighter, narrower) */}
                <rect
                  x={cx - BAND_W / 2}
                  y={sy(s.hi2)}
                  width={BAND_W}
                  height={Math.max(sy(s.lo2) - sy(s.hi2), 1)}
                  fill={INK[3]}
                />
                {/* ±1σ box (dark) */}
                <rect
                  x={cx - BOX_W / 2}
                  y={sy(s.hi1)}
                  width={BOX_W}
                  height={Math.max(sy(s.lo1) - sy(s.hi1), 2)}
                  fill={INK[0]}
                  rx={3}
                />
                {/* mean line + label */}
                <line
                  x1={cx - BOX_W / 2}
                  y1={sy(s.mean)}
                  x2={cx + BOX_W / 2}
                  y2={sy(s.mean)}
                  stroke={SURFACE}
                  strokeWidth={2}
                />
                <text x={cx + BOX_W / 2 + 6} y={sy(s.mean) + 4} fontSize={11.5} fill="#171717" className="tnum">
                  {fmtShort(s.mean)}
                </text>
                {/* min / max labels */}
                <text x={cx + CAP_W / 2 + 5} y={sy(s.max) + 3.5} fontSize={10.5} fill={AXIS_TEXT}>
                  {fmtShort(s.max)}
                </text>
                <text x={cx + CAP_W / 2 + 5} y={sy(s.min) + 3.5} fontSize={10.5} fill={AXIS_TEXT}>
                  {fmtShort(s.min)}
                </text>
                {/* bucket label + n */}
                <text x={cx} y={PAD_T + plotH + 15} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
                  {s.label.length > 14 ? s.label.slice(0, 13) + "…" : s.label}
                </text>
                <text x={cx} y={PAD_T + plotH + 27} textAnchor="middle" fontSize={9.5} fill={AXIS_TEXT}>
                  n={s.n}
                </text>
              </g>
            );
          })}
          <text x={PAD_L + plotW / 2} y={height - 4} textAnchor="middle" {...AXIS_TITLE_PROPS}>
            {xTitle}
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
        </svg>
      )}
      <div className="muted" style={{ fontSize: 12.5, marginTop: 4, fontStyle: "italic" }}>
        dark box = mean ±1σ (white line = mean) · light band = ±2σ · whiskers = min/max
      </div>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}
