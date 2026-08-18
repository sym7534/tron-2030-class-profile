// GitHub Pages runs Jekyll by default, which drops _next/ (underscore dirs);
// an empty .nojekyll file in the export root disables that.
const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "..", "out");
if (fs.existsSync(path.join(out, "index.html"))) {
  fs.writeFileSync(path.join(out, ".nojekyll"), "");
  console.log("Wrote out/.nojekyll");
}
