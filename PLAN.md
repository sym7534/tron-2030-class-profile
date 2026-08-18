# Tron 2030 Class Profile — Technical Plan

## Stack

- **Next.js 15 + TypeScript, static export** (`output: "export"`) — no server, deployable anywhere (Vercel / GitHub Pages).
- **No chart library.** Hand-rolled SVG React components — full control over the monochrome aesthetic, tiny bundle.
- **Vanilla CSS** custom properties (no Tailwind). Tokens from `DESIGN.md` ("Quiet" system), light mode only per brief.
- **Fonts:** `Endless.ttf` (display, via `next/font/local`) · Lora (serif body) · Geist (sans, numbers only, `tabular-nums`).

## Data pipeline — `scripts/build-data.mjs`

`xlsx → src/data/survey.json` at build time (`npm run data`, auto-runs in `npm run build`).

- Emits `{ n, fields, rows, report }`: 68 respondent rows × 81 typed fields + a full audit report.
- **Name/Email columns are never read.** Respondents are `resp: 1..68`.
- Field kinds: `numeric | categorical | ordinal | multi | text | date`.
- **Verbatim-first philosophy:** normalize only where needed for aggregation/crossing
  (teachers, residences, design teams, cities, MBTI, heights→cm, screen time→h/day,
  Excel-serial acceptance dates). Free-text walls stay raw — typos, jokes and all.
- Every exclusion (`"1,000,000 km"`), merge (`"trelford goat" → Ryan Trelford`) and
  assumption (2026 acceptance dates → year-typo → 2025) is recorded in `report` and
  **surfaced on the cards** — the nine spellings of Trelford are a feature, not noise.
- Derived fields: `cumAvg` (mean 1A/1B), `fromGroup`, `hasCoop`, `heightCm`, `screenHrs`.

## Chart engine — `src/components/charts/`

All monochrome SVG, shared specs (dataviz-skill compliant): bars ≤24px with 4px rounded
data-ends, 2px surface gaps, hairline solid gridlines, ≥8px dots with 2px white rings,
tooltips on ≥24px hit targets (nearest-point for scatter), every chart has a table-view twin.

| Primitive | Used for |
|---|---|
| `BarsH` | categorical / multi / ordinal distributions (horizontal, count at tip) |
| `Columns` + `Histogram` | numeric distributions; integer scales (1–10) get one column per value; skewed fields (distance, tabs) get log-ish bins |
| `Scatter` | numeric × numeric — deterministic jitter on integer scales, optional trendline + Pearson r, optional y=x identity line for same-unit pairs |
| `Strip` | category × numeric — jittered dot rows + median tick per row |
| `Heatmap` | category × category — gray sequential fill, count / row-% toggle |
| `Waffle` | 68 dots, one per respondent — binary/small questions + hero motif (17×4 grid) |
| `WordWall` | verbatim text answers; exact-duplicate grouping only |

## The Graph Builder (centerpiece)

Any stat × any stat. Resolution rules:

| X kind | Y kind | Chart |
|---|---|---|
| any | *count* (default) | that field's univariate chart |
| numeric/date | numeric/date | Scatter (+ r, trendline; identity line when units match) |
| cat/ordinal/multi | numeric | Strip (ordered rows, median ticks) |
| numeric | cat/ordinal/multi | axes swapped → Strip |
| cat/ordinal/multi | cat/ordinal/multi | Heatmap (count or row-%) |

- `multi` fields explode (a respondent can appear in several rows); caption states it.
- Extras: swap-axes button, optional **filter** (any categorical field = chosen values,
  e.g. "stream 8 only"), n / r / median readout line.
- **Presets row** above the chart ("does the grind pay?" `jobsApplied × wage`,
  "the deflation" `applyAvg × avg1A` with y=x line, "corruption arc"
  `ricePurity × riceWaterloo`, "show up, cash out" `attend1A × avg1A`, …).
- Text fields are excluded from axes (they live in the walls).

## Page architecture (single scroll)

1. **Sticky hairline nav** — anchor links per chapter.
2. **Hero** — "MECHATRONICS 2030" in Endless, 68-dot waffle (the signature motif),
   4 hero stats (median 1A avg, median wage, total apps sent, median caffeine).
3. **The instrument** — the graph builder, full width.
4. **Chapters** of per-question cards (2-col responsive grid, every question appears):
   `who we are` · `getting in` · `first year` · `co-op` · `sleep & survival` ·
   `taste & takes` · `in our own words` (walls & quotes).
5. Each `QuestionCard`: Q-number eyebrow, question text, auto chart by kind
   (+ per-field overrides: MBTI 4×4 grid, acceptance-date timeline, height dual-unit),
   n= caption, cleaning footnotes, chart/table toggle.

## Verification (multi-agent, after build)

1. **Data audit workflow** — agents independently recompute each column's distribution
   from the xlsx and diff against `survey.json`; verify every merge/exclusion.
2. **Review workflow** — Playwright screenshots → design critique vs `DESIGN.md`/brief,
   stats correctness, code review, responsive/a11y pass. Fixes applied, then re-shot.
