"use client";

import { INK, GRID, AXIS_TEXT, barPathH, useMeasure, useTooltip, Tooltip } from "./common";

export interface BarDatum {
  label: string;
  count: number;
  /** optional annotation shown in the tooltip (e.g. spelling variants) */
  detail?: string;
}

interface Props {
  data: BarDatum[];
  /** denominator for % readouts (defaults to sum of counts) */
  total?: number;
  totalLabel?: string;
  maxRows?: number;
}

const ROW_H = 26;
const BAR_H = 16;
const LABEL_W = 190;

export default function BarsH({ data, total, totalLabel = "of answers", maxRows = 40 }: Props) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();

  const shown = data.slice(0, maxRows);
  const hidden = data.length - shown.length;
  const denom = total ?? data.reduce((a, d) => a + d.count, 0);
  const max = Math.max(...shown.map((d) => d.count), 1);
  const chartW = Math.max(width - LABEL_W - 40, 60);
  const height = shown.length * ROW_H;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {width > 0 && (
        <svg className="chart-svg" width={width} height={height} role="img">
          {shown.map((d, i) => {
            const y = i * ROW_H;
            const w = Math.max((d.count / max) * chartW, 2);
            return (
              <g
                key={d.label}
                onPointerMove={(e) => {
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  show(e.clientX - r.left, e.clientY - r.top, [
                    { value: d.label },
                    { value: String(d.count), label: `· ${Math.round((d.count / denom) * 100)}% ${totalLabel}` },
                    ...(d.detail ? [{ value: "", label: d.detail }] : []),
                  ]);
                }}
                onPointerLeave={hide}
              >
                <rect x={0} y={y} width={width} height={ROW_H} fill="transparent" />
                <text
                  x={LABEL_W - 10}
                  y={y + ROW_H / 2 + 4}
                  textAnchor="end"
                  fontSize={12.5}
                  fontFamily="var(--serif)"
                  fill="var(--text-secondary)"
                >
                  {d.label.length > 28 ? d.label.slice(0, 27) + "…" : d.label}
                </text>
                <path d={barPathH(LABEL_W, y + (ROW_H - BAR_H) / 2, w, BAR_H)} fill={INK[0]} />
                <text
                  x={LABEL_W + w + 7}
                  y={y + ROW_H / 2 + 4}
                  fontSize={11.5}
                  fill={AXIS_TEXT}
                >
                  {d.count}
                </text>
              </g>
            );
          })}
          <line x1={LABEL_W} y1={0} x2={LABEL_W} y2={height} stroke={GRID} strokeWidth={1} />
        </svg>
      )}
      {hidden > 0 && (
        <div className="muted" style={{ fontSize: 13, fontStyle: "italic", marginTop: 4 }}>
          + {hidden} more
        </div>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  );
}
