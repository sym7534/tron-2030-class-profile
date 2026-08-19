"use client";

import { useMemo, useState } from "react";
import { Field, fieldById, survey, numericOf, axisLabel } from "@/lib/data";
import { numericBuckets, categoryBuckets, bucketTable } from "@/lib/buckets";
import BucketBox from "./charts/BucketBox";

export interface ComparisonSpec {
  /** y-axis: the numeric being compared */
  y: string;
  /** x-axis: numeric (bucketed) or categorical (grouped) */
  x: string;
  /** card heading, e.g. "Hourly pay vs. type of job" */
  title: string;
  /** optional one-line note under the heading */
  note?: string;
}

const isNum = (f: Field) => f.kind === "numeric" || f.kind === "date";

/**
 * A cross-question comparison, presented with the same chrome as the
 * single-question cards: heading, n readout, aggregate chart, table twin.
 */
export default function ComparisonCard({ spec }: { spec: ComparisonSpec }) {
  const [showTable, setShowTable] = useState(false);
  const xf = fieldById[spec.x];
  const yf = fieldById[spec.y];

  const { buckets, n, pooled } = useMemo(() => {
    if (isNum(xf)) {
      const pairs = survey.rows
        .map((r) => {
          const x = numericOf(r, xf);
          const y = numericOf(r, yf);
          return x !== null && y !== null ? { x, y } : null;
        })
        .filter((p): p is { x: number; y: number } => p !== null);
      return { buckets: numericBuckets(pairs, xf), n: pairs.length, pooled: false };
    }
    const { buckets, pooled } = categoryBuckets(xf, yf);
    return {
      buckets,
      n: buckets.reduce((a, b) => a + b.values.length, 0),
      pooled,
    };
  }, [xf, yf]);

  if (buckets.length === 0) return null;
  const table = bucketTable(buckets, yf);

  return (
    <article
      id={`cmp-${spec.y}-${spec.x}`}
      style={{
        borderTop: "1px solid var(--border-card)",
        paddingTop: 14,
        breakInside: "avoid",
      }}
    >
      <header
        style={{
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 400, lineHeight: 1.35 }}>{spec.title}</h3>
        <span className="sans tnum" style={{ fontSize: 12, color: "#a3a3a3", whiteSpace: "nowrap" }}>
          {n} answer{n === 1 ? "" : "s"}
        </span>
      </header>
      {spec.note && (
        <p className="muted" style={{ fontSize: 14.5, fontStyle: "italic", marginTop: -6, marginBottom: 10 }}>
          {spec.note}
        </p>
      )}
      {showTable ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {table.headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <BucketBox
          buckets={buckets}
          yField={yf}
          xTitle={axisLabel(xf)}
          height={330}
        />
      )}
      <footer style={{ marginTop: 8, fontSize: 13.5 }} className="muted">
        {xf.kind === "multi" && <span>pick-many, so people appear in several groups · </span>}
        {pooled && <span>rare answers pooled into &ldquo;everything else&rdquo; · </span>}
        <button onClick={() => setShowTable((s) => !s)}>
          {showTable ? "view as chart" : "view as table"}
        </button>
      </footer>
    </article>
  );
}
