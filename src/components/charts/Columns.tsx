"use client";

import {
  INK,
  GRID,
  AXIS,
  AXIS_TEXT,
  AXIS_TITLE_PROPS,
  barPathV,
  useMeasure,
  useTooltip,
  Tooltip,
  countDomain,
  minorTicks,
  MINOR_GRID,
} from "./common";

export interface ColumnDatum {
  label: string;
  count: number;
  detail?: string;
}

interface Props {
  data: ColumnDatum[];
  height?: number;
  /** show the count on each column cap (only sensible for few columns) */
  capLabels?: boolean;
  /** axis titles */
  xTitle?: string;
  yTitle?: string;
  /** show horizontal gridlines (the zero axis-line always draws) */
  grid?: boolean;
  gridMinor?: boolean;
}

const PAD_L = 46;
const PAD_R = 8;
const MAX_COL_W = 24; // dataviz spec: bars never thicker than 24px

export default function Columns({
  data,
  height = 200,
  capLabels,
  xTitle,
  yTitle,
  grid = true,
  gridMinor = false,
}: Props) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();

  const PAD_T = 12;
  const PAD_B = xTitle ? 40 : 24;

  const max = Math.max(...data.map((d) => d.count), 1);
  const { hi, ticks } = countDomain(max, 4);
  const plotW = Math.max(width - PAD_L - PAD_R, 40);
  const plotH = height - PAD_B - PAD_T;
  const slot = plotW / Math.max(data.length, 1);
  const colW = Math.min(slot - 2, MAX_COL_W); // ≥2px surface gap between columns
  const showCaps = capLabels && slot >= 18;
  // sparse x labels when columns are dense
  const labelEvery = Math.ceil(data.length / Math.floor(Math.max(plotW / 56, 2)));
  const sy = (t: number) => PAD_T + plotH - (t / hi) * plotH;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {width > 0 && (
        <svg className="chart-svg" width={width} height={height} role="img">
          {/* horizontal gridlines at every labeled tick, axis-line at zero */}
          {gridMinor &&
            (() => {
              // counts are integers: subdivide only where minors land on whole numbers
              const step = ticks.length > 1 ? ticks[1] - ticks[0] : 0;
              const div = step % 5 === 0 ? 5 : step % 2 === 0 ? 2 : 0;
              return minorTicks(ticks, div).map((t) => (
                <line
                  key={`m${t}`}
                  x1={PAD_L}
                  y1={sy(t)}
                  x2={width - PAD_R}
                  y2={sy(t)}
                  stroke={MINOR_GRID}
                  strokeWidth={1}
                />
              ));
            })()}
          {ticks.map((t) => (
            <g key={t}>
              {(grid || t === 0) && (
                <line
                  x1={PAD_L}
                  y1={sy(t)}
                  x2={width - PAD_R}
                  y2={sy(t)}
                  stroke={t === 0 ? AXIS : GRID}
                  strokeWidth={1}
                />
              )}
              <text x={PAD_L - 7} y={sy(t) + 3.5} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                {t}
              </text>
            </g>
          ))}
          {/* y axis line */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke={AXIS} strokeWidth={1} />
          {yTitle && (
            <text
              transform={`rotate(-90 12 ${PAD_T + plotH / 2})`}
              x={12}
              y={PAD_T + plotH / 2}
              textAnchor="middle"
              {...AXIS_TITLE_PROPS}
            >
              {yTitle}
            </text>
          )}
          {data.map((d, i) => {
            const h = (d.count / hi) * plotH;
            const x = PAD_L + i * slot + (slot - colW) / 2;
            const y = PAD_T + plotH - h;
            return (
              <g
                key={d.label}
                onPointerMove={(e) => {
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  show(e.clientX - r.left, e.clientY - r.top, [
                    { value: String(d.count), label: d.detail ?? d.label },
                  ]);
                }}
                onPointerLeave={hide}
              >
                <rect x={PAD_L + i * slot} y={PAD_T} width={slot} height={plotH + PAD_B} fill="transparent" />
                {d.count > 0 && <path d={barPathV(x, y, colW, h)} fill={INK[0]} />}
                {showCaps && d.count > 0 && (
                  <text
                    x={x + colW / 2}
                    y={y - 5}
                    textAnchor="middle"
                    fontSize={11}
                    fill={AXIS_TEXT}
                  >
                    {d.count}
                  </text>
                )}
                {i % labelEvery === 0 && (
                  <text
                    x={PAD_L + i * slot + slot / 2}
                    y={PAD_T + plotH + 15}
                    textAnchor="middle"
                    fontSize={11}
                    fill={AXIS_TEXT}
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          {xTitle && (
            <text
              x={PAD_L + plotW / 2}
              y={height - 7}
              textAnchor="middle"
              {...AXIS_TITLE_PROPS}
            >
              {xTitle}
            </text>
          )}
        </svg>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  );
}
