import { survey } from "./data";

export interface SectionMeta {
  id: string;
  title: string;
  blurb: string;
}

export const SECTIONS: SectionMeta[] = [
  { id: "identity", title: "who we are", blurb: "68 people, four birth years, one program." },
  { id: "admissions", title: "getting in", blurb: "the averages we came with, and when the offers landed." },
  { id: "firstyear", title: "first year", blurb: "1A, 1B, and what they did to us." },
  { id: "coop", title: "co-op", blurb: "the first work term: who got what, where, and for how much." },
  { id: "sleep", title: "sleep & survival", blurb: "caffeine in, sleep out." },
  { id: "takes", title: "taste & takes", blurb: "the questions with no wrong answers. mostly." },
  { id: "words", title: "in our own words", blurb: "everything you typed, exactly as you typed it." },
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

export const PRESETS: Preset[] = [
  { name: "does the grind pay?", quip: "applications sent vs. hourly wage", x: "jobsApplied", y: "wage" },
  { name: "the great deflation", quip: "the average you came with vs. the one 1A gave you", x: "applyAvg", y: "avg1A", identity: true },
  { name: "high school vs. university", quip: "HS final average vs. first-year average", x: "hsAvg", y: "cumAvg", identity: true },
  { name: "money vs. marks", quip: "first-year average vs. co-op wage", x: "cumAvg", y: "wage" },
  { name: "show up, cash out", quip: "1A attendance vs. 1A average", x: "attend1A", y: "avg1A" },
  { name: "the corruption arc", quip: "rice purity, before vs. after Waterloo", x: "ricePurity", y: "riceWaterloo", identity: true },
  { name: "caffeine economy", quip: "daily caffeine vs. first-year average", x: "caffeine", y: "cumAvg" },
  { name: "sleep is optional", quip: "all-nighters vs. longest time awake", x: "allNighters", y: "longestAwake" },
  { name: "tab hoarders", quip: "open tabs vs. first-year average", x: "tabs", y: "cumAvg" },
  { name: "keeners got in early?", quip: "acceptance date vs. admission average", x: "accepted", y: "applyAvg" },
  { name: "residence politics", quip: "where you lived vs. what you call the best residence", x: "residence", y: "bestRes" },
  { name: "milk-first maniacs", quip: "cereal order vs. rating Waterloo as a city", x: "cerealMilk", y: "rateCity" },
  { name: "tall confidence", quip: "height vs. confidence tron was the right call", x: "heightCm", y: "confidence" },
];
