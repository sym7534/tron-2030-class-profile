# Mechatronics 2030 — Class Profile

A static stats site built from the 68 responses to the MTE 2030 class survey.
One big graph builder ("the instrument") that crosses any stat against any other,
plus a graphic for every one of the 78 questions.

## Run it

```sh
npm install
npm run build     # parses the xlsx -> survey.json, then builds the static site
npx serve out     # or deploy the out/ folder anywhere (Vercel, GitHub Pages, …)
```

`npm run dev` for local development. `npm run data` re-runs just the spreadsheet
pipeline (`scripts/build-data.mjs`) if the survey file changes.

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

Windows note: the Next build directory is kept outside OneDrive
(`C:\Users\<you>\tron-2030-build`) because OneDrive sync corrupts `.next`
mid-build; `scripts/copy-out.mjs` copies the export back to `./out`.

See `PLAN.md` for the full technical plan.
