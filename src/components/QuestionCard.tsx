"use client";

import { useMemo, useState } from "react";
import {
  survey,
  fieldById,
  Field,
  distribution,
  answeredCount,
  numericValues,
  binsFor,
  fmtValue,
  mean,
  median,
  quantile,
  dateAsDays,
  shortCat,
  cmToFtIn,
  N,
} from "@/lib/data";
import BarsH from "./charts/BarsH";
import Histogram from "./charts/Histogram";
import Pie from "./charts/Pie";
import MbtiGrid from "./charts/MbtiGrid";
import Columns from "./charts/Columns";
import WordWall, { groupVerbatim } from "./WordWall";
import WordCloud from "./charts/WordCloud";

/** small mutually-exclusive categoricals read cleanly as pies (à la Tron 2020) */
const PIE_IDS = new Set([
  "gender",
  "stream",
  "button",
  "sonDaughter",
  "cerealMilk",
  "pineapple",
  "alcohol",
  "cooked",
  "handedness",
  "hasCoop",
  "birthYear",
  "parentsUni",
  "relationship",
  "sexuality",
  "commute",
]);

const QUOTE_IDS = new Set(["advice", "message", "finalThoughts"]);

/** short answers with many unique responses render as a d3-cloud phrase cloud */
const CLOUD_IDS = new Set([
  "game",
  "artist",
  "song",
  "dreamCompany",
  "liveCarefree",
  "foodSpot",
  "campusSpot",
  "oneWord",
]);

/** short one-liners read better as a flowing wall than as 48 stacked quote blocks */
function wallMode(id: string, values: string[]): "wall" | "quotes" | "big" {
  if (id === "oneWord") return "big";
  const avg = values.length
    ? values.reduce((a, v) => a + v.length, 0) / values.length
    : 0;
  if (QUOTE_IDS.has(id)) return "quotes";
  return avg > 45 ? "quotes" : "wall";
}

/** fields whose spelling variants deserve to be shown, not hidden */
const SHOWCASE_VARIANTS = new Set(["favTeacher", "designTeam", "mbti"]);

