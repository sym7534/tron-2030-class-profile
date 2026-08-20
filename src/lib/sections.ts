import { survey } from "./data";

export interface SectionMeta {
  id: string;
  title: string;
}

export const SECTIONS: SectionMeta[] = [
  { id: "identity", title: "who we are" },
  { id: "admissions", title: "getting in" },
  { id: "firstyear", title: "first year" },
  { id: "coop", title: "co-op" },
  { id: "sleep", title: "sleep & survival" },
  { id: "takes", title: "taste & takes" },
  { id: "words", title: "in our own words" },
];

/** field ids per section, in survey order, excluding derived-only fields */
export function sectionFieldIds(sectionId: string): string[] {
  return survey.fields
    .filter((f) => f.section === sectionId && !f.hideCard)
    .map((f) => f.id);
}

/** global question numbering across the whole page */
export function questionNumbers(): Record<string, number> {
  let q = 0;
  const out: Record<string, number> = {};
  for (const s of SECTIONS) {
    for (const id of sectionFieldIds(s.id)) {
      q += 1;
      out[id] = q;
    }
  }
  return out;
}

export interface Preset {
  name: string;
  quip: string;
  x: string;
  y: string; // "count" for univariate
  identity?: boolean;
}

/** Cross-question comparison cards that lead their section, before the
 *  single-question cards. Same aggregate-bucket presentation as the builder. */
export interface SectionComparison {
  y: string;
  x: string;
  title: string;
  note?: string;
}

export const SECTION_COMPARISONS: Record<string, SectionComparison[]> = {
  coop: [
    { y: "wage", x: "cumAvg", title: "Hourly pay vs. cumulative average" },
    { y: "wage", x: "workCity", title: "Hourly pay vs. location" },
  ],
  firstyear: [
    { y: "cumAvg", x: "hsAvg", title: "Uni average vs. high school average" },
    { y: "cumAvg", x: "fromGroup", title: "Uni average vs. hometown" },
    {
      y: "cumAvg",
      x: "caffeine",
      title: "Uni average vs. daily caffeine",
      note: "the thought-provoking one: does the mg arms race pay off?",
    },
    { y: "cumAvg", x: "enriched", title: "Uni average vs. high school program" },
  ],
};

export const PRESETS: Preset[] = [
  { name: "does the grind pay?", quip: "applications sent vs. hourly wage", x: "jobsApplied", y: "wage" },
  { name: "the great deflation", quip: "the average you came with vs. the one 1A gave you", x: "applyAvg", y: "avg1A", identity: true },
  { name: "high school vs. university", quip: "HS final average vs. first-year average", x: "hsAvg", y: "cumAvg", identity: true },
  { name: "money vs. marks", quip: "first-year average vs. co-op wage", x: "cumAvg", y: "wage" },
  { name: "show up, cash out", quip: "1A attendance vs. 1A average", x: "attend1A", y: "avg1A" },
  { name: "the corruption arc", quip: "rice purity, before vs. after Waterloo", x: "ricePurity", y: "riceWaterloo", identity: true },
];
