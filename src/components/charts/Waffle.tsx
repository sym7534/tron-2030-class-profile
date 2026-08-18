"use client";

import { useMeasure, useTooltip, Tooltip } from "./common";

export interface WaffleGroup {
  label: string;
  count: number;
}

interface Props {
  groups: WaffleGroup[];
  /** total dots; defaults to sum of group counts */
  total?: number;
  /** dots per row; auto if omitted */
  perRow?: number;
  dot?: number;
  gap?: number;
  legend?: boolean;
}

const SHADES = ["#171717", "#6e6e6e", "#a8a8a8", "#d0d0d0", "#ececec"];

/** one dot per respondent: the signature motif */
export default function Waffle({
  groups,
  total,
  perRow,
  dot = 9,
  gap = 6,
  legend = true,
}: Props) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();

  const sum = groups.reduce((a, g) => a + g.count, 0);
  const n = total ?? sum;
  const step = dot + gap;
  const cols = perRow ?? Math.max(1, Math.min(n, Math.floor((width || 400) / step)));
  const rows = Math.ceil(n / cols);
  const height = rows * step;

  // flatten groups into a dot sequence
  const seq: { g: number; label: string }[] = [];
  groups.forEach((g, gi) => {
    for (let i = 0; i < g.count; i++) seq.push({ g: gi, label: g.label });
  });
  while (seq.length < n) seq.push({ g: -1, label: "no answer" });

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {width > 0 && (
        <svg className="chart-svg" width={width} height={height} role="img">
          {seq.map((d, i) => {
            const cx = (i % cols) * step + dot / 2;
            const cy = Math.floor(i / cols) * step + dot / 2;
            const isNone = d.g === -1;
            const grp = groups[d.g];
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={dot / 2}
                fill={isNone ? "#ffffff" : SHADES[d.g % SHADES.length]}
                stroke={isNone ? "#d4d4d4" : "none"}
                strokeWidth={1}
                onPointerMove={(e) => {
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  show(e.clientX - r.left, e.clientY - r.top, [
                    {
                      value: isNone ? "no answer" : String(grp.count),
                      label: isNone ? "" : `${grp.label} \u00B7 ${Math.round((grp.count / n) * 100)}%`,
                    },
                  ]);
                }}
                onPointerLeave={hide}
              />
            );
          })}
        </svg>
      )}
      {legend && (
        <div className="waffle-legend">
          {groups.map((g, i) => (
            <span key={g.label} className="waffle-key">
              <span
                className="waffle-swatch"
                style={{ background: SHADES[i % SHADES.length] }}
              />
              {g.label}{" "}
              <span className="tnum muted">
                {g.count} &middot; {Math.round((g.count / n) * 100)}%
              </span>
            </span>
          ))}
        </div>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

