"use client";

import { Field, binsFor, fmtValue, axisLabel } from "@/lib/data";
import Columns from "./Columns";

interface Props {
  field: Field;
  values: number[];
  height?: number;
  grid?: boolean;
  gridMinor?: boolean;
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
    </div>
  );
}
