/* verify the builder's new empty default state */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3247;
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
  await p.waitForTimeout(1300);
  let failures = 0;

  const st = await p.evaluate(() => ({
    title: document.querySelector(".builder-title")?.innerText,
    prompt: document.querySelector(".builder .chart-frame")?.innerText.slice(0, 90),
    xVal: document.querySelector("#x-axis").value,
    yVal: document.querySelector("#y-axis").value,
    xFirst: document.querySelector("#x-axis option").innerText,
    tryOne: document.body.innerText.includes("try one:"),
    hash: location.hash,
  }));
  console.log(JSON.stringify(st, null, 1));

  const ok =
    st.title === "Compare any stat against any other" &&
    /Build your own graph here/.test(st.prompt) &&
    st.xVal === "" &&
    st.yVal === "" &&
    /select/.test(st.xFirst) &&
    !st.tryOne &&
    st.hash === "";
  console.log(ok ? "EMPTY STATE OK" : "EMPTY STATE FAIL");
  if (!ok) failures++;

  // picking axes still works from empty
  await p.selectOption("#x-axis", "cumAvg");
  await p.selectOption("#y-axis", "wage");
  await p.waitForTimeout(600);
  const after = await p.evaluate(() => ({
    title: document.querySelector(".builder-title")?.innerText,
    svgH: Math.round(document.querySelector(".builder .chart-frame svg")?.getBoundingClientRect().height ?? 0),
    hash: location.hash,
  }));
  console.log(JSON.stringify(after));
  const ok2 = /Hourly wage vs\./.test(after.title) && after.svgH > 200 && /gx=cumAvg/.test(after.hash);
  console.log(ok2 ? "SELECT FLOW OK" : "SELECT FLOW FAIL");
  if (!ok2) failures++;

  // presets removed by design — nothing to click

  await p.screenshot({ path: "shots/19-empty-builder.png" });
  await b.close();
  server.close();
  console.log(failures === 0 ? "BUILDER DEFAULT PASS" : `BUILDER DEFAULT: ${failures} failures`);
  process.exit(failures ? 1 : 0);
})();
