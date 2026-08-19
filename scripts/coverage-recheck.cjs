/* Coverage + math recheck for bucketed builder:
   1. sweep axis pairs: no per-person scatter dots in num×num / cat×num modes
   2. independently recompute bucket stats from survey.json, diff vs DOM labels
   3. table twin is aggregate-only
   4. FULL COVERAGE: sum of bucket n across the chart equals every answered pair */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = 3235;
const ROOT = path.join(process.cwd(), "out");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split("?")[0]);
  if (f.endsWith("/")) f += "index.html";
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
  fs.createReadStream(fp).pipe(res);
});

const survey = JSON.parse(fs.readFileSync("src/data/survey.json", "utf8"));

(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p.waitForTimeout(1300);
  await p.evaluate(() => document.querySelector("#builder").scrollIntoView());
  let failures = 0;

  // ---------- 1. dot-leak sweep over num×num and cat×num pairs
  const numFields = survey.fields.filter((f) => f.kind === "numeric").map((f) => f.id);
  const catFields = survey.fields
    .filter((f) => ["categorical", "ordinal", "multi"].includes(f.kind))
    .map((f) => f.id);
  const pairs = [];
  for (let i = 0; i < numFields.length; i++) {
    pairs.push([numFields[i], numFields[(i + 3) % numFields.length]]);
  }
  for (let i = 0; i < catFields.length; i++) {
    pairs.push([catFields[i], numFields[i % numFields.length]]);
  }
  let dotLeaks = 0;
  for (const [x, y] of pairs) {
    await p.selectOption("#x-axis", x);
    await p.selectOption("#y-axis", y);
    await p.waitForTimeout(120);
    const leak = await p.evaluate(() => {
      // BucketBox renders rect/line only; any circle = a respondent dot
      const svg = document.querySelector(".builder .chart-frame svg");
      if (!svg) return { circles: 0 };
      return { circles: svg.querySelectorAll("circle").length };
    });
    if (leak.circles > 0) {
      console.log("  DOT LEAK:", x, "x", y, leak.circles, "circles");
      dotLeaks++;
    }
  }
  console.log(`dot-leak sweep: ${pairs.length} pairs, ${dotLeaks} leaks`);
  if (dotLeaks) failures++;

  // ---------- 2. independent bucket math via the table twin.
  // Parse each rendered bucket's range from its label, recompute n/mean/min/max
  // from survey.json, and diff. Robust to bucket-count changes in the UI.
  await p.selectOption("#x-axis", "cumAvg");
  await p.selectOption("#y-axis", "wage");
  await p.waitForTimeout(400);
  const domStats = await p.evaluate(() => {
    const texts = [...document.querySelectorAll(".builder .chart-frame svg text")].map((t) =>
      t.textContent.trim()
    );
    return texts;
  });
  const tableRows = await p.evaluate(() => {
    [...document.querySelectorAll(".builder .chart-views button")]
      .find((b) => b.innerText.trim() === "table")
      ?.click();
    return new Promise((res) =>
      setTimeout(() => {
        const rows = [...document.querySelectorAll(".builder .data-table tbody tr")].map((tr) =>
          [...tr.querySelectorAll("td")].map((td) => td.innerText.trim())
        );
        // switch back to chart for later steps
        [...document.querySelectorAll(".builder .chart-views button")]
          .find((b) => b.innerText.trim() === "chart")
          ?.click();
        res(rows);
      }, 250)
    );
  });
  const pts = survey.rows
    .map((r) => ({ x: r.cumAvg, y: r.wage }))
    .filter((p) => typeof p.x === "number" && typeof p.y === "number");
  const num = (s) => parseFloat(String(s).replace(/[^\d.\-]/g, ""));
  let mathBad = 0;
  let covered = 0;
  tableRows.forEach((row, i) => {
    const [label, people, meanS, , minS, maxS] = row;
    const m = String(label).match(/([\d.]+)%?\s*[–-]\s*([\d.]+)/);
    if (!m) { console.log("  UNPARSEABLE LABEL:", label); mathBad++; return; }
    const x0 = parseFloat(m[1]);
    const x1 = parseFloat(m[2]);
    const last = i === tableRows.length - 1;
    const inB = pts.filter((q) => q.x >= x0 && (last ? q.x <= x1 : q.x < x1));
    const ys = inB.map((q) => q.y);
    covered += inB.length;
    if (ys.length === 0) { console.log("  EMPTY EXPECTED BUCKET:", label); mathBad++; return; }
    const meanE = ys.reduce((a, v) => a + v, 0) / ys.length;
    const ok =
      Number(people) === ys.length &&
      Math.abs(num(meanS) - meanE) < 0.15 &&
      Math.abs(num(minS) - Math.min(...ys)) < 0.15 &&
      Math.abs(num(maxS) - Math.max(...ys)) < 0.15;
    if (!ok) {
      console.log("  MATH MISMATCH:", label, JSON.stringify({ people, meanS, minS, maxS }),
        "expected", JSON.stringify({ n: ys.length, mean: Math.round(meanE * 10) / 10, min: Math.min(...ys), max: Math.max(...ys) }));
      mathBad++;
    }
  });
  console.log(`bucket math: ${tableRows.length} buckets checked against survey.json, ${mathBad} mismatches`);
  if (mathBad) failures++;

  // ---------- 2b. full coverage: table buckets jointly cover every answered pair
  console.log(`coverage: table buckets cover ${covered} of ${pts.length} answered pairs`);
  if (covered !== pts.length) {
    console.log("  COVERAGE FAIL: bucket ranges don't cover all answered pairs");
    failures++;
  }

  // ---------- 3. table twin must be aggregate-only
  await p.evaluate(() => {
    [...document.querySelectorAll(".builder .chart-views button")]
      .find((b) => b.innerText.trim() === "table")
      ?.click();
  });
  await p.waitForTimeout(300);
  const tbl = await p.evaluate(() => {
    const headers = [...document.querySelectorAll(".builder .data-table th")].map((h) => h.innerText);
    const firstCol = [...document.querySelectorAll(".builder .data-table tbody tr td:first-child")].map(
      (c) => c.innerText
    );
    return { headers, firstCol: firstCol.slice(0, 6) };
  });
  console.log("table headers:", JSON.stringify(tbl.headers));
  const personRows = tbl.firstCol.filter((c) => /^#\d+$/.test(c)).length;
  const aggOk = tbl.headers.includes("bucket") && personRows === 0;
  console.log(aggOk ? "table is aggregate-only OK" : `FAIL: table leaks persons (${personRows})`);
  if (!aggOk) failures++;

  // ---------- 4. heatmap full coverage: fav1A × residence (residence has >10 cats)
  await p.selectOption("#x-axis", "residence");
  await p.selectOption("#y-axis", "attend1A");
  await p.waitForTimeout(500);
  const heatTotal = await p.evaluate(() => {
    // switch to table view for exact numbers
    [...document.querySelectorAll(".builder .chart-views button")]
      .find((b) => b.innerText.trim() === "table")
      ?.click();
    return new Promise((res) =>
      setTimeout(() => {
        const cells = [...document.querySelectorAll(".builder .data-table tbody td")]
          .map((c) => parseInt(c.innerText, 10))
          .filter((v) => Number.isFinite(v));
        res(cells.reduce((a, b) => a + b, 0));
      }, 250)
    );
  });
  const expectHeat = survey.rows.reduce((a, r) => {
    const xs = Array.isArray(r.residence) ? r.residence : r.residence ? [r.residence] : [];
    const ys = Array.isArray(r.attend1A) ? r.attend1A : r.attend1A ? [r.attend1A] : [];
    return a + xs.length * ys.length;
  }, 0);
  console.log(`heatmap coverage: table total ${heatTotal}, expected cross-pairs ${expectHeat}`);
  if (heatTotal !== expectHeat) {
    console.log("  HEATMAP COVERAGE FAIL");
    failures++;
  }

  await b.close();
  server.close();
  console.log(failures === 0 ? "COVERAGE RECHECK PASS" : `COVERAGE RECHECK: ${failures} failures`);
  process.exit(failures ? 1 : 0);
})();
