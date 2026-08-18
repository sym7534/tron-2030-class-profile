"use client";

import { useMeasure, useTooltip, Tooltip, SURFACE } from "./common";

export interface PieDatum {
  label: string;
  count: number;
}

interface Props {
  data: PieDatum[];
  /** denominator for %; defaults to sum of counts */
  total?: number;
  size?: number;
}

/** monochrome shade ramp, darkest = biggest slice (data sorted by count) */
const SHADES = ["#171717", "#5c5c5c", "#8f8f8f", "#b8b8b8", "#d7d7d7", "#ececec"];

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  // full circle can't be drawn with one arc — split it
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    return (
      `M ${cx} ${cy - r} ` +
      `A ${r} ${r} 0 1 1 ${cx} ${cy + r} ` +
      `A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`
    );
  }
  const x0 = cx + r * Math.sin(a0);
  const y0 = cy - r * Math.cos(a0);
  const x1 = cx + r * Math.sin(a1);
  const y1 = cy - r * Math.cos(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

export default function Pie({ data, total, size = 210 }: Props) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();

  const sorted = [...data].sort((a, b) => b.count - a.count);
  const sum = sorted.reduce((a, d) => a + d.count, 0);
  const denom = total ?? sum;
  if (sum === 0) return null;

  const r = size / 2 - 6;
  const cx = size / 2;
  const cy = size / 2;

  let angle = 0;
  const slices = sorted.map((d, i) => {
    const a0 = angle;
    const frac = d.count / sum;
    angle += frac * Math.PI * 2;
    const mid = (a0 + angle) / 2;
    return { ...d, a0, a1: angle, mid, frac, shade: SHADES[Math.min(i, SHADES.length - 1)] };
  });

  return (
    <div ref={ref} data-pie style={{ position: "relative" }}>
      <div className="pie-layout">
        <svg
          className="chart-svg pie-svg"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
        >
          {slices.map((s) => (
            <path
              key={s.label}
              d={arcPath(cx, cy, r, s.a0, s.a1)}
              fill={s.shade}
              stroke={SURFACE}
              strokeWidth={2}
              onPointerMove={(e) => {
                const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement)
                  .closest("[data-pie]")!
                  .getBoundingClientRect();
                show(e.clientX - rect.left, e.clientY - rect.top, [
                  { value: s.label },
                  {
                    value: String(s.count),
                    label: `· ${Math.round((s.count / denom) * 100)}%`,
                  },
                ]);
              }}
              onPointerLeave={hide}
            />
          ))}
          {/* % labels on slices big enough to hold them */}
          {slices
            .filter((s) => s.frac >= 0.08)
            .map((s) => {
              const lr = r * 0.62;
              const x = cx + lr * Math.sin(s.mid);
              const y = cy - lr * Math.cos(s.mid);
              const dark = ["#171717", "#5c5c5c"].includes(s.shade);
              return (
                <text
                  key={s.label}
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={600}
                  fill={dark ? "#ffffff" : "#171717"}
                  style={{ pointerEvents: "none" }}
                >
                  {Math.round(s.frac * 100)}%
                </text>
              );
            })}
        </svg>
        <div className="pie-legend">
          {slices.map((s) => (
            <div key={s.label} className="pie-key">
              <span className="pie-swatch" style={{ background: s.shade }} />
              <span className="pie-key-label">{s.label}</span>{" "}
              <span className="tnum muted">
                {s.count} · {Math.round((s.count / denom) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}
