/* Independent audit: recompute stats from the ORIGINAL xlsx and diff vs survey.json */
const XLSX = require("xlsx");
const fs = require("fs");

const wb = XLSX.readFile("Mechatronics Engineering 2030Class Survey(1-68).xlsx");
const sheet = wb.Sheets[wb.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
const header = raw[0];
const body = raw.slice(1).filter((r) => r.some((c) => c !== undefined && c !== ""));

const survey = JSON.parse(fs.readFileSync("src/data/survey.json", "utf8"));
const fail = [];
const ok = [];

function check(name, a, b, tol = 0) {
  const pass = tol ? Math.abs(a - b) <= tol : a === b;
  (pass ? ok : fail).push(`${name}: xlsx=${a} json=${b}${pass ? "" : "  <<< MISMATCH"}`);
}

// 1. row count
check("respondent rows", body.length, survey.rows.length);
check("survey.n", body.length, survey.n);

// 2. no name/email leaked into the json
const blob = JSON.stringify(survey);
const nameCols = header
  .map((h, i) => [String(h || ""), i])
  .filter(([h]) => /name|email|e-mail/i.test(h));
let leaked = 0;
for (const [h, i] of nameCols) {
  for (const r of body) {
    const v = r[i];
    if (typeof v === "string" && v.trim().length > 3 && blob.includes(v.trim())) leaked++;
  }
}
check(`PII leaked from ${nameCols.length} name/email column(s)`, 0, leaked);

// 3. numeric fields: recompute from the source column
function colValues(colIdx) {
  return body.map((r) => r[colIdx]);
}
const numericChecks = [
  ["avg1A", 0.05],
  ["avg1B", 0.05],
  ["hsAvg", 0.05],
  ["applyAvg", 0.05],
  ["wage", 0.05],
  ["rent", 0.5],
  ["jobsApplied", 0.5],
  ["caffeine", 0.5],
  ["tabs", 0.5],
  ["allNighters", 0.5],
];
for (const [id, tol] of numericChecks) {
  const f = survey.fields.find((x) => x.id === id);
  if (!f || f.col == null) { fail.push(`${id}: no column mapping`); continue; }
  const jsonVals = survey.rows.map((r) => r[id]).filter((v) => typeof v === "number");
  const rep = survey.report[id] || { excluded: [] };
  // raw numeric parse of the source column
  const rawNums = colValues(f.col)
    .map((v) => {
      if (typeof v === "number") return v;
      if (typeof v !== "string") return null;
      const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
      return m ? parseFloat(m[0]) : null;
    })
    .filter((v) => v !== null);
  const expectedCount = rawNums.length - rep.excluded.length;
  // the pipeline rejects values the naive regex happily parses (GPA scales, "18,5/20",
  // "1%"), so only assert the json never INVENTS values the source doesn't support.
  if (jsonVals.length > rawNums.length) {
    fail.push(`${id}: json has MORE values (${jsonVals.length}) than the source column (${rawNums.length})`);
  } else {
    ok.push(`${id} count: source parseable=${rawNums.length} excluded=${rep.excluded.length} json=${jsonVals.length} (naive-expected ${expectedCount})`);
  }
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  // sum only comparable when nothing was transformed
  if (expectedCount === jsonVals.length && rep.excluded.length === 0) {
    check(`${id} sum`, Math.round(sum(rawNums) * 100) / 100, Math.round(sum(jsonVals) * 100) / 100, tol * jsonVals.length);
  }
}

// 4. categorical fields: every json label traces to real source text
const catChecks = ["gender", "stream", "pineapple", "cerealMilk", "alcohol", "handedness"];
for (const id of catChecks) {
  const f = survey.fields.find((x) => x.id === id);
  if (!f || f.col == null) continue;
  const srcNonEmpty = colValues(f.col).filter((v) => v !== undefined && String(v).trim() !== "").length;
  const jsonNonNull = survey.rows.filter((r) => r[id] !== null && r[id] !== undefined).length;
  const rep = survey.report[id] || { excluded: [] };
  check(`${id} answered`, srcNonEmpty - rep.excluded.length, jsonNonNull);
}

// 5. derived cumAvg = mean(avg1A, avg1B)
let cumBad = 0;
for (const r of survey.rows) {
  const a = r.avg1A, b = r.avg1B, c = r.cumAvg;
  const expect = typeof a === "number" && typeof b === "number" ? (a + b) / 2
    : typeof a === "number" ? a : typeof b === "number" ? b : null;
  if (expect === null ? c !== null : Math.abs(c - expect) > 0.005001) cumBad++; // json rounds to 2dp
}
check("cumAvg derivation errors", 0, cumBad);

// 6. percentage fields inside a plausible range
for (const id of ["avg1A", "avg1B", "hsAvg", "applyAvg", "cumAvg"]) {
  const bad = survey.rows.map((r) => r[id]).filter((v) => typeof v === "number" && (v < 30 || v > 100)).length;
  check(`${id} out-of-range values`, 0, bad);
}

// 7. every excluded value must be genuinely absent from the rows
let ghost = 0;
for (const [id, rep] of Object.entries(survey.report)) {
  for (const e of rep.excluded || []) {
    const n = parseFloat(String(e.raw).replace(/,/g, ""));
    if (Number.isFinite(n) && survey.rows.some((r) => r[id] === n)) ghost++;
  }
}
check("excluded values still present in rows", 0, ghost);

console.log("=== PASS ===");
ok.forEach((l) => console.log("  " + l));
console.log("\n=== FAIL ===");
if (!fail.length) console.log("  none");
fail.forEach((l) => console.log("  " + l));
process.exit(fail.length ? 1 : 0);
