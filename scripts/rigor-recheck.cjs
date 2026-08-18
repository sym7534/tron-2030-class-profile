/* Independent rigor recheck: parse every rendered SVG axis and assert clean steps */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3233;
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

(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 25)); }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(1500);

  const audit = await p.evaluate(() => {
    const CLEAN = (step, mag) => {
      const norm = step / mag;
      return [1, 2, 5, 10].some((m) => Math.abs(norm - m) < 0.01);
    };
    const out = { charts: 0, badSteps: [], pies: 0, badPies: [], titledAxes: 0 };

    // numeric tick sequences per svg: gather axis label texts that parse as numbers
    for (const svg of document.querySelectorAll("article svg, .builder svg")) {
      const texts = [...svg.querySelectorAll("text")]
        .filter((t) => !t.getAttribute("transform")) // skip rotated titles
        .map((t) => ({ v: parseFloat(t.textContent.replace(/[km%$,]/gi, "")), raw: t.textContent, anchor: t.getAttribute("text-anchor"), x: +t.getAttribute("x"), y: +t.getAttribute("y") }))
        .filter((t) => Number.isFinite(t.v));
      // y-axis candidates: anchor=end, same x
      const yAxis = texts.filter((t) => t.anchor === "end");
      const byX = new Map();
      for (const t of yAxis) {
        const k = Math.round(t.x);
        if (!byX.has(k)) byX.set(k, []);
        byX.get(k).push(t.v);
      }
      for (const [k, vals] of byX) {
        if (vals.length < 3) continue;
        vals.sort((a, b) => a - b);
        const steps = [];
        for (let i = 1; i < vals.length; i++) steps.push(+(vals[i] - vals[i - 1]).toFixed(6));
        const uniq = [...new Set(steps.map((s) => s.toFixed(4)))];
        out.charts++;
        if (uniq.length > 1) {
          out.badSteps.push({ kind: "uneven", vals: vals.slice(0, 8) });
        } else {
          const step = steps[0];
          const mag = 10 ** Math.floor(Math.log10(Math.abs(step) || 1));
          if (!CLEAN(step, mag)) out.badSteps.push({ kind: "unclean", step, vals: vals.slice(0, 8) });
        }
      }
      if ([...svg.querySelectorAll("text")].some((t) => t.getAttribute("transform"))) out.titledAxes++;
    }

    // pies: legend percentages should total ~100 (allowing rounding)
    for (const pie of document.querySelectorAll("[data-pie]")) {
      out.pies++;
      const pcts = [...pie.querySelectorAll(".pie-legend .tnum")]
        .map((el) => {
          const m = el.textContent.match(/(\d+)%/);
          return m ? +m[1] : null;
        })
        .filter((v) => v !== null);
      const sum = pcts.reduce((a, b) => a + b, 0);
      if (pcts.length && (sum < 95 || sum > 105)) out.badPies.push({ pcts, sum });
    }
    return out;
  });

  console.log(JSON.stringify(audit, null, 1));
  const ok = audit.badSteps.length === 0 && audit.badPies.length === 0 && audit.pies > 0;
  console.log(ok ? "RIGOR RECHECK PASS" : "RIGOR RECHECK FAIL");
  await b.close();
  server.close();
  process.exit(ok ? 0 : 1);
})();
