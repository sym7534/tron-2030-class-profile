"use client";

import { Field, binsFor, fmtValue, mean, median, axisLabel } from "@/lib/data";
import Columns from "./Columns";

interface Props {
  field: Field;
  values: number[];
  height?: number;
  grid?: boolean;
  gridMinor?: boolean;
}

function stddev(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

export default function Histogram({ field, values, height, grid = true, gridMinor = false }: Props) {
  if (values.length === 0) return null;
  const bins = binsFor(field, values);
  const data = bins.map((b) => ({
    label: b.label,
    count: b.count,
    detail:
      b.x0 === b.x1
        ? fmtValue(field, b.x0)
        : `${fmtValue(field, b.x0)} – ${fmtValue(field, b.x1)}`,
  }));
  const sd = stddev(values);
  const xTitle = axisLabel(field);
  return (
    <div>
      <Columns
        data={data}
        height={height}
        capLabels={bins.length <= 13}
        grid={grid}
        gridMinor={gridMinor}
        xTitle={xTitle}
        yTitle="people"
      />
      <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        median <span className="tnum">{fmtValue(field, median(values))}</span> · mean{" "}
        <span className="tnum">{fmtValue(field, mean(values))}</span> · σ{" "}
        <span className="tnum">{fmtValue(field, sd)}</span> · range{" "}
        <span className="tnum">
          {fmtValue(field, Math.min(...values))}–{fmtValue(field, Math.max(...values))}
        </span>
      </div>
    </div>
  );
}
