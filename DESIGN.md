# "Quiet" — Design System

Book-serif minimalism on white. Quality lives in **type, measure, and restraint** — no chrome, no shadows, no accent colors. Everything is monochrome grayscale; hierarchy comes from *tone and size*, never color. Copy the rules below verbatim, swap in your content.

---

## 1. Principles
- **Monochrome.** Grayscale only. No brand/accent color. Emphasis = darker text, never a hue.
- **Flat.** No drop shadows, no gradients, no glassmorphism. Layer with 1px borders + faint background shifts.
- **Thin & tight.** 1px borders, 3–6px radii, hairline dividers.
- **Serif-first.** Body and headings are a serif (Lora). Sans is reserved for numeric/technical readouts.
- **Restraint.** Generous whitespace, quiet hover states, lowercase labels. If in doubt, remove it.
- **Theme-aware.** Every token has a light and dark value; nothing is hardcoded.

---

## 2. Color

Tokens (CSS variables). **Left = light mode, right = dark mode.**

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg-white` | `#ffffff` | `#0f0f0f` | Primary surface (main panel) |
| `bg-light` | `#f7f7f7` | `#151515` | Secondary surface (barely-there gray) |
| `bg-card` | `#f5f5f5` | `#191919` | Card / raised block fill |
| `card-translucent` | `rgba(0,0,0,.03)` | `rgba(255,255,255,.05)` | Overlay tint |
| `text-primary` | `#171717` | `#ededed` | Headings, key text |
| `text-secondary` | `#525252` | `#a3a3a3` | Body text |
| `text-muted` | `#737373` | `#8a8a8a` | Labels, captions, metadata |
| `border-card` | `#e5e5e5` | `#262626` | All borders & dividers |

**Rules**
- Backgrounds sit within **~2–3% lightness** of each other — surfaces are distinguished by a *whisper*, not contrast.
- Text has exactly **3 levels**: primary (near-black/near-white), secondary, muted. Use them as a strict hierarchy.
- Selection: `rgba(0,0,0,.08)` light / `rgba(255,255,255,.14)` dark.
- Dark mode is a near-black **`#0f0f0f`**, not pure black; text is **`#ededed`**, not pure white.

---

## 3. Typography

| Role | Font | Notes |
|---|---|---|
| Everything | **Serif** (Lora → Georgia → Times) | Default `font-family` on `<html>` |
| Numbers / time / technical | **Sans** (Geist Sans) | Pair with `tabular-nums` |

**Scale** (rem / px):

| Token | Size | Use |
|---|---|---|
| `xs` | `.875rem` / 14 | Footer links, fine print |
| `sm` | `.9375rem` / 15 | List/body text |
| `base` | `1rem` / 16 | Base |
| `lg` | `1.125rem` / 18 | Prose |
| `xl` | `2.25rem` / 36 | Display / name |

**Rules**
- Body `line-height: 1.6`; headings tighter (`1.15–1.25`). No letter-spacing.
- Weights: **400** default, **700** for the one big display heading. Nothing in between.
- **Italic** is the accent device (placeholders, artist/meta lines, asides) — never bold-for-emphasis.
- Display heading: serif, bold, fluid `clamp(2.1rem, 1.8rem + 1.2vw, 2.5rem)`.
- Section headers: **lowercase**, serif, `text-muted`, `15px`, trailing em dash — e.g. `about —`, `projects —`.
- `-webkit-font-smoothing: antialiased`.

---

## 4. Layout

- **Split panel** on desktop, single column on mobile.
  - `grid grid-cols-1 lg:grid-cols-[2fr_3fr]`, `min-h-screen lg:h-screen lg:overflow-hidden`.
  - **Left (2fr):** `bg-white`, sticky identity/intro; scrolls independently.
  - **Right (3fr):** `bg-light`, `lg:border-l`, content feed; scrolls independently.
  - Below `lg`: stack to one column, **window** scrolls.
- Panel padding: `p-8 lg:p-16` (32 → 64px).
- Two-column masonry for card lists via index alternation (even→left, odd→right).
- Hide scrollbars (`scrollbar-width: none`).

---

## 5. Spacing & Radius
- **Fluid section gaps** with viewport-aware `clamp`, e.g. `mt-[clamp(1.25rem,3.5vh,2.5rem)]`. Vertical rhythm breathes with screen height.
- Base rhythm ~4/8px; component gaps `gap-1`…`gap-4`.
- **Radius:** `sm 3px`, `md 6px`. That's the ceiling — nothing more rounded. Pills/circles only for icon-buttons.

---

## 6. Surfaces, Borders, Elevation
- **No shadows.** Depth = a `1px border-card` outline and/or a `bg-card` fill one step off the page.
- Dividers: `1px` full-bleed lines in `border-card` (or `h-px` element).
- Cards: `bg-card` + `rounded-[3–6px]`, optional `1px` border. Flat.
- (Only exception in the source: a modal uses a soft shadow — treat elevation as rare and deliberate.)

---

## 7. Components

- **Links:** `text-muted`, `underline decoration-1 underline-offset-[3px] decoration-[muted/50]`, → hover `text-primary`. Underline-on-rest, color-shift-on-hover.
- **Buttons / toggles / filters:** text-only, serif, small (`13px`). Active = `text-primary` + underline; idle = `text-muted` → hover `text-primary`. No filled buttons.
- **Inputs:** borderless except a `1px` bottom border (`border-card`); serif, often italic placeholder in `text-muted/70`; focus = border darkens to `text-muted`, no ring/outline.
- **Icons:** monochrome via `currentColor` or CSS mask. Sizes: inline-in-text **14px** (baseline-nudged ~+2px), list/logo **32px** (`rounded-[3px]`), social **~16–24px**. Idle `opacity .5` → hover `opacity 1`.
- **Metadata rows:** `text-muted`, sans + `tabular-nums` for numbers.

---

## 8. Motion
- **Entrance:** staggered fade-up (opacity + ~8px rise). Container staggers children ~`0.08s`, `delayChildren ~0.15s`. Scroll sections reveal once on view.
- **Hover:** color/opacity only (muted→primary), `transition ~300–500ms`, ease-out. No scale/bounce on content.
- **Scroll:** momentum smoothing (Lenis-style) — `duration 0.9`, exponential ease-out `1.001 − 2^(−10t)`, wheel/touch multiplier `1.4`.
- **Always** honor `prefers-reduced-motion: reduce` → disable transforms, keep opacity or go static.

---

## 9. Extending the system (for anything not shown here)

- **Accent color?** Default is *none*. If you must: pick **one** low-saturation hue, use it only for interactive affordance (a link/focus), never fills or large areas. Keep it dim enough to sit beside grays without shouting.
- **Semantic states** (success/error/warning/info): use **desaturated, muted** versions (e.g. muted green/red/amber/blue), applied as *text or 1px border tints*, not loud background fills. Match the grayscale energy level.
- **Focus rings:** prefer a 1px border-color darken or a faint `text-muted` outline over bright glows.
- **New surfaces:** derive from the 3-surface ramp (`white → light → card`); keep new tones within ~3% lightness of a neighbor.
- **New type roles:** stay on the 14/15/16/18/36 ladder; add sizes by interpolating, keep serif unless it's a numeric/technical readout (then sans + `tabular-nums`).
- **New components** (tables, tooltips, tags, chips, nav): 1px `border-card`, `3–6px` radius, `text-muted` labels, serif, flat fills, generous padding, quiet hover. When unsure, do **less**.

**One-line summary:** grayscale, serif, flat, hairline borders, tiny radii, fluid whitespace, and hover states that only shift tone — never color, never shadow, never bounce.
