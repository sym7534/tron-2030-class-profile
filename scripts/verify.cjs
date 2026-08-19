const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = 3222;
const URL = `http://127.0.0.1:${PORT}`;
const OUT = "shots";
const ROOT = path.join(process.cwd(), "out");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".txt": "text/plain",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let f = decodeURIComponent(req.url.split("?")[0]);
      if (f.endsWith("/")) f += "index.html";
      let fp = path.join(ROOT, f);
      if (!fs.existsSync(fp) && fs.existsSync(fp + ".html")) fp += ".html";
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404);
        return res.end("not found");
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
      fs.createReadStream(fp).pipe(res);
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1200);
  // scroll through to trigger every ResizeObserver
  await page.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let y = 0; y < h; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);

  // ---- audit: does every question card have a visible graphic?
  const audit = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("article[id^='q-'], article[id^='cmp-']")];
    const empty = [];
    for (const c of cards) {
      const svg = c.querySelector("svg");
      const wall = c.querySelector(".word-wall, .quote-wall, blockquote, [data-mbti]");
      const hasText = (c.innerText || "").trim().length > 40;
      const svgOk = svg && svg.getBoundingClientRect().height > 10;
      if (!svgOk && !wall && !hasText) empty.push(c.id);
      else if (!svgOk && !wall) empty.push(c.id + " (text only?)");
    }
    return {
      cards: cards.length,
      empty,
      svgs: document.querySelectorAll("svg").length,
      zeroHeightSvgs: [...document.querySelectorAll("svg")].filter(
        (s) => s.getBoundingClientRect().height < 4
      ).length,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });

  console.log("AUDIT", JSON.stringify(audit, null, 1));

  await page.screenshot({ path: `${OUT}/01-hero.png` });
  await page.evaluate(() => document.querySelector("#builder").scrollIntoView());
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/02-builder.png` });

  // exercise the builder across chart modes
  const combos = [
    ["applyAvg", "avg1A", "scatter"],
    ["stream", "cumAvg", "strip"],
    ["residence", "bestRes", "heatmap"],
    ["ethnicity", "political", "strip-multi"],
    ["mbti", "count", "uni-cat"],
    ["wage", "count", "uni-num"],
  ];
  for (const [x, y, name] of combos) {
    await page.selectOption("#x-axis", x);
    await page.selectOption("#y-axis", y);
    await page.waitForTimeout(600);
    const ok = await page.evaluate(() => {
      const b = document.querySelector(".builder");
      const svg = b.querySelector("svg");
      return {
        title: b.querySelector(".builder-title")?.innerText,
        svgH: svg ? Math.round(svg.getBoundingClientRect().height) : 0,
        caption: b.querySelector(".chart-caption")?.innerText?.slice(0, 90),
      };
    });
    console.log("COMBO", name, JSON.stringify(ok));
    await page.evaluate(() => document.querySelector("#builder").scrollIntoView());
    await page.screenshot({ path: `${OUT}/03-builder-${name}.png` });
  }

  // table twin
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".builder .chart-views button")];
    btns.find((b) => b.innerText.trim() === "table")?.click();
  });
  await page.waitForTimeout(400);
  const tableRows = await page.evaluate(
    () => document.querySelectorAll(".builder .data-table tbody tr").length
  );
  console.log("TABLE ROWS", tableRows);

  // full page
  await page.screenshot({ path: `${OUT}/04-full.png`, fullPage: true });

  // mobile
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(URL, { waitUntil: "load" });
  await m.waitForTimeout(1200);
  const mob = await m.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > 392,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  console.log("MOBILE", JSON.stringify(mob));
  await m.screenshot({ path: `${OUT}/05-mobile.png`, fullPage: false });

  console.log("CONSOLE ERRORS", errors.length ? errors.slice(0, 12) : "none");
  await browser.close();
  server.close();
})();