function textValues(f: Field): string[] {
  return survey.rows
    .map((r) => r[f.id])
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

function weeklyBins(isoDates: string[]) {
  const days = isoDates.map(dateAsDays).sort((a, b) => a - b);
  const start = Math.floor(days[0] / 7) * 7;
  const end = Math.floor(days[days.length - 1] / 7) * 7 + 7;
  const bins: { label: string; count: number; detail: string }[] = [];
  for (let w = start; w < end; w += 7) {
    const d = new Date(w * 86400000);
    const label = d.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
    const count = days.filter((x) => x >= w && x < w + 7).length;
    bins.push({ label, count, detail: `week of ${label}` });
  }
  return bins;
}

export default function QuestionCard({ id, qNum }: { id: string; qNum?: number }) {
  const f = fieldById[id];
  const [showTable, setShowTable] = useState(false);
  const rep = survey.report[id];
  const answered = answeredCount(f);

  const body = useMemo(() => {
    if (f.kind === "text") {
      const values = textValues(f);
      if (CLOUD_IDS.has(id)) {
        return <WordCloud entries={groupVerbatim(values)} height={id === "oneWord" ? 260 : 320} />;
      }
      return <WordWall values={values} mode={wallMode(id, values)} />;
    }
    if (id === "mbti") {
      const counts: Record<string, number> = {};
      for (const d of distribution(f)) counts[d.label] = d.count;
      return <MbtiGrid counts={counts} />;
    }
    if (f.kind === "date") {
      const isoDates = survey.rows
        .map((r) => r[id])
        .filter((v): v is string => typeof v === "string");
      return <Columns data={weeklyBins(isoDates)} capLabels height={190} />;
    }
    if (f.kind === "numeric") {
      return <Histogram field={f} values={numericValues(id)} />;
    }
    const dist = distribution(f).map((d) => ({
      label: shortCat(f, d.label),
      count: d.count,
      detail:
        SHOWCASE_VARIANTS.has(id) && rep?.merged[d.label]?.length
          ? `as written: ${rep.merged[d.label].slice(0, 4).join(" · ")}`
          : undefined,
    }));
    if (f.kind === "categorical" && PIE_IDS.has(id) && dist.length <= 6) {
      return <Pie data={dist} total={answered} />;
    }
    return <BarsH data={dist} total={f.kind === "multi" ? answered : undefined} totalLabel={f.kind === "multi" ? "of respondents" : "of answers"} />;
  }, [f, id, rep, answered]);

  const table = useMemo(() => {
    if (!showTable) return null;
    if (f.kind === "numeric") {
      const vals = numericValues(id);
      const rows: [string, string][] = [
        ["answered", String(vals.length)],
        ["median", fmtValue(f, median(vals))],
        ["mean", fmtValue(f, mean(vals))],
        ["25th–75th percentile", `${fmtValue(f, quantile(vals, 0.25))} – ${fmtValue(f, quantile(vals, 0.75))}`],
        ["min – max", `${fmtValue(f, Math.min(...vals))} – ${fmtValue(f, Math.max(...vals))}`],
      ];
      const bins = binsFor(f, vals);
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <table className="data-table">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="data-table">
            <thead>
              <tr>
                <th>range</th>
                <th>count</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((b) => (
                <tr key={b.label}>
                  <td>{b.label}</td>
                  <td>{b.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (f.kind === "date") {
      const isoDates = survey.rows.map((r) => r[id]).filter((v): v is string => typeof v === "string");
      return (
        <table className="data-table">
          <thead>
            <tr>
              <th>week of</th>
              <th>count</th>
            </tr>
          </thead>
          <tbody>
            {weeklyBins(isoDates).map((b) => (
              <tr key={b.label}>
                <td>{b.label}</td>
                <td>{b.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    const dist = distribution(f);
    const denom = f.kind === "multi" ? answered : dist.reduce((a, d) => a + d.count, 0);
    return (
      <table className="data-table">
        <thead>
          <tr>
            <th>answer</th>
            <th>count</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {dist.map((d) => (
            <tr key={d.label}>
              <td>{shortCat(f, d.label)}</td>
              <td>{d.count}</td>
              <td>{denom ? Math.round((d.count / denom) * 100) : 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }, [showTable, f, id, answered]);

  const excluded = rep?.excluded ?? [];
  const notes = rep?.notes ?? [];
  const showcaseVariantCount = SHOWCASE_VARIANTS.has(id)
    ? Object.values(rep?.merged ?? {}).reduce((a, v) => a + v.length, 0)
    : 0;

  return (
    <article
      id={`q-${id}`}
      style={{
        borderTop: "1px solid var(--border-card)",
        paddingTop: 14,
        breakInside: "avoid",
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <div
          className="sans muted"
          style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}
        >
          {qNum ? `Q${String(qNum).padStart(2, "0")}` : ""}{" "}
          <span style={{ float: "right" }} className="tnum">
            n = {answered}
          </span>
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 400, lineHeight: 1.35 }}>{f.label}</h3>
      </header>
      {showTable ? table : body}
      <footer style={{ marginTop: 10, fontSize: 13.5 }} className="muted">
        {f.kind === "multi" && <div style={{ fontStyle: "italic" }}>multiple answers allowed</div>}
        {notes.map((n) => (
          <div key={n} style={{ fontStyle: "italic" }}>
            {n}
          </div>
        ))}
        {showcaseVariantCount > 1 && (
          <div style={{ fontStyle: "italic" }}>
            {showcaseVariantCount} spelling variants preserved — hover the bars
          </div>
        )}
        {excluded.length > 0 && (
          <details>
            <summary style={{ cursor: "pointer", fontStyle: "italic" }}>
              {excluded.length} answer{excluded.length > 1 ? "s" : ""} set aside
            </summary>
            <ul style={{ listStyle: "none", marginTop: 4 }}>
              {excluded.map((e, i) => (
                <li key={i}>
                  “{e.raw}” — {e.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
        {f.kind !== "text" && (
          <button onClick={() => setShowTable((s) => !s)} style={{ marginTop: 6 }}>
            {showTable ? "view as chart" : "view as table"}
          </button>
        )}
      </footer>
    </article>
  );
}
