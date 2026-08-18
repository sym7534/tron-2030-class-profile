# Mechatronics 2030 — Class Profile

A static stats site built from the 68 responses to the MTE 2030 class survey.
One big graph builder ("the instrument") that crosses any stat against any other,
plus a graphic for every one of the 78 questions.

## Run it

```sh
npm install
npm run build     # parses the xlsx -> survey.json, then builds the static site
npm run preview   # serves out/ at http://localhost:3300
```

`npm run dev` works for development; `npm run data` re-runs just the spreadsheet
pipeline (`scripts/build-data.mjs`) if the survey file changes.

## Deploying (GitHub Pages)

The repo ships with `.github/workflows/deploy.yml`. To go live:

1. Create a GitHub repo and push this project (`main` branch).
2. In the repo: Settings → Pages → Source: **GitHub Actions**.
3. Every push to `main` rebuilds and deploys to
   `https://<user>.github.io/<repo>/` (the workflow sets the base path
   automatically; with a custom domain it deploys at the root instead).

Notes:
- **The survey xlsx is gitignored** — it contains names and emails, and GitHub
  Pages repos on free accounts must be public. CI builds from the committed,
  name-free `src/data/survey.json`; regenerate it locally with `npm run data`
  whenever the spreadsheet changes, and commit the JSON.
- Pages sites are always public (no auth). The deployed bundle contains the
  cleaned survey data — same rows the site displays.
- `out/` also deploys as-is to Vercel or Netlify if you ever switch.

## How it's put together

- **Next.js 15 + TypeScript, static export** — no server; everything ships in `out/`.
- **`scripts/build-data.mjs`** turns the survey xlsx into `src/data/survey.json`:
  68 typed respondent rows, per-field metadata, and a full audit report. Names and
  emails are never read. Free-text answers stay verbatim; whatever had to be merged
  or set aside to be countable is disclosed on the question's card.
- **Hand-rolled SVG charts** (`src/components/charts/`) — monochrome, per the
  "Quiet" design system in `DESIGN.md`. Custom display font: Endless (`src/fonts/`).
- **The graph builder** (`src/components/GraphBuilder.tsx`) resolves the chart type
  from the two picked fields (scatter / dot-rows / heatmap / distribution) and
  mirrors its state into the URL hash, so graphs are shareable links.

Windows note: OneDrive sync corrupts Next's build cache mid-build, so
`scripts/junction.cjs` (run automatically before `dev`/`build`) makes
`.next/cache` a junction to `C:\Users\<you>\.tron-2030-next-cache`, outside
OneDrive, and pre-clears `out/` so the exporter never races OneDrive's locks.
If a build still fails with EBUSY on `out/`, something (an old preview server)
is holding it — close it and rerun.

## Verification

Run against a built `out/` (each script serves it and drives headless Chromium):

```sh
node scripts/audit.cjs      # recompute stats from the ORIGINAL xlsx, diff vs survey.json
node scripts/verify.cjs     # every card renders a graphic; all 6 chart modes; mobile; console errors
node scripts/stress.cjs     # all 12 presets + 138 axis pairs render something
node scripts/share.cjs      # #gx/#gy URL sharing round-trips
node scripts/sections.cjs   # screenshots each chapter into shots/
```

`audit.cjs` is deliberately independent of the build pipeline: it re-reads the
spreadsheet and checks row counts, column sums, derived fields, plausible ranges,
that every excluded value is genuinely absent, and that no name or email leaked
into the JSON.

See `PLAN.md` for the full technical plan.
