/* Serve the static export at http://localhost:3300 — the reliable way to view the
   site on Windows, where `next dev` trips over the out-of-OneDrive distDir. */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3300;
const ROOT = path.join(__dirname, "..", "out");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

if (!fs.existsSync(path.join(ROOT, "index.html"))) {
  console.error("No out/index.html — run `npm run build` first.");
  process.exit(1);
}

http
  .createServer((req, res) => {
    let f = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
    if (f.endsWith("/")) f += "index.html";
    let fp = path.join(ROOT, f);
    if (!fp.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end("forbidden");
    }
    if (!fs.existsSync(fp) && fs.existsSync(fp + ".html")) fp += ".html";
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/html" });
      return res.end(fs.readFileSync(path.join(ROOT, "404.html"), "utf8"));
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    fs.createReadStream(fp).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`Mechatronics 2030 class profile → http://localhost:${PORT}`);
  });
