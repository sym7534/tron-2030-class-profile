/** Shared bucketing rules for the aggregate comparison charts.
 *  Used by the graph builder and the per-section comparison cards so both
 *  always agree on how answers group. */
import {
  Field,
  Row,
  survey,
  distribution,
  numericOf,
  categoriesOf,
  shortCat,
  fmtValue,
  mean,
} from "./data";
import { niceDomain } from "@/components/charts/common";
import type { Bucket } from "@/components/charts/BucketBox";

export const MAX_CAT_GROUPS = 12;

/** numeric x → clean equal-width ranges; every pair lands in a bucket */
export function numericBuckets(
  pairs: { x: number; y: number }[],
  xf: Field,
  bucketCount = 5
): Bucket[] {
  const xs = pairs.map((p) => p.x);
  const nB = Math.max(1, Math.min(10, Math.round(bucketCount)));
  const edges: number[] = [];
  if (xf.intScale && xf.intScale[1] - xf.intScale[0] <= 10) {
    const [lo, hi] = xf.intScale;
    const step = Math.ceil((hi - lo + 1) / nB);
    for (let v = lo; v <= hi + 1; v += step) edges.push(v - 0.5);
    if (edges[edges.length - 1] < hi + 0.5) edges.push(hi + 0.5);
  } else {
    const { lo, hi } = niceDomain(xs, { target: 5 });
    for (let i = 0; i <= nB; i++) edges.push(lo + ((hi - lo) * i) / nB);
  }
  const buckets: Bucket[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const x0 = edges[i];
    const x1 = edges[i + 1];
    const last = i === edges.length - 2;
    const inB = pairs.filter((p) => p.x >= x0 && (last ? p.x <= x1 : p.x < x1));
    if (inB.length === 0) continue;
    const f = (v: number) => fmtValue(xf, v).replace(/\s/g, "");
    buckets.push({
      label: xf.intScale
        ? Math.ceil(x0) === Math.floor(x1)
          ? `${Math.ceil(x0)}`
          : `${Math.ceil(x0)}–${Math.floor(x1)}`
        : `${f(x0)}–${f(x1)}`,
      values: inB.map((p) => p.y),
    });
  }
  return buckets;
}

/** categorical x → one group per answer, overflow pooled into "everything else" */
export function categoryBuckets(
  catF: Field,
  numF: Field,
  rows: Row[] = survey.rows
): { buckets: Bucket[]; pooled: boolean } {
  const allGroups: Bucket[] = distribution(catF, rows)
    .map((d) => ({
      label: shortCat(catF, d.label),
      values: rows
        .filter((r) => categoriesOf(r, catF).includes(d.label))
        .map((r) => numericOf(r, numF))
        .filter((v): v is number => v !== null),
    }))
    .filter((b) => b.values.length > 0)
    .sort((a, b) => mean(b.values) - mean(a.values));
  if (allGroups.length <= MAX_CAT_GROUPS) return { buckets: allGroups, pooled: false };
  const kept = allGroups.slice(0, MAX_CAT_GROUPS - 1);
  const rest = allGroups.slice(MAX_CAT_GROUPS - 1);
  return {
    buckets: [
      ...kept,
      { label: `everything else (${rest.length})`, values: rest.flatMap((b) => b.values) },
    ],
    pooled: true,
  };
}

export function bucketTable(buckets: Bucket[], yf: Field) {
  const sd = (xs: number[]) => {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
  };
  return {
    headers: ["bucket", "people", "mean", "\u03c3", "min", "max"],
    rows: buckets.map((b) => [
      b.label,
      b.values.length,
      fmtValue(yf, mean(b.values)),
      fmtValue(yf, sd(b.values)),
      fmtValue(yf, Math.min(...b.values)),
      fmtValue(yf, Math.max(...b.values)),
    ]),
  };
}
