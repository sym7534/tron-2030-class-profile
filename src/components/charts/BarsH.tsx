"use client";

import {
  GRID,
  AXIS,
  AXIS_TEXT,
  AXIS_TITLE_PROPS,
  purpleScale,
  barPathH,
  useMeasure,
  useTooltip,
  Tooltip,
  countDomain,
} from "./common";

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
const PAD_R = 34;
const AXIS_H = 30; // bottom: tick labels + axis title

export default function BarsH({ data, total, totalLabel = "of answers", maxRows = 40 }: Props) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();

  const shown = data.slice(0, maxRows);
  const hidden = data.length - shown.length;
  const denom = total ?? data.reduce((a, d) => a + d.count, 0);
  const max = Math.max(...shown.map((d) => d.count), 1);
  const { hi, ticks } = countDomain(max, 4);
  const shadeFor = purpleScale(shown.map((d) => d.count));
  const chartW = Math.max(width - LABEL_W - PAD_R, 60);
  const rowsH = shown.length * ROW_H;
  const height = rowsH + AXIS_H;
  const sx = (t: number) => LABEL_W + (t / hi) * chartW;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {width > 0 && (
        <svg className="chart-svg" width={width} height={height} role="img">
          {/* vertical gridlines at labeled count increments */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={sx(t)}
                y1={0}
                x2={sx(t)}
                y2={rowsH}
                stroke={t === 0 ? AXIS : GRID}
                strokeWidth={1}
              />
              <text
                x={sx(t)}
                y={rowsH + 13}
                textAnchor="middle"
                fontSize={12}
                fill={AXIS_TEXT}
              >
                {t}
              </text>
            </g>
          ))}
          {shown.map((d, i) => {
            const y = i * ROW_H;
            const w = Math.max((d.count / hi) * chartW, d.count > 0 ? 2 : 0);
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
                  fontSize={13.5}
                  fontFamily="var(--serif)"
                  fill="var(--text-secondary)"
                >
                  {d.label.length > 24 ? d.label.slice(0, 23) + "…" : d.label}
                </text>
                {d.count > 0 && (
                  <path
                    d={barPathH(LABEL_W, y + (ROW_H - BAR_H) / 2, w, BAR_H)}
                    fill={shadeFor(d.count)}
                  />
                )}
                <text
                  x={LABEL_W + w + 7}
                  y={y + ROW_H / 2 + 4}
                  fontSize={12.5}
                  fill={AXIS_TEXT}
                >
                  {d.count}
                </text>
              </g>
            );
          })}
          <text x={LABEL_W + chartW / 2} y={height - 3} textAnchor="middle" {...AXIS_TITLE_PROPS}>
            number of people
          </text>
        </svg>
      )}
      {hidden > 0 && (
        <div className="muted" style={{ fontSize: 14, fontStyle: "italic", marginTop: 4 }}>
          + {hidden} more
        </div>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  );
}
