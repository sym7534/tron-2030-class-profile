"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Field,
  Row,
  survey,
  fieldById,
  distribution,
  numericOf,
  categoriesOf,
  shortCat,
  fmtValue,
  median,
  mean,
  pearson,
  answeredCount,
} from "@/lib/data";
import { PRESETS } from "@/lib/sections";
import Scatter from "./charts/Scatter";
import Strip from "./charts/Strip";
import Heatmap from "./charts/Heatmap";
import BarsH from "./charts/BarsH";
import Histogram from "./charts/Histogram";
import ChartFrame from "./ChartFrame";

const COUNT = "count";

const AXIS_FIELDS = survey.fields.filter((f) => f.kind !== "text");
const FILTER_FIELDS = survey.fields.filter(
  (f) => f.kind === "categorical" || f.kind === "ordinal" || f.kind === "multi"
);

const isNum = (f: Field | null) => !!f && (f.kind === "numeric" || f.kind === "date");
const isCat = (f: Field | null) =>
  !!f && (f.kind === "categorical" || f.kind === "ordinal" || f.kind === "multi");

const MAX_CAT_ROWS = 14;

export default function GraphBuilder() {
  const [xId, setXId] = useState("applyAvg");
  const [yId, setYId] = useState("avg1A");
  const [identityOn, setIdentityOn] = useState(true);
  const [filterId, setFilterId] = useState("");
  const [filterVal, setFilterVal] = useState("");
  const [preset, setPreset] = useState<string | null>("the great deflation");

  const xf: Field | null = xId === COUNT ? null : (fieldById[xId] ?? null);
  const yf: Field | null = yId === COUNT ? null : (fieldById[yId] ?? null);
  const filterField = filterId ? fieldById[filterId] : null;

  // shareable graphs: restore from #gx=…&gy=…, then mirror state into the hash
  const touched = useRef(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.slice(1));
    const hx = p.get("gx");
    const hy = p.get("gy");
    const hf = p.get("gf");
    const hv = p.get("gv");
    if ((hx && (hx === COUNT || fieldById[hx])) || (hy && (hy === COUNT || fieldById[hy]))) {
      if (hx) setXId(hx);
      if (hy) setYId(hy);
      setPreset(null);
      touched.current = true;
    }
    if (hf && fieldById[hf]) {
      setFilterId(hf);
      if (hv) setFilterVal(hv);
      touched.current = true;
    }
  }, []);
  useEffect(() => {
    if (!touched.current) return;
    const p = new URLSearchParams();
    p.set("gx", xId);
    p.set("gy", yId);
    if (filterId && filterVal) {
      p.set("gf", filterId);
      p.set("gv", filterVal);
    }
    history.replaceState(null, "", "#" + p.toString());
  }, [xId, yId, filterId, filterVal]);

  const filterOptions = useMemo(
    () => (filterField ? distribution(filterField).map((d) => d.label) : []),
    [filterField]
  );

  const rows: Row[] = useMemo(() => {
    if (!filterField || !filterVal) return survey.rows;
    return survey.rows.filter((r) => categoriesOf(r, filterField).includes(filterVal));
  }, [filterField, filterVal]);

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    touched.current = true;
    setXId(p.x);
    setYId(p.y);
    setIdentityOn(!!p.identity);
    setPreset(p.name);
  };

  const swap = () => {
    touched.current = true;
    setXId(yId);
    setYId(xId);
    setPreset(null);
  };

  const grouped = useMemo(() => {
    const bySection = new Map<string, Field[]>();
    for (const f of AXIS_FIELDS) {
      if (!bySection.has(f.section)) bySection.set(f.section, []);
      bySection.get(f.section)!.push(f);
    }
    return [...bySection.entries()];
  }, []);

  // ------------------------------------------------------------------- render
  let body: React.ReactNode = null;
  let caption: React.ReactNode = null;
  let table: { headers: string[]; rows: (string | number)[][] } | undefined;
  let title = "pick something";

  const uniField = !xf ? yf : !yf ? xf : null;

  if (!xf && !yf) {
    body = (
      <p className="muted" style={{ padding: "48px 0", textAlign: "center" }}>
        pick a question for at least one axis.
      </p>
    );
  } else if (uniField) {
    // ---- univariate
    const f = uniField;
    title = f.short;
    const n = answeredCount(f, rows);
    if (f.kind === "numeric" || f.kind === "date") {
      const values = rows
        .map((r) => numericOf(r, f))
        .filter((v): v is number => v !== null && Number.isFinite(v));
      body = values.length ? <Histogram field={f} values={values} /> : null;
      caption = (
        <>
          how many people gave each answer &middot; n = <span className="tnum">{n}</span>
        </>
      );
      table = {
        headers: ["statistic", "value"],
        rows: values.length
          ? [
              ["n", values.length],
              ["min", fmtValue(f, Math.min(...values))],
              ["median", fmtValue(f, median(values))],
              ["mean", fmtValue(f, mean(values))],
              ["max", fmtValue(f, Math.max(...values))],
            ]
          : [],
      };
    } else {
      const dist = distribution(f, rows);
      const denom = f.kind === "multi" ? n : dist.reduce((a, d) => a + d.count, 0);
      body = (
        <BarsH
          data={dist.map((d) => ({ label: shortCat(f, d.label), count: d.count }))}
          total={denom}
          totalLabel={f.kind === "multi" ? "of respondents" : "of answers"}
        />
      );
      caption = (
        <>
          n = <span className="tnum">{n}</span>
          {f.kind === "multi" && <> &middot; pick-many, so bars sum past 100%</>}
        </>
      );
      table = {
        headers: ["answer", "people", "%"],
        rows: dist.map((d) => [
          shortCat(f, d.label),
          d.count,
          `${denom ? Math.round((d.count / denom) * 100) : 0}%`,
        ]),
      };
    }
  } else if (xf && yf) {
    title = `${yf.short} vs. ${xf.short}`;

    if (isNum(xf) && isNum(yf)) {
      // ---- scatter
      const pts = rows
        .map((r) => {
          const x = numericOf(r, xf);
          const y = numericOf(r, yf);
          return x !== null && y !== null ? { x, y, resp: r.resp } : null;
        })
        .filter((p): p is { x: number; y: number; resp: number } => p !== null);
      const sameUnit = !!xf.unit && xf.unit === yf.unit;
      const r = pearson(pts.map((p) => [p.x, p.y] as [number, number]));
      body = pts.length ? (
        <Scatter
          points={pts}
          xField={xf}
          yField={yf}
          height={380}
          identity={identityOn && sameUnit}
        />
      ) : (
        <p className="muted" style={{ padding: 40 }}>
          nobody answered both of these.
        </p>
      );
      caption = (
        <>
          one dot per person &middot; n = <span className="tnum">{pts.length}</span>
          {r !== null && (
            <>
              {" "}
              &middot; r = <span className="tnum">{r.toFixed(2)}</span>,{" "}
              {Math.abs(r) < 0.15
                ? "essentially unrelated"
                : Math.abs(r) < 0.35
                  ? "a faint trend"
                  : Math.abs(r) < 0.6
                    ? "a real trend"
                    : "a strong trend"}
            </>
          )}
        </>
      );
      table = {
        headers: ["person", xf.short, yf.short],
        rows: pts.map((p) => [`#${p.resp}`, fmtValue(xf, p.x), fmtValue(yf, p.y)]),
      };
    } else if (isCat(xf) !== isCat(yf)) {
      // ---- strip (category x numeric, either orientation)
      const catF = isCat(xf) ? xf : yf;
      const numF = isCat(xf) ? yf : xf;
      const stripRows = distribution(catF, rows)
        .map((d) => ({
          label: shortCat(catF, d.label),
          values: rows
            .filter((r) => categoriesOf(r, catF).includes(d.label))
            .map((r) => ({ v: numericOf(r, numF), resp: r.resp }))
            .filter((p): p is { v: number; resp: number } => p.v !== null),
        }))
        .filter((r) => r.values.length > 0)
        .sort((a, b) => median(b.values.map((v) => v.v)) - median(a.values.map((v) => v.v)))
        .slice(0, MAX_CAT_ROWS);
      const shown = stripRows.reduce((a, r) => a + r.values.length, 0);
      body = stripRows.length ? (
        <Strip rows={stripRows} numField={numF} />
      ) : (
        <p className="muted" style={{ padding: 40 }}>
          nobody answered both of these.
        </p>
      );
      caption = (
        <>
          rows sorted by median &middot; n = <span className="tnum">{shown}</span>
          {catF.kind === "multi" && <> &middot; pick-many, so people appear in several rows</>}
          {isNum(xf) && <> &middot; axes swapped so the categories can be read</>}
        </>
      );
      table = {
        headers: [catF.short, "people", `median ${numF.short.toLowerCase()}`],
        rows: stripRows.map((r) => [
          r.label,
          r.values.length,
          fmtValue(numF, median(r.values.map((v) => v.v))),
        ]),
      };
    } else {
      // ---- heatmap (category x category)
      const xLabels = distribution(xf, rows).slice(0, 10);
      const yLabels = distribution(yf, rows).slice(0, 10);
      const cells = xLabels.flatMap((xd) =>
        yLabels.map((yd) => ({
          x: shortCat(xf, xd.label),
          y: shortCat(yf, yd.label),
          count: rows.filter(
            (r) =>
              categoriesOf(r, xf).includes(xd.label) && categoriesOf(r, yf).includes(yd.label)
          ).length,
        }))
      );
      body = (
        <Heatmap
          xLabels={xLabels.map((d) => shortCat(xf, d.label))}
          yLabels={yLabels.map((d) => shortCat(yf, d.label))}
          cells={cells}
        />
      );
      caption = (
        <>
          top {xLabels.length} &times; {yLabels.length} answers &middot; n ={" "}
          <span className="tnum">{rows.length}</span>
        </>
      );
      table = {
        headers: [yf.short, ...xLabels.map((d) => shortCat(xf, d.label))],
        rows: yLabels.map((yd) => [
          shortCat(yf, yd.label),
          ...xLabels.map(
            (xd) =>
              cells.find(
                (c) => c.x === shortCat(xf, xd.label) && c.y === shortCat(yf, yd.label)
              )?.count ?? 0
          ),
        ]),
      };
    }
  }

  const AxisSelect = ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <select
      id={id}
      value={value}
      onChange={(e) => {
        touched.current = true;
        onChange(e.target.value);
        setPreset(null);
      }}
    >
      <option value={COUNT}>— just count people —</option>
      {grouped.map(([section, fields]) => (
        <optgroup key={section} label={section}>
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.short}
              {f.unit ? ` (${f.unit})` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );

  const activePreset = PRESETS.find((p) => p.name === preset);
  const sameUnitPair = !!xf?.unit && xf.unit === yf?.unit;

  return (
    <div className="builder">
      <div className="preset-row">
        <span className="muted preset-lead">try one:</span>
        {PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => applyPreset(p)}
            title={p.quip}
            className={preset === p.name ? "toggle-active" : undefined}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="axis-row">
        <span className="axis-ctl">
          <label htmlFor="x-axis" className="axis-label">
            x
          </label>
          <AxisSelect id="x-axis" value={xId} onChange={setXId} />
        </span>
        <button className="swap" onClick={swap} title="swap the axes" aria-label="swap axes">
          &#8646;
        </button>
        <span className="axis-ctl">
          <label htmlFor="y-axis" className="axis-label">
            y
          </label>
          <AxisSelect id="y-axis" value={yId} onChange={setYId} />
        </span>
        <span className="axis-ctl">
          <label htmlFor="filter-field" className="axis-label">
            only
          </label>
          <select
            id="filter-field"
            value={filterId}
            onChange={(e) => {
              touched.current = true;
              setFilterId(e.target.value);
              setFilterVal("");
            }}
          >
            <option value="">— everyone —</option>
            {FILTER_FIELDS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.short}
              </option>
            ))}
          </select>
          {filterField && (
            <select
              value={filterVal}
              onChange={(e) => {
                touched.current = true;
                setFilterVal(e.target.value);
              }}
              aria-label="filter value"
            >
              <option value="">— any —</option>
              {filterOptions.map((o) => (
                <option key={o} value={o}>
                  {shortCat(filterField, o)}
                </option>
              ))}
            </select>
          )}
        </span>
      </div>

      <h3 className="builder-title">
        {title}
        {filterVal && (
          <span className="muted">
            {" "}
            &middot; {shortCat(filterField!, filterVal)} only ({rows.length} people)
          </span>
        )}
      </h3>
      {activePreset && <p className="preset-blurb">{activePreset.quip}</p>}

      <ChartFrame caption={caption} table={table}>
        {body}
      </ChartFrame>

      <div className="builder-foot">
        {sameUnitPair && isNum(xf) && isNum(yf) && (
          <button
            onClick={() => setIdentityOn((v) => !v)}
            className={identityOn ? "toggle-active" : undefined}
          >
            {identityOn ? "hide" : "show"} the y = x line
          </button>
        )}
        {(filterVal || preset) && (
          <button
            onClick={() => {
              setFilterId("");
              setFilterVal("");
            }}
          >
            reset filter
          </button>
        )}
      </div>

      <p className="builder-hint muted">
        Any question against any other. Numbers &times; numbers draws a scatter, categories
        &times; numbers draws dot rows with medians, categories &times; categories draws a
        heatmap. Set an axis to <em>just count people</em> for the plain distribution.
      </p>
    </div>
  );
}
