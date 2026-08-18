import surveyJson from "@/data/survey.json";

export type FieldKind = "numeric" | "categorical" | "ordinal" | "multi" | "text" | "date";

export interface Field {
  id: string;
  col: number | null;
  kind: FieldKind;
  section: string;
  label: string;
  short: string;
  unit?: string;
  order?: string[];
  shortLabels?: Record<string, string>;
  intScale?: [number, number];
  logBins?: boolean;
  lowN?: boolean;
  derived?: boolean;
  hideCard?: boolean;
}

export type CellValue = string | number | string[] | null;
export type Row = { resp: number } & Record<string, CellValue>;

export interface FieldReport {
  excluded: { raw: string; reason: string }[];
  merged: Record<string, string[]>;
  notes: string[];
}

export interface Survey {
  n: number;
  generatedFrom: string;
  fields: Field[];
  rows: Row[];
  report: Record<string, FieldReport>;
}

export const survey = surveyJson as unknown as Survey;

export const fieldById: Record<string, Field> = Object.fromEntries(
  survey.fields.map((f) => [f.id, f])
);

export const N = survey.n;

// ------------------------------------------------------------------ accessors

export function numericValues(id: string): number[] {
  return survey.rows
    .map((r) => r[id])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

/** date fields are stored as ISO strings; expose as epoch days for math */
export function dateAsDays(iso: string): number {
  return Date.parse(iso + "T00:00:00Z") / 86400000;
}

export function daysToLabel(days: number): string {
  const d = new Date(days * 86400000);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** numeric view of a field for scatter/correlation (numeric or date) */
export function numericOf(row: Row, f: Field): number | null {
  const v = row[f.id];
  if (f.kind === "numeric") return typeof v === "number" ? v : null;
  if (f.kind === "date") return typeof v === "string" ? dateAsDays(v) : null;
  return null;
}

/** categorical view (categorical | ordinal | multi-exploded handled separately) */
export function categoryOf(row: Row, f: Field): string | null {
  const v = row[f.id];
  if (typeof v === "string") return v;
  return null;
}

export function categoriesOf(row: Row, f: Field): string[] {
  const v = row[f.id];
  if (f.kind === "multi") return Array.isArray(v) ? v : [];
  const c = categoryOf(row, f);
  return c === null ? [] : [c];
}

/** distribution of a categorical/ordinal/multi field, ordered sensibly */
export function distribution(f: Field, rows: Row[] = survey.rows): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const c of categoriesOf(row, f)) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  let entries = [...counts.entries()].map(([label, count]) => ({ label, count }));
  if (f.order) {
    entries.sort(
      (a, b) => (f.order!.indexOf(a.label) + 1 || 999) - (f.order!.indexOf(b.label) + 1 || 999)
    );
  } else {
    entries.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }
  return entries;
}

/** count of respondents who answered a field at all */
export function answeredCount(f: Field, rows: Row[] = survey.rows): number {
  return rows.filter((r) => {
    const v = r[f.id];
    return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined;
  }).length;
}

