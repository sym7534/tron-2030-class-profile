"use client";

import { Field, binsFor, fmtValue, mean, median } from "@/lib/data";
import Columns from "./Columns";

interface Props {
  field: Field;
  values: number[];
  height?: number;
}

export default function Histogram({ field, values, height }: Props) {
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
  return (
    <div>
      <Columns data={data} height={height} capLabels={bins.length <= 13} />
      <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        median <span className="tnum">{fmtValue(field, median(values))}</span> · mean{" "}
        <span className="tnum">{fmtValue(field, mean(values))}</span> · range{" "}
        <span className="tnum">
          {fmtValue(field, Math.min(...values))}–{fmtValue(field, Math.max(...values))}
        </span>
      </div>
    </div>
  );
}
