/* After the text bump: detect SVG text clipped by its svg viewport or colliding
   with chart edges, plus any element overflowing the page horizontally. */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3238;
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

  for (const [name, width] of [["desktop", 1440], ["mobile", 390]]) {
    const p = await b.newPage({ viewport: { width, height: 1000 } });
    await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
    await p.evaluate(async () => {
      const h = document.body.scrollHeight;
      for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 20)); }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(1300);

    const report = await p.evaluate(() => {
      const out = { clipped: [], pageOverflow: [] };
      // svg text clipped by the svg bounds (tolerance 1px)
      for (const svg of document.querySelectorAll("svg")) {
        const sb = svg.getBoundingClientRect();
        if (sb.width === 0) continue;
        for (const t of svg.querySelectorAll("text")) {
          const tb = t.getBoundingClientRect();
          if (tb.width === 0) continue;
          if (tb.left < sb.left - 1 || tb.right > sb.right + 1 || tb.top < sb.top - 1 || tb.bottom > sb.bottom + 1) {
            const card = svg.closest("article");
            out.clipped.push({
              text: t.textContent.slice(0, 30),
              card: card?.id ?? "builder/hero",
              off: Math.round(Math.max(sb.left - tb.left, tb.right - sb.right, sb.top - tb.top, tb.bottom - sb.bottom)),
            });
          }
        }
      }
      // horizontal page overflow culprits
      const docW = document.documentElement.clientWidth;
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > docW + 2 || r.left < -2) && !el.closest("svg")) {
          out.pageOverflow.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), right: Math.round(r.right - docW) });
          if (out.pageOverflow.length > 8) break;
        }
      }
      return out;
    });

    // dedupe clipped by card
    const byCard = {};
    for (const c of report.clipped) {
      byCard[c.card] = byCard[c.card] ?? { count: 0, worst: 0, sample: c.text };
      byCard[c.card].count++;
      byCard[c.card].worst = Math.max(byCard[c.card].worst, c.off);
    }
    console.log(`--- ${name} (${width}px)`);
    console.log("clipped text by card:", JSON.stringify(byCard, null, 1));
    console.log("page overflow:", JSON.stringify(report.pageOverflow.slice(0, 6)));
    await p.close();
  }

  await b.close();
  server.close();
})();