// ------------------------------------------------------------------ statistics

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function pearson(pairs: [number, number][]): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = mean(pairs.map((p) => p[0]));
  const my = mean(pairs.map((p) => p[1]));
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export function linreg(pairs: [number, number][]): { slope: number; intercept: number } | null {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = mean(pairs.map((p) => p[0]));
  const my = mean(pairs.map((p) => p[1]));
  let sxy = 0,
    sxx = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

// ------------------------------------------------------------------ binning

export interface Bin {
  x0: number;
  x1: number;
  label: string;
  count: number;
  values: number[];
}

const fmtNum = (v: number) =>
  Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v * 10) / 10}`;

/** "nice" linear bins — conventional 1/2/5/10 widths so edges land on clean numbers */
export function linearBins(values: number[], targetBins = 12): Bin[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) {
    return [{ x0: lo, x1: hi, label: fmtNum(lo), count: values.length, values }];
  }
  const rawStep = (hi - lo) / targetBins;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const bins: Bin[] = [];
  for (let x = start; x < end - 1e-9; x += step) {
    const x1 = x + step;
    bins.push({ x0: x, x1, label: `${fmtNum(x)}–${fmtNum(x1)}`, count: 0, values: [] });
  }
  for (const v of values) {
    let idx = Math.floor((v - start) / step);
    if (idx >= bins.length) idx = bins.length - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
    bins[idx].values.push(v);
  }
  return bins;
}

/** log-ish bins for heavily skewed data (distance, tabs) */
export function logBins(values: number[]): Bin[] {
  const edges = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const hi = Math.max(...values);
  const used = edges.filter((e) => e <= hi);
  if (used[used.length - 1] < hi) used.push(edges[edges.length - 1]);
  const bins: Bin[] = [];
  for (let i = 0; i < used.length - 1; i++) {
    bins.push({
      x0: used[i],
      x1: used[i + 1],
      label: `${fmtNum(used[i])}–${fmtNum(used[i + 1])}`,
      count: 0,
      values: [],
    });
  }
  for (const v of values) {
    let idx = bins.findIndex((b) => v >= b.x0 && v < b.x1);
    if (idx === -1) idx = bins.length - 1;
    bins[idx].count++;
    bins[idx].values.push(v);
  }
  // trim empty leading/trailing bins
  while (bins.length && bins[0].count === 0) bins.shift();
  while (bins.length && bins[bins.length - 1].count === 0) bins.pop();
  return bins;
}

/** integer bins for small scales (1–10 ratings etc.) */
export function intBins(values: number[], lo: number, hi: number): Bin[] {
  const bins: Bin[] = [];
  for (let i = lo; i <= hi; i++) {
    bins.push({ x0: i, x1: i, label: String(i), count: 0, values: [] });
  }
  for (const v of values) {
    const idx = Math.round(v) - lo;
    if (idx >= 0 && idx < bins.length) {
      bins[idx].count++;
      bins[idx].values.push(v);
    }
  }
  return bins;
}

export function binsFor(f: Field, values: number[]): Bin[] {
  if (values.length === 0) return [];
  if (f.intScale) return intBins(values, f.intScale[0], f.intScale[1]);
  if (f.logBins) return logBins(values);
  const distinct = new Set(values.map((v) => Math.round(v)));
  if (distinct.size <= 12 && values.every((v) => Number.isInteger(v))) {
    return intBins(values, Math.min(...values), Math.max(...values));
  }
  return linearBins(values);
}

// ------------------------------------------------------------------ formatting

export function fmtValue(f: Field | undefined, v: number): string {
  if (f?.kind === "date") return daysToLabel(v);
  const s =
    Math.abs(v) >= 100 || Number.isInteger(Math.round(v * 10) / 10)
      ? String(Math.round(v * 10) / 10)
      : (Math.round(v * 100) / 100).toString();
  if (!f?.unit) return s;
  if (f.unit === "$" || f.unit === "$/h") return `$${s}${f.unit === "$/h" ? "/h" : ""}`;
  if (f.unit === "%") return `${s}%`;
  return `${s} ${f.unit}`;
}

export function shortCat(f: Field, label: string): string {
  return f.shortLabels?.[label] ?? label;
}

/** cm -> ft'in" for the height field's tooltips */
export function cmToFtIn(cm: number): string {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn % 12);
  return inch === 12 ? `${ft + 1}'0"` : `${ft}'${inch}"`;
}

/**
 * Axis-title casing: sentence-lowercase, but words containing digits or in
 * all-caps stay as written ("1A average", "HS final average", "MBTI").
 */
export function axisLabel(f: Field): string {
  const label = f.short
    .split(" ")
    .map((w) => (/\d/.test(w) || (w.length > 1 && w === w.toUpperCase()) ? w : w.toLowerCase()))
    .join(" ");
  return f.unit ? `${label} (${f.unit})` : label;
}

/** "1 person" / "5 people" and friends */
export function countNoun(n: number, singular = "person", plural = "people"): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
