"use client";

import { Field, fmtValue, axisLabel, mean, countNoun } from "@/lib/data";
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
  minorTicks,
  MINOR_GRID,
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
  /** dashboard toggles */
  grid?: boolean;
  gridMinor?: boolean;
  showSd1?: boolean;
  showSd2?: boolean;
}

const PAD_L = 58;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 56;
const BOX_W = 26; // ±1σ box; ±2σ and min/max caps share this width

function sd(xs: number[], m: number): number {
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

/**
 * Aggregate box plot — deliberately shows no individual respondents.
 * Whiskers span min→max, the light band is mean±2σ, the dark box is mean±1σ,
 * the white line is the mean (σ ranges clamped to the observed min/max).
 */
export default function BucketBox({
  buckets,
  yField,
  xTitle,
  height = 380,
  grid = true,
  gridMinor = false,
  showSd1 = true,
  showSd2 = true,
}: Props) {
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
          {gridMinor &&
            minorTicks(ticks).map((t) => (
              <line
                key={`m${t}`}
                x1={PAD_L}
                y1={sy(t)}
                x2={width - PAD_R}
                y2={sy(t)}
                stroke={MINOR_GRID}
                strokeWidth={1}
              />
            ))}
          {ticks.map((t) => (
            <g key={t}>
              {grid && (
                <line x1={PAD_L} y1={sy(t)} x2={width - PAD_R} y2={sy(t)} stroke={GRID} strokeWidth={1} />
              )}
              <text x={PAD_L - 7} y={sy(t) + 3.5} textAnchor="end" fontSize={12.5} fill={AXIS_TEXT}>
                {fmtShort(t)}
              </text>
            </g>
          ))}
          {/* axis frame */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke={AXIS} strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={width - PAD_R} y2={PAD_T + plotH} stroke={AXIS} strokeWidth={1} />

          {stats.map((s, i) => {
            const cx = PAD_L + i * slot + slot / 2;
            // label baselines lift off the x-axis so a value of 0 never sits on the line
            const labelY = (v: number) => Math.min(sy(v) + 4, PAD_T + plotH - 5);
            const meanY = labelY(s.mean);
            const maxY = labelY(s.max);
            const minY = labelY(s.min);
            return (
              <g
                key={s.label}
                onPointerMove={(e) => {
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  show(e.clientX - r.left, e.clientY - r.top, [
                    { value: s.label, label: `· ${countNoun(s.n)}` },
                    { value: fmt(s.mean), label: "mean" },
                    { value: `±${fmt(s.sd)}`, label: "one σ" },
                    { value: `${fmt(s.min)} – ${fmt(s.max)}`, label: "min – max" },
                  ]);
                }}
                onPointerLeave={hide}
              >
                {/* hit area */}
                <rect x={PAD_L + i * slot} y={PAD_T} width={slot} height={plotH + PAD_B} fill="transparent" />
                {(() => {
                  // stems anchor at the outermost visible element
                  const top = showSd1 ? s.hi1 : s.mean;
                  const bot = showSd1 ? s.lo1 : s.mean;
                  const dotTop = showSd2 ? s.hi2 : top;
                  const dotBot = showSd2 ? s.lo2 : bot;
                  return (
                    <>
                      {/* ±1σ box first (light gray, no outline) so every line renders above it */}
                      {showSd1 && (
                        <rect
                          x={cx - BOX_W / 2}
                          y={sy(s.hi1)}
                          width={BOX_W}
                          height={Math.max(sy(s.lo1) - sy(s.hi1), 2)}
                          fill="#dcdcdc"
                          rx={2}
                        />
                      )}
                      {/* min/max: dotted stems, box-width caps */}
                      <line
                        x1={cx}
                        y1={sy(s.max)}
                        x2={cx}
                        y2={sy(dotTop)}
                        stroke={INK[0]}
                        strokeWidth={1.5}
                        strokeDasharray="1.5 3.5"
                        strokeLinecap="round"
                      />
                      <line
                        x1={cx}
                        y1={sy(dotBot)}
                        x2={cx}
                        y2={sy(s.min)}
                        stroke={INK[0]}
                        strokeWidth={1.5}
                        strokeDasharray="1.5 3.5"
                        strokeLinecap="round"
                      />
                      <line x1={cx - BOX_W / 2} y1={sy(s.max)} x2={cx + BOX_W / 2} y2={sy(s.max)} stroke={INK[0]} strokeWidth={1.25} />
                      <line x1={cx - BOX_W / 2} y1={sy(s.min)} x2={cx + BOX_W / 2} y2={sy(s.min)} stroke={INK[0]} strokeWidth={1.25} />
                      {/* ±2σ: solid stems, box-width caps */}
                      {showSd2 && (
                        <>
                          <line x1={cx} y1={sy(s.hi2)} x2={cx} y2={sy(top)} stroke={INK[0]} strokeWidth={2} />
                          <line x1={cx} y1={sy(bot)} x2={cx} y2={sy(s.lo2)} stroke={INK[0]} strokeWidth={2} />
                          <line x1={cx - BOX_W / 2} y1={sy(s.hi2)} x2={cx + BOX_W / 2} y2={sy(s.hi2)} stroke={INK[0]} strokeWidth={2} />
                          <line x1={cx - BOX_W / 2} y1={sy(s.lo2)} x2={cx + BOX_W / 2} y2={sy(s.lo2)} stroke={INK[0]} strokeWidth={2} />
                        </>
                      )}
                    </>
                  );
                })()}
                {/* mean line + label */}
                <line
                  x1={cx - BOX_W / 2}
                  y1={sy(s.mean)}
                  x2={cx + BOX_W / 2}
                  y2={sy(s.mean)}
                  stroke={INK[0]}
                  strokeWidth={2}
                />
                <text
                  x={cx + BOX_W / 2 + 7}
                  y={meanY}
                  fontSize={13}
                  fontWeight={600}
                  fill="#171717"
                  className="tnum"
                >
                  {fmtShort(s.mean)}
                </text>
                {/* min / max labels — same column and size as the mean; skipped when
                    they'd collide with the mean label (values stay in the tooltip/table) */}
                {Math.abs(maxY - meanY) > 13 && (
                  <text x={cx + BOX_W / 2 + 7} y={maxY} fontSize={13} fill="#404040" className="tnum">
                    {fmtShort(s.max)}
                  </text>
                )}
                {Math.abs(minY - meanY) > 13 && (
                  <text x={cx + BOX_W / 2 + 7} y={minY} fontSize={13} fill="#404040" className="tnum">
                    {fmtShort(s.min)}
                  </text>
                )}
                {/* bucket label + n */}
                <text x={cx} y={PAD_T + plotH + 16} textAnchor="middle" fontSize={13} fill="#171717">
                  {s.label.length > 14 ? s.label.slice(0, 13) + "…" : s.label}
                </text>
                <text x={cx} y={PAD_T + plotH + 29} textAnchor="middle" fontSize={11.5} fill={AXIS_TEXT}>
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
      <div className="secondary" style={{ fontSize: 14, marginTop: 6 }}>
        {showSd1 ? (
          <>
            <svg width={11} height={13} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }}>
              <rect x={2} y={1.5} width={7} height={10} fill="#dcdcdc" rx={1} />
              <line x1={2} y1={6.5} x2={9} y2={6.5} stroke="#171717" strokeWidth={1.5} />
            </svg>
            box = mean ± 1σ, black line = mean&ensp;·&ensp;
          </>
        ) : (
          <>
            <svg width={11} height={13} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }}>
              <line x1={2} y1={6.5} x2={9} y2={6.5} stroke="#171717" strokeWidth={2} />
            </svg>
            black line = mean&ensp;·&ensp;
          </>
        )}
        {showSd2 && (
          <>
            <svg width={11} height={13} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }}>
              <line x1={5.5} y1={1} x2={5.5} y2={12} stroke="#171717" strokeWidth={2} />
              <line x1={1} y1={1} x2={10} y2={1} stroke="#171717" strokeWidth={2} />
              <line x1={1} y1={12} x2={10} y2={12} stroke="#171717" strokeWidth={2} />
            </svg>
            solid line = ± 2σ&ensp;·&ensp;
          </>
        )}
        <svg width={11} height={13} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }}>
          <line
            x1={5.5}
            y1={1.5}
            x2={5.5}
            y2={11.5}
            stroke="#171717"
            strokeWidth={1.5}
            strokeDasharray="1.5 3"
            strokeLinecap="round"
          />
        </svg>
        dotted = min–max
      </div>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}
