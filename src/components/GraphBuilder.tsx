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
  countNoun,
} from "@/lib/data";
import BucketBox, { Bucket } from "./charts/BucketBox";
import Heatmap from "./charts/Heatmap";
import BarsH from "./charts/BarsH";
import Histogram from "./charts/Histogram";
import { numericBuckets, bucketTable, fixedGroupBuckets } from "@/lib/buckets";
import { axisLabel } from "@/lib/data";

const COUNT = "count";

const AXIS_FIELDS = survey.fields.filter((f) => f.kind !== "text");
const FILTER_FIELDS = survey.fields.filter(
  (f) => f.kind === "categorical" || f.kind === "ordinal" || f.kind === "multi"
);

const isNum = (f: Field | null) => !!f && (f.kind === "numeric" || f.kind === "date");
const isCat = (f: Field | null) =>
  !!f && (f.kind === "categorical" || f.kind === "ordinal" || f.kind === "multi");

const MAX_CAT_ROWS = 12;

export default function GraphBuilder() {
  const [xId, setXId] = useState("");
  const [yId, setYId] = useState("");
  const [filterId, setFilterId] = useState("");
  const [filterVal, setFilterVal] = useState("");
  // dashboard display toggles
  const [grid, setGrid] = useState(true);
  const [sd1, setSd1] = useState(true);
  const [sd2, setSd2] = useState(false);
  const [gridMinor, setGridMinor] = useState(false);
  const [bucketN, setBucketN] = useState(5);

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
    if (xId) p.set("gx", xId);
    if (yId) p.set("gy", yId);
    if (filterId && filterVal) {
      p.set("gf", filterId);
      p.set("gv", filterVal);
    }
    const qs = p.toString();
    history.replaceState(null, "", qs ? "#" + qs : window.location.pathname);
  }, [xId, yId, filterId, filterVal]);

  const filterOptions = useMemo(
    () => (filterField ? distribution(filterField).map((d) => d.label) : []),
    [filterField]
  );

  const rows: Row[] = useMemo(() => {
    if (!filterField || !filterVal) return survey.rows;
    return survey.rows.filter((r) => categoriesOf(r, filterField).includes(filterVal));
  }, [filterField, filterVal]);

  // ---- save the current chart as a PNG (serialize the SVG onto a canvas)
  const frameRef = useRef<HTMLDivElement | null>(null);
  const saveChart = () => {
    const svg = frameRef.current?.querySelector("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = 2; // crisp export
    const TITLE_H = 44; // headroom for the chart title in the file
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(rect.width));
    clone.setAttribute("height", String(rect.height));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    // CSS variables don't resolve in a detached SVG: inline the computed
    // fill/font of every text node so the export matches the page
    const liveNodes = svg.querySelectorAll<SVGElement>("text, line, rect, path, circle");
    const cloneNodes = clone.querySelectorAll<SVGElement>("text, line, rect, path, circle");
    liveNodes.forEach((node, i) => {
      const cs = getComputedStyle(node);
      const target = cloneNodes[i];
      if (!target) return;
      if (node.tagName === "text") {
        target.setAttribute("fill", cs.fill);
        target.setAttribute("font-family", "Arial, Helvetica, sans-serif");
        if (!target.getAttribute("font-size")) target.setAttribute("font-size", cs.fontSize);
      }
    });
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(rect.width * scale);
      canvas.height = Math.round((rect.height + TITLE_H) * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // chart title baked into the file
      ctx.fillStyle = "#171717";
      ctx.font = `600 ${15 * scale}px Arial, Helvetica, sans-serif`;
      ctx.fillText(title, 12 * scale, 24 * scale);
      ctx.font = `${11 * scale}px Arial, Helvetica, sans-serif`;
      ctx.fillStyle = "#737373";
      ctx.fillText("Mechatronics 2030 class profile", 12 * scale, 38 * scale);
      ctx.drawImage(img, 0, TITLE_H * scale, canvas.width, Math.round(rect.height * scale));
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      const name = title.replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "chart";
      a.download = `tron2030-${name}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = url;
  };

  const swap = () => {
    touched.current = true;
    setXId(yId);
    setYId(xId);
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
  let title = "Compare any stat against any other";

  const uniField = !xf ? yf : !yf ? xf : null;

  if (!xf && !yf) {
    body = (
      <p className="muted" style={{ padding: "48px 0", textAlign: "center" }}>
        Want to see a comparison that isn&rsquo;t shown? Build your own graph here.
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
      body = values.length ? <Histogram field={f} values={values} grid={grid} gridMinor={grid && gridMinor} /> : null;
      caption = (
        <>
          # of responses = <span className="tnum">{n}</span>
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
          # of responses = <span className="tnum">{n}</span>
          {f.kind === "multi" && <> &middot; pick-many</>}
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
      // ---- numeric × numeric: bucket x, one aggregate box per bucket, all data in
      const pts = rows
        .map((r) => {
          const x = numericOf(r, xf);
          const y = numericOf(r, yf);
          return x !== null && y !== null ? { x, y } : null;
        })
        .filter((p): p is { x: number; y: number } => p !== null);
      const r = pearson(pts.map((p) => [p.x, p.y] as [number, number]));
      const buckets = numericBuckets(pts, xf, bucketN);
      body = buckets.length ? (
        <BucketBox
          buckets={buckets}
          yField={yf}
          xTitle={axisLabel(xf)}
          height={400}
          grid={grid}
          gridMinor={grid && gridMinor}
          showSd1={sd1}
          showSd2={sd2}
        />
      ) : (
        <p className="muted" style={{ padding: 40 }}>
          nobody answered both of these.
        </p>
      );
      caption = (
        <>
          # of responses = <span className="tnum">{pts.length}</span>
          {r !== null && (
            <>
              , r = <span className="tnum">{r.toFixed(2)}</span>,{" "}
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
      table = bucketTable(buckets, yf);
    } else if (isCat(xf) !== isCat(yf)) {
      // ---- category × numeric: same aggregate boxes, one per category
      const catF = isCat(xf) ? xf : yf;
      const numF = isCat(xf) ? yf : xf;
      const fixedB = fixedGroupBuckets(catF, numF, rows);
      const allGroups: Bucket[] =
        fixedB ??
        distribution(catF, rows)
          .map((d) => ({
            label: shortCat(catF, d.label),
            values: rows
              .filter((r) => categoriesOf(r, catF).includes(d.label))
              .map((r) => numericOf(r, numF))
              .filter((v): v is number => v !== null),
          }))
          .filter((b) => b.values.length > 0)
          .sort((a, b) => mean(b.values) - mean(a.values));
      // keep the chart readable: many tiny categories fold into one combined group
      let buckets = allGroups;
      if (!fixedB && allGroups.length > MAX_CAT_ROWS) {
        const kept = allGroups.slice(0, MAX_CAT_ROWS - 1);
        const rest = allGroups.slice(MAX_CAT_ROWS - 1);
        buckets = [
          ...kept,
          {
            label: `everything else (${rest.length})`,
            values: rest.flatMap((b) => b.values),
          },
        ];
      }
      const shown = buckets.reduce((a, b) => a + b.values.length, 0);
      body = buckets.length ? (
        <BucketBox
          buckets={buckets}
          yField={numF}
          xTitle={axisLabel(catF)}
          height={400}
          grid={grid}
          gridMinor={grid && gridMinor}
          showSd1={sd1}
          showSd2={sd2}
        />
      ) : (
        <p className="muted" style={{ padding: 40 }}>
          nobody answered both of these.
        </p>
      );
      caption = (
        <>
          # of responses = <span className="tnum">{shown}</span>
          {!fixedB && <> &middot; sorted by mean</>}
          {catF.kind === "multi" && <> &middot; pick-many</>}
        </>
      );
      table = bucketTable(buckets, numF);
    } else {
      // ---- heatmap (category x category) — overflow pools into "everything else"
      const MAX_HEAT = 10;
      const packAxis = (f: Field) => {
        const dist = distribution(f, rows);
        const kept = dist.slice(0, MAX_HEAT - (dist.length > MAX_HEAT ? 1 : 0));
        const rest = dist.slice(kept.length).map((d) => d.label);
        const labels = [
          ...kept.map((d) => shortCat(f, d.label)),
          ...(rest.length ? [`everything else (${rest.length})`] : []),
        ];
        /** raw category labels belonging to each display label */
        const groupOf = (raw: string) =>
          rest.includes(raw) ? labels[labels.length - 1] : shortCat(f, raw);
        return { labels, groupOf, pooled: rest.length };
      };
      const xa = packAxis(xf);
      const ya = packAxis(yf);
      const counts = new Map<string, number>();
      for (const r of rows) {
        for (const xc of categoriesOf(r, xf)) {
          for (const yc of categoriesOf(r, yf)) {
            const k = xa.groupOf(xc) + "\u0000" + ya.groupOf(yc);
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
        }
      }
      const cells = xa.labels.flatMap((x) =>
        ya.labels.map((y) => ({ x, y, count: counts.get(x + "\u0000" + y) ?? 0 }))
      );
      body = <Heatmap xLabels={xa.labels} yLabels={ya.labels} cells={cells} />;
      caption = (
        <>
          # of responses = <span className="tnum">{rows.length}</span>
        </>
      );
      table = {
        headers: [yf.short, ...xa.labels],
        rows: ya.labels.map((y) => [
          y,
          ...xa.labels.map((x) => counts.get(x + "\u0000" + y) ?? 0),
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
      }}
    >
      <option value="">&mdash; select &mdash;</option>
      <option value={COUNT}>&mdash; just count people &mdash;</option>
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

  // which display toggles make sense for the current chart
  const isBucketNum = !!(xf && yf) && isNum(xf) && isNum(yf);
  const isBucketCat = !!(xf && yf) && isCat(xf) !== isCat(yf);
  const hasBoxChart = isBucketNum || isBucketCat;
  const hasGridChart =
    hasBoxChart || (!!uniField && (uniField.kind === "numeric" || uniField.kind === "date"));

  return (
    <div className="builder">
      <h3 className="builder-title">
        {title}
        {filterVal && (
          <span className="muted">
            {" "}
            &middot; {shortCat(filterField!, filterVal)} only ({countNoun(rows.length)})
          </span>
        )}
      </h3>

      <div className="chart-frame card" ref={frameRef}>
        {body}
        <div className="chart-foot">
          <span className="muted chart-caption">{caption}</span>
          {(xf || yf) && (
            <span className="chart-views">
              <button onClick={saveChart}>save</button>
            </span>
          )}
        </div>
      </div>

      <div className="axis-row" style={{ marginTop: 30, marginBottom: 0 }}>
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
            filter by
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

      {hasGridChart && (
        <div className="ctl-row" role="group" aria-label="display options">
          <label className="ctl-check">
            <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />
            gridlines
          </label>
          <label className={grid ? "ctl-check" : "ctl-check ctl-disabled"}>
            <input
              type="checkbox"
              checked={gridMinor}
              disabled={!grid}
              onChange={(e) => setGridMinor(e.target.checked)}
            />
            minor gridlines
          </label>
          {hasBoxChart && (
            <>
              <label className="ctl-check">
                <input type="checkbox" checked={sd1} onChange={(e) => setSd1(e.target.checked)} />
                ± 1σ box
              </label>
              <label className="ctl-check">
                <input type="checkbox" checked={sd2} onChange={(e) => setSd2(e.target.checked)} />
                ± 2σ line
              </label>
            </>
          )}
          {isBucketNum && (
            <label className="ctl-check">
              buckets
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={bucketN}
                onChange={(e) => setBucketN(Number(e.target.value))}
                aria-label="number of buckets"
              />
              <span className="tnum">{bucketN}</span>
            </label>
          )}
        </div>
      )}

      <div className="builder-foot">
        {filterVal && (
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

    </div>
  );
}
