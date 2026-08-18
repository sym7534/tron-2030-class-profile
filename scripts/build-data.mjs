/**
 * build-data.mjs — parses the class survey xlsx into clean, typed JSON.
 *
 * Output: src/data/survey.json
 *   { n, generatedFrom, fields, rows, report }
 *
 * Privacy: the Email and Name columns are never read into the output.
 * Every exclusion / merge / assumption is recorded in `report` so the site
 * can footnote it and reviewers can audit it.
 */
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const XL = path.join(ROOT, "Mechatronics Engineering 2030Class Survey(1-68).xlsx");
const OUT = path.join(ROOT, "src", "data", "survey.json");

// The xlsx holds names/emails, so it is gitignored and absent in CI — there we
// build from the committed, already-cleaned survey.json instead.
if (!fs.existsSync(XL)) {
  if (fs.existsSync(OUT)) {
    console.log("Survey xlsx not present — using the committed src/data/survey.json as-is.");
    process.exit(0);
  }
  console.error(`Neither ${path.basename(XL)} nor src/data/survey.json found — nothing to build from.`);
  process.exit(1);
}

const wb = XLSX.read(fs.readFileSync(XL));
const sheet = wb.Sheets[wb.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
const rawRows = raw.slice(1); // drop header

// ---------------------------------------------------------------- utilities

const report = {}; // fieldId -> { excluded: [{raw, reason}], merged: {}, notes: [] }
function rep(id) {
  if (!report[id]) report[id] = { excluded: [], merged: {}, notes: [] };
  return report[id];
}
function exclude(id, rawVal, reason) {
  rep(id).excluded.push({ raw: String(rawVal), reason });
  return null;
}
function merge(id, canonical, rawVal) {
  const raw = String(rawVal).trim();
  if (raw !== canonical) {
    const m = rep(id).merged;
    if (!m[canonical]) m[canonical] = [];
    if (!m[canonical].includes(raw)) m[canonical].push(raw);
  }
  return canonical;
}
function note(id, text) {
  const n = rep(id).notes;
  if (!n.includes(text)) n.push(text);
}

const str = (v) => (v === null || v === undefined ? null : String(v).trim() || null);

function num(id, v, { min = -Infinity, max = Infinity, extract = false } = {}) {
  const s = str(v);
  if (s === null) return null;
  const cleaned = s.replace(/%/g, "").replace(/\$/g, "").replace(/,/g, "").trim();
  if (/^n\/?a$/i.test(cleaned) || /^idk/i.test(cleaned)) return exclude(id, v, "not a number");
  // honest exclusion reasons for other grading systems (extract fields only)
  if (extract && /gpa/i.test(s)) return exclude(id, v, "GPA scale, not a percentage");
  if (extract && /\/\s*20/.test(s)) return exclude(id, v, "20-point scale, not a percentage");
  const n = Number(cleaned);
  if (Number.isFinite(n)) {
    if (n < min || n > max) return exclude(id, v, `outside plausible range ${min}–${max}`);
    return n;
  }
  if (extract) {
    // pull the first percentage-looking number out of a noisy answer
    const m = cleaned.match(/(\d{2,3}(?:\.\d+)?)/);
    if (m) {
      const x = Number(m[1]);
      if (x >= min && x <= max) return merge(id, String(x), s), x;
      return exclude(id, v, `outside plausible range ${min}–${max}`);
    }
  }
  return exclude(id, v, "could not parse as a number");
}

// Excel serial -> JS Date (UTC)
const serialToDate = (serial) => new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
const isoDay = (d) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------- normalizers

function mapCategory(id, v, table, { keepUnmapped = true } = {}) {
  const s = str(v);
  if (s === null) return null;
  const key = s.toLowerCase().replace(/\s+/g, " ").trim();
  for (const [canonical, patterns] of table) {
    for (const p of patterns) {
      if (typeof p === "string" ? p === key : p.test(key)) {
        return canonical === null ? exclude(id, v, "unusable answer") : merge(id, canonical, s);
      }
    }
  }
  if (!keepUnmapped) return exclude(id, v, "unrecognized");
  return s;
}

function splitMulti(v) {
  const s = str(v);
  if (s === null) return [];
  return s.split(";").map((x) => x.trim()).filter(Boolean);
}

// -------- height -> cm
const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11 };
function parseHeight(id, v) {
  const s = str(v);
  if (s === null) return null;
  const low = s.toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  // explicit cm (or bare 150-220 number)
  const cm = low.match(/(\d{3}(?:\.\d+)?)\s*(?:cm)?/);
  if (cm && Number(cm[1]) >= 140 && Number(cm[1]) <= 220) {
    return merge(id, `${Math.round(Number(cm[1]))} cm`, s), Math.round(Number(cm[1]) * 10) / 10;
  }
  // feet & inches, tolerant of "5'7", "6'", "6 ft", "5 foot 9", "5ft9", "5 FOOT FIVE!!!!"
  const ft = low.match(/([4-7])\s*(?:'|ft|foot|feet)\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven)?/);
  if (ft) {
    const feet = Number(ft[1]);
    let inches = 0;
    if (ft[2]) inches = WORDNUM[ft[2]] ?? Number(ft[2]);
    if (!Number.isFinite(inches) || inches > 11.9) inches = 0;
    const val = Math.round((feet * 12 + inches) * 2.54 * 10) / 10;
    return val;
  }
  return exclude(id, v, "could not parse as a height");
}

// -------- screen time -> hours/day
function parseScreenTime(id, v) {
  const s = str(v);
  if (s === null) return null;
  const low = s.toLowerCase();
  const m = low.match(/(\d+(?:\.\d+)?)/);
  if (!m) return exclude(id, v, "no number found");
  let hours = Number(m[1]);
  if (/week/.test(low)) {
    hours = hours / 7;
    note(id, `weekly figures (“${s}”) converted to per-day`);
  }
  if (hours > 24) return exclude(id, v, "more hours than a day has");
  return Math.round(hours * 10) / 10;
}

// -------- acceptance date
function parseAcceptDate(id, v) {
  if (v === null || v === "") return null;
  const serial = Number(v);
  if (!Number.isFinite(serial)) return exclude(id, v, "not a date");
  let d = serialToDate(serial);
  const y = d.getUTCFullYear();
  if (y === 2026 || y === 2023) {
    // offers for Fall 2025 entry all landed in early-to-mid 2025; these are year typos
    d = new Date(Date.UTC(2025, d.getUTCMonth(), d.getUTCDate()));
    note(id, "answers dated 2023/2026 were assumed to be year-typos and shifted to 2025");
  } else if (y !== 2025 && y !== 2024) {
    return exclude(id, isoDay(d), "date far outside the admission cycle");
  }
  const month = d.getUTCMonth(); // 0-based
  if (month > 7) return exclude(id, isoDay(d), "date outside the admission cycle");
  return isoDay(d);
}

// ---------------------------------------------------------------- field defs
// kind: numeric | categorical | ordinal | multi | text | date
// Every categorical/multi normalizer records merges + exclusions in `report`.

const C = (canonical, ...patterns) => [canonical, patterns];

const FROM_TABLE = [
  C("Alberta", "alberta", "canada - alberta"),
  C("KW / Cambridge", "kitchener/waterloo/cambridge"),
  C("Canadian, grew up abroad", /canadian but i lived abroad/),
  C("Middle East", "iran"),
];

const FROM_GROUP = {
  GTA: "Ontario", "Ontario (Other)": "Ontario", "KW / Cambridge": "Ontario",
  Alberta: "Western Canada", "British Columbia": "Western Canada",
  Quebec: "Eastern Canada", "Atlantic Canada": "Eastern Canada",
  USA: "International", "South Asia": "International", "East Asia": "International",
  "Southeast Asia": "International", Africa: "International", "Middle East": "International",
  "Canadian, grew up abroad": "International",
};

const ENRICHED_TABLE = [
  C("None", "none"),
  C("AP", "ap", "few ap courses"),
  C("IB", "ib", "gr 11 ib, dropped for gr 12"),
  C("Gifted / Enhanced", "gifted/enhanced"),
  C("Private school", "private school"),
  C("French immersion", "french immersion"),
  C("CEGEP", "cegep"),
  C("SHSM / SMR", /^shsm/),
  C("Dual enrollment", "dual enrollment"),
  C("Francophone school", /francophone schooling/),
];

const EXTRAC_TABLE = [
  C("Volunteering", "volunteering"),
  C("Competed at a competitive level", "competed at a competitive level at anything"),
  C("Non-engineering club", "non engineering-related club"),
  C("Organized sports", "organized sports"),
  C("Club leadership", "leadership in a student club"),
  C("Robotics", "robotics"),
  C("Non-engineering job", "non-engineering related job"),
  C("Other leadership", "any leadership"),
  C("Engineering club", "engineering-related club"),
  C("Art / music / theatre", "art, music, theatre, etc."),
  C("Internship", "high school internship"),
  C("Engineering job", "engineering related job"),
  C("None", "none"),
  C("Other", "other", "chess"),
];

const PROGRAMS_TABLE = [
  C("Engineering", "engineering"),
  C("Computer Science", "computer science"),
  C("Mathematics", "mathematics"),
  C("Health Science", "health science"),
  C("Biology / Chemistry", "biology/chemistry"),
  C("Business", "business"),
  C("Accounting / Finance", "accounting/finance"),
  C("Science & Aviation", "science and aviation"),
  C("Physics", "physics"),
  C("Arts / Humanities", "arts/humanities"),
  C("Environment", "environment"),
  C("Architecture", "architecture"),
];

// favourite teacher: free text, many spellings; multi because some named two
function parseTeachers(id, v) {
  const s = str(v);
  if (s === null) return [];
  const low = s.toLowerCase();
  if (/idk any/.test(low)) { exclude(id, s, "didn't know names"); return []; }
  const out = new Set();
  if (/trel|tred|tref/.test(low)) out.add(merge(id, "Ryan Trelford", s));
  if (/cramer|kramer|creamer|zack|zach/.test(low)) out.add(merge(id, "Zack Cramer", s));
  if (/barakat|abdullah/.test(low)) out.add(merge(id, "Abdullah Barakat", s));
  if (/bedi/.test(low)) out.add(merge(id, "Sanjeev Bedi", s));
  if (/teng/.test(low)) out.add(merge(id, "Teng Cui", s));
  if (/xie|daniel/.test(low)) out.add(merge(id, "Daniel Xie", s));
  if (/robinson/.test(low)) out.add(merge(id, "Mary Robinson", s));
  if (/circuits ta/.test(low)) out.add(merge(id, "The circuits lab TA", s));
  if (/^ash\b/.test(low)) out.add(merge(id, "Ash", s));
  if (out.size === 0) { exclude(id, s, "could not identify"); return []; }
  return [...out];
}

const COOP_TABLE = [
  C("WaterlooWorks", "yes, through waterlooworks"),
  C("Own means / networking", /yes, through my own means/),
  C("BETS / eCo-op / WE Accelerate", /bets\/eco-op\/we accelerate/),
  C("Design team", "yes, i'm working for a design team"),
  C("Other", "yes, other"),
  C("Not this term", "no, but i will next term"),
];

const JOBTYPE_TABLE = [
  C("Software", "software"),
  C("Mechanical", "mechanical"),
  C("Hardware", "hardware"),
  C("Project management", "project management"),
  C("Research", "research"),
  C("Other", "technician", "design", "drone ops", "quality engineering", "testing",
    /^manual testing/, "data collection", /wix|google analytics|marketing/),
  C(null, "."),
];

const HOWGOT_TABLE = [
  C("WaterlooWorks — Cycle 1", "waterlooworks - cycle 1"),
  C("WaterlooWorks — Cycle 2", "waterlooworks - cycle 2"),
  C("WaterlooWorks — Cycle 3+", "waterlooworks - cycle 3 and after"),
  C("External application", "external application"),
  C("Connections", "through my own connections"),
  C("Cold email", "cold email"),
  C(null, "n/a"),
];

const CITY_TABLE = [
  C("Waterloo", "waterloo", "wateroo", "waterloo, ontario", "waterloo, on"),
  C("Toronto", "toronto"),
  C("Remote", "remote", /remote job/),
  C("Markham", "markham"),
  C("Cambridge", "cambridge", "cambridge, ontario"),
  C("Calgary", "calgary"),
  C("Mississauga", "mississauga"),
  C("San Francisco", "san francisco", "sf"),
  C("Ottawa", "ottawa"),
  C("Vaughan", "concord, vaughan"),
  C("Etobicoke", "etobicoke"),
  C("Lacombe, AB", "lacombe, alberta"),
  C("St. Marys, ON", "st. mary’s", "st. mary's"),
  C("Sarnia, ON", "sarnia on"),
  C("Halifax", "halifax, nova scotia"),
  C("Austin, TX", "austin, tx, usa"),
  C("Burbank, CA", "burbank, ca, usa"),
  C("Salford, ON", "salford, ontario"),
  C("Rivière-du-Loup, QC", /rivi/),
  C("Winnipeg", "winnipeg"),
  C("Edmonton", "edmonton"),
  C("Montreal", "montreal"),
  C("Guelph", "guelph"),
  C("Newmarket", "newmarket"),
  C("Barrie", "barrie"),
  C("Somewhere in BC", "bc"),
  C(null, "n/a"),
];

const RES_TABLE = [
  C("V1", "v1"),
  C("CMH", "cmh"),
  C("UWP", "uwp", /^uwp\b/, "beck hall", "eby hall", "eby hall in uwp", "uwp beck hall", "uwp north court", "woolwich in uwp", "beck halll"),
  C("REV", "rev"),
  C("MKV", "mkv"),
  C("United College", "united college", "united college (formerly st. paul's)", "united college (formerly st. paul’s)"),
  C("St. Jerome's", "st jeromes"),
  C("Off campus", "off campus", "home", "no", "rented a place"),
  C("V1", "v1/cmh"), // primary = first named
  C("UWP", "uwp/cmh"),
  // WIS / WOS / WES are official UW Place court codes (Wilmot, Woolwich,
  // Wellesley — South buildings), so they roll up into UWP
  C("UWP", "wis", "wos", "wes"),
];

const BESTRES_TABLE = [
  C("CMH", "cmh"),
  C("UWP", "uwp", /^uwp\b/, "beck hall", "beck halll", "woolwich in uwp"),
  C("V1", "v1"),
  C("MKV", "mkv"),
  C("REV", "rev"),
  C("United College", "united college"),
  C("St. Jerome's", "st jeromes"),
  C("None of them", "none of them (off campus)", "none."),
  C("Def not United", "def not united"),
  C("Not WOS", "not wos"),
  C("Not REV", "not rev"),
  C(null, "idk"),
];

// design teams: free text, split on separators, regex mapping
function parseDesignTeams(id, v) {
  const s = str(v);
  if (s === null) return [];
  const low = s.toLowerCase();
  if (/^(no|none|n\/a)$/.test(low)) return [];
  if (/^my$/.test(low)) {
    exclude(id, s, "answer appears cut off");
    return [];
  }
  const out = new Set();
  if (/waton|wato\b|watonomous/.test(low)) out.add(merge(id, "WATonomous", s));
  // "warg failure" = didn't get in — not counted as WARG
  if (/warg/.test(low) && !/warg failure/.test(low)) out.add(merge(id, "WARG", s));
  if (/rocketry/.test(low)) out.add(merge(id, "Waterloo Rocketry", s));
  // "FSAE" also maps to UWFE: the old combustion FSAE team merged into it,
  // and UWFE itself competes under the FSAE banner (uwfsae.ca)
  if (/uwfe|formula|fsae/.test(low)) out.add(merge(id, "UW Formula Electric", s));
  if (/watbot/.test(low)) out.add(merge(id, "WATBOTs", s));
  if (/biotron/.test(low)) out.add(merge(id, "Biotron", s));
  if (/midnight sun/.test(low)) out.add(merge(id, "Midnight Sun", s));
  if (/baja/.test(low)) out.add(merge(id, "Baja SAE", s));
  if (/asic/.test(low)) out.add(merge(id, "UWASIC", s));
  if (/waturbine/.test(low)) out.add(merge(id, "WATurbine", s));
  if (/vex/.test(low)) out.add(merge(id, "UW VEX U", s));
  if (/uwaft/.test(low)) note(id, "“possibly UWAFT soon” not counted as membership");
  if (out.size === 0) exclude(id, s, "no recognizable team");
  return [...out];
}

// met friends: free text keyword extraction -> multi
function parseMetFriends(id, v) {
  const s = str(v);
  if (s === null) return [];
  const low = s.toLowerCase();
  const out = new Set();
  if (/all of (these|the above)/.test(low)) { out.add(merge(id, "All of the above", s)); return [...out]; }
  if (/class/.test(low)) out.add(merge(id, "Class", s));
  if (/\bres\b|residence|floor|roommate/.test(low)) out.add(merge(id, "Residence", s));
  if (/before|highschool|high school/.test(low)) out.add(merge(id, "Knew them before", s));
  if (/o.?week|orientation/.test(low)) out.add(merge(id, "Orientation", s));
  if (/design team/.test(low)) out.add(merge(id, "Design team", s));
  if (/club/.test(low)) out.add(merge(id, "Clubs", s));
  if (/sport/.test(low)) out.add(merge(id, "Sports team", s));
  if (/discord/.test(low)) out.add(merge(id, "Discord", s));
  if (/friends of friends/.test(low)) out.add(merge(id, "Friends of friends", s));
  if (/ran into them|six seven|randomly talking/.test(low)) out.add(merge(id, "Just ran into them", s));
  if (out.size === 0) exclude(id, s, "could not categorize");
  return [...out];
}

const MBTI_ARCHETYPES = { COMMANDER: "ENTJ", VIRTUOSO: "ISTP", ADVOCATE: "INFJ", EXECUTIVE: "ESTJ" };
function parseMbti(id, v) {
  const s = str(v);
  if (s === null) return null;
  const up = s.toUpperCase().trim();
  for (const [arch, type] of Object.entries(MBTI_ARCHETYPES)) {
    if (up.includes(arch)) return merge(id, type, s);
  }
  const m = up.match(/\b([EI][NS][TF][JP])\b/);
  if (m) return up === m[1] ? m[1] : merge(id, m[1], s);
  return exclude(id, s, "not an MBTI type");
}

const ALCOHOL_TABLE = [
  C("Yes", "yes"),
  C("No", "no"),
  C("Sometimes", "sometimes", /like 5 times/, "like a bit", /twice a year/, /sometimes but never drunk/),
];
const COOKED_TABLE = [
  C("Yes", "yes"),
  C("No", "no"),
  C("Sometimes", "sometimes", /like 10 times/, /relgious holiday|religious holiday/),
];
// joke write-ins ("wha", "bruh this shit so long") stay verbatim — they're data
const CEREAL_TABLE = [
  C("Milk first", "milk"),
  C("Cereal first", "cereal"),
];
const PINEAPPLE_TABLE = [
  C("Yes", "yes"),
  C("No", "no"),
  C("No preference", "no preference"),
];
const PARENTS_TABLE = [
  C("Both", "yes, both"),
  C("One", "yes, one"),
  C("Neither", "none of my parents attended university"),
  // "Probably? … My mom went to McMaster though." — one parent definitely did
  C("One", /probably\?/),
  C("It's complicated", "yes, but it's complicated"),
];
const HAND_TABLE = [
  C("Right", "right handed"),
  C("Left", "left handed"),
  C("Ambidextrous", "amb"),
];
const OS_TABLE = [
  C("Windows", "windows"),
  C("macOS", "macos"),
  C("Linux", "linux", "arch btw"),
];
const NOTES_TABLE = [
  C("iPad / tablet", "ipad/tablet"),
  C("Notebook", "notebook"),
  C("Laptop", "laptop"),
  C("I don't take notes", "i don't take notes", /bro thinks i go to class/),
];
// free-text "walls" are kept verbatim — typos, jokes and all; the WordWall
// component only groups case-insensitive exact duplicates for counting

const SEX_TABLE = [
  C("Heterosexual", "heterosexual (straight)"),
  C("Bisexual", "bisexual"),
  C("Homosexual", "homosexual"),
  C("Prefer not to say", "prefer not to say"),
  // "Im into Ryan Wang" stays verbatim — a survey classic
];

// ---------------------------------------------------------------- schema

const ORDER_CAME = ["Born here!", "Before Elementary School", "During Elementary School", "During Middle School", "During High School", "During University"];
const ORDER_IMMIG = ["First generation (I immigrated here)", "Second generation (My parents immigrated here)", "Third generation (My grandparents immigrated here)", "Fourth generation or more", "Not applicable to me"];
const IMMIG_SHORT = { "First generation (I immigrated here)": "First gen", "Second generation (My parents immigrated here)": "Second gen", "Third generation (My grandparents immigrated here)": "Third gen", "Fourth generation or more": "Fourth gen+", "Not applicable to me": "N/A" };
const ORDER_ATTEND = ["Never", "Rarely", "Every now and then", "Around half the time", "Most of the time", "Almost Always"];
const ORDER_LATEST = ["12 am", "1 am", "2 am", "3 am", "4 am", "5 am", "6 am", "7 am", "8 am", "9 am", "10 am", "11 am"];
const ORDER_EARLIEST = ["4 pm", "5 pm", "6 pm", "7 pm", "8 pm", "9 pm", "10 pm", "11 pm", "12 am"];

// section ids: identity, admissions, firstyear, coop, sleep, takes, words
const FIELDS = [
  { id: "gender", col: 6, kind: "categorical", section: "identity", label: "What is your gender?", short: "Gender" },
  { id: "birthYear", col: 7, kind: "ordinal", section: "identity", label: "What is your birth year?", short: "Birth year", order: ["2005", "2006", "2007", "2008"], parse: (v, id) => str(v) },
  { id: "from", col: 8, kind: "categorical", section: "identity", label: "Where are you from?", short: "Hometown", parse: (v, id) => mapCategory(id, v, FROM_TABLE) },
  { id: "fromGroup", col: null, kind: "categorical", section: "identity", label: "Where are you from? (grouped)", short: "Home region", derived: true, hideCard: true },
  { id: "ethnicity", col: 9, kind: "multi", section: "identity", label: "What is your ethnicity?", short: "Ethnicity", parse: (v, id) => splitMulti(v) },
  { id: "religion", col: 10, kind: "multi", section: "identity", label: "What are your religious beliefs?", short: "Religion", parse: (v, id) => splitMulti(v) },
  { id: "cameToCanada", col: 11, kind: "ordinal", section: "identity", label: "When did you come to Canada?", short: "Came to Canada", order: ORDER_CAME },
  { id: "sexuality", col: 12, kind: "categorical", section: "identity", label: "What is your sexuality?", short: "Sexuality", parse: (v, id) => mapCategory(id, v, SEX_TABLE) },
  { id: "relationship", col: 13, kind: "categorical", section: "identity", label: "Relationship status?", short: "Relationship", lowN: true },
  { id: "political", col: 14, kind: "numeric", section: "identity", label: "Where do you land on the political spectrum? (1 = far left, 9 = far right)", short: "Political lean", unit: "", intScale: [1, 9], parse: (v, id) => num(id, v, { min: 1, max: 9 }) },
  { id: "immigration", col: 15, kind: "ordinal", section: "identity", label: "Which best describes your immigration background?", short: "Immigration", order: ORDER_IMMIG, shortLabels: IMMIG_SHORT },
  { id: "parentsUni", col: 16, kind: "categorical", section: "identity", label: "Did your parents attend university?", short: "Parents attended uni", parse: (v, id) => mapCategory(id, v, PARENTS_TABLE) },
  { id: "distanceKm", col: 17, kind: "numeric", section: "identity", label: "How far is your hometown from Waterloo?", short: "Hometown distance", unit: "km", logBins: true, parse: (v, id) => num(id, v, { min: 0, max: 20015 }) },
  { id: "heightCm", col: 74, kind: "numeric", section: "identity", label: "How tall are you?", short: "Height", unit: "cm", parse: (v, id) => parseHeight(id, v) },
  { id: "handedness", col: 73, kind: "categorical", section: "identity", label: "Handedness?", short: "Handedness", parse: (v, id) => mapCategory(id, v, HAND_TABLE) },

  { id: "hsAvg", col: 18, kind: "numeric", section: "admissions", label: "What was your raw final high school average?", short: "HS final average", unit: "%", parse: (v, id) => num(id, v, { min: 50, max: 100, extract: true }) },
  { id: "applyAvg", col: 19, kind: "numeric", section: "admissions", label: "What average did you apply to Waterloo with?", short: "Admission average", unit: "%", parse: (v, id) => num(id, v, { min: 50, max: 100, extract: true }) },
  { id: "enriched", col: 20, kind: "multi", section: "admissions", label: "Did you do an enriched program in high school?", short: "Enriched program", parse: (v, id) => { let opts = splitMulti(v).map((o) => mapCategory(id, o, ENRICHED_TABLE)).filter(Boolean); if (opts.length > 1) opts = opts.filter((o) => o !== "None"); return [...new Set(opts)]; } },
  { id: "extracurriculars", col: 21, kind: "multi", section: "admissions", label: "What were your high school extracurriculars?", short: "HS extracurriculars", parse: (v, id) => { let opts = splitMulti(v).map((o) => mapCategory(id, o, EXTRAC_TABLE)).filter(Boolean); if (opts.length > 1) opts = opts.filter((o) => o !== "None"); return [...new Set(opts)]; } },
  { id: "accepted", col: 22, kind: "date", section: "admissions", label: "When were you accepted into Mechatronics Engineering?", short: "Acceptance date", parse: (v, id) => parseAcceptDate(id, v) },
  { id: "programs", col: 23, kind: "multi", section: "admissions", label: "What programs did you apply to?", short: "Programs applied to", parse: (v, id) => [...new Set(splitMulti(v).map((o) => mapCategory(id, o, PROGRAMS_TABLE)).filter(Boolean))] },
  { id: "confidence", col: 24, kind: "numeric", section: "admissions", label: "How confident were you that engineering / mechatronics was what you wanted to do?", short: "Confidence in tron", intScale: [1, 10], parse: (v, id) => num(id, v, { min: 1, max: 10 }) },
  { id: "stream", col: 25, kind: "categorical", section: "admissions", label: "What stream are you?", short: "Stream", parse: (v, id) => (str(v) ? `Stream ${str(v)}` : null) },

  { id: "fav1A", col: 26, kind: "categorical", section: "firstyear", label: "Favourite class of 1A?", short: "Favourite 1A class" },
  { id: "fav1B", col: 27, kind: "categorical", section: "firstyear", label: "Favourite class of 1B?", short: "Favourite 1B class" },
  { id: "favClass", col: 28, kind: "categorical", section: "firstyear", label: "Favourite class of first year?", short: "Favourite class" },
  { id: "worstClass", col: 29, kind: "categorical", section: "firstyear", label: "Worst class of first year?", short: "Worst class" },
  { id: "avg1A", col: 30, kind: "numeric", section: "firstyear", label: "1A term average?", short: "1A average", unit: "%", parse: (v, id) => num(id, v, { min: 40, max: 100 }) },
  { id: "avg1B", col: 31, kind: "numeric", section: "firstyear", label: "1B term average?", short: "1B average", unit: "%", parse: (v, id) => num(id, v, { min: 40, max: 100 }) },
  { id: "cumAvg", col: null, kind: "numeric", section: "firstyear", label: "First-year average (1A & 1B averaged; a single term where that's all there is yet)", short: "First-year average", unit: "%", derived: true, hideCard: true },
  { id: "attend1A", col: 32, kind: "ordinal", section: "firstyear", label: "How often did you attend class in 1A?", short: "1A attendance", order: ORDER_ATTEND },
  { id: "attend1B", col: 33, kind: "ordinal", section: "firstyear", label: "How often did you attend class in 1B?", short: "1B attendance", order: ORDER_ATTEND, parse: (v, id) => { const s = str(v); if (s === null) return null; if (/^n\/a/i.test(s)) return exclude(id, s, "N/A (stream 4)"); return s; } },
  { id: "rate1A", col: 34, kind: "numeric", section: "firstyear", label: "On a scale from 1–10, rate your 1A term.", short: "1A term rating", intScale: [1, 10], parse: (v, id) => num(id, v, { min: 1, max: 10 }) },
  { id: "rate1B", col: 35, kind: "numeric", section: "firstyear", label: "On a scale from 1–10, rate your 1B term.", short: "1B term rating", intScale: [1, 10], parse: (v, id) => num(id, v, { min: 1, max: 10 }) },
  { id: "favTeacher", col: 36, kind: "multi", section: "firstyear", label: "Who was / is your favourite teacher from first year?", short: "Favourite teacher", parse: (v, id) => parseTeachers(id, v) },
  { id: "residence", col: 67, kind: "categorical", section: "firstyear", label: "What residence did you live in first year?", short: "Residence", parse: (v, id) => mapCategory(id, v, RES_TABLE) },
  { id: "bestRes", col: 69, kind: "categorical", section: "firstyear", label: "Best Waterloo residence?", short: "Best residence", parse: (v, id) => mapCategory(id, v, BESTRES_TABLE) },
  { id: "commute", col: 75, kind: "categorical", section: "firstyear", label: "How did you commute to campus in your first year?", short: "Commute" },
  { id: "notes", col: 77, kind: "multi", section: "firstyear", label: "How do you take notes?", short: "Note-taking", parse: (v, id) => [...new Set(splitMulti(v).map((o) => mapCategory(id, o, NOTES_TABLE)).filter(Boolean))] },
  { id: "os", col: 76, kind: "multi", section: "firstyear", label: "What OS do you use?", short: "Operating system", parse: (v, id) => [...new Set(splitMulti(v).map((o) => mapCategory(id, o, OS_TABLE)).filter(Boolean))] },
  { id: "tabs", col: 78, kind: "numeric", section: "firstyear", label: "How many tabs do you have open right now?", short: "Open tabs", logBins: true, parse: (v, id) => num(id, v, { min: 0, max: 10000 }) },
  { id: "metFriends", col: 79, kind: "multi", section: "firstyear", label: "How did you meet most of your friends at Waterloo?", short: "Met friends via", parse: (v, id) => parseMetFriends(id, v) },
  { id: "designTeam", col: 71, kind: "multi", section: "firstyear", label: "What design team are you on (if you're on one)?", short: "Design team", parse: (v, id) => parseDesignTeams(id, v) },

  { id: "coopVia", col: 37, kind: "multi", section: "coop", label: "Did you manage to secure a co-op job for your first work term?", short: "Co-op secured via", parse: (v, id) => [...new Set(splitMulti(v).map((o) => mapCategory(id, o, COOP_TABLE)).filter(Boolean))] },
  { id: "hasCoop", col: null, kind: "categorical", section: "coop", label: "Secured a co-op for the first work term?", short: "Has co-op", derived: true, hideCard: true },
  { id: "likeJob", col: 38, kind: "numeric", section: "coop", label: "On a scale from 1–10, how much do you like your job?", short: "Job rating", intScale: [1, 10], parse: (v, id) => num(id, v, { min: 1, max: 10 }) },
  { id: "workCity", col: 39, kind: "categorical", section: "coop", label: "What city are you working in?", short: "Work city", parse: (v, id) => mapCategory(id, v, CITY_TABLE) },
  { id: "company", col: 40, kind: "text", section: "coop", label: "What company are you working for?", short: "Company" },
  { id: "wage", col: 41, kind: "numeric", section: "coop", label: "What is your hourly wage?", short: "Hourly wage", unit: "$/h", parse: (v, id) => num(id, v, { min: 0, max: 200 }) },
  { id: "howGotJob", col: 42, kind: "categorical", section: "coop", label: "How did you get your job?", short: "Job source", parse: (v, id) => mapCategory(id, v, HOWGOT_TABLE) },
  { id: "jobType", col: 43, kind: "multi", section: "coop", label: "What do you do at your job?", short: "Job type", parse: (v, id) => [...new Set(splitMulti(v).map((o) => mapCategory(id, o, JOBTYPE_TABLE)).filter(Boolean))] },
  { id: "jobsApplied", col: 44, kind: "numeric", section: "coop", label: "How many jobs did you apply to for your first work term?", short: "Applications sent", parse: (v, id) => num(id, v, { min: 0, max: 5000 }) },
  { id: "rent", col: 45, kind: "numeric", section: "coop", label: "Monthly rent for your first work term?", short: "Monthly rent", unit: "$", parse: (v, id) => num(id, v, { min: 0, max: 10000 }) },

  { id: "longestAwake", col: 46, kind: "numeric", section: "sleep", label: "What was the longest period of time (in hours) you went without sleep?", short: "Longest awake", unit: "h", parse: (v, id) => num(id, v, { min: 0, max: 200 }) },
  { id: "latestUp", col: 47, kind: "ordinal", section: "sleep", label: "When was the latest you stayed up?", short: "Latest bedtime", order: ORDER_LATEST, parse: (v, id) => { const s = str(v); if (s === null) return null; if (/^option/i.test(s)) return exclude(id, s, "un-labelled form option"); return s; } },
  { id: "earliestSleep", col: 48, kind: "ordinal", section: "sleep", label: "When was the earliest you went to sleep?", short: "Earliest bedtime", order: ORDER_EARLIEST, parse: (v, id) => { const s = str(v); if (s === null) return null; if (/^option/i.test(s)) return exclude(id, s, "un-labelled form option"); return s; } },
  { id: "caffeine", col: 49, kind: "numeric", section: "sleep", label: "How much caffeine (in mg) do you consume every day?", short: "Daily caffeine", unit: "mg", parse: (v, id) => num(id, v, { min: 0, max: 2000 }) },
  { id: "allNighters", col: 50, kind: "numeric", section: "sleep", label: "How many all-nighters did you pull in first year?", short: "All-nighters", parse: (v, id) => num(id, v, { min: 0, max: 200 }) },
  { id: "screenHrs", col: 61, kind: "numeric", section: "sleep", label: "Average daily screen time this week / month?", short: "Screen time", unit: "h/day", lowN: true, parse: (v, id) => parseScreenTime(id, v) },
  { id: "alcohol", col: 53, kind: "categorical", section: "sleep", label: "Do you drink alcohol?", short: "Drinks alcohol", parse: (v, id) => mapCategory(id, v, ALCOHOL_TABLE) },
  { id: "cooked", col: 54, kind: "categorical", section: "sleep", label: "Did you cook during your first year?", short: "Cooked in first year", parse: (v, id) => mapCategory(id, v, COOKED_TABLE) },

  { id: "button", col: 51, kind: "categorical", section: "takes", label: "Everyone votes red or blue. Blue > 50% — everyone survives. Blue ≤ 50% — blue voters die, red voters survive. Which do you press?", short: "Red / blue button" },
  { id: "sonDaughter", col: 52, kind: "categorical", section: "takes", label: "yc b2b saas pre-revenue son or abg cmo microinfluencer daughter?", short: "Son or daughter", lowN: true },
  { id: "cerealMilk", col: 63, kind: "categorical", section: "takes", label: "Cereal or milk first?", short: "Cereal or milk", parse: (v, id) => mapCategory(id, v, CEREAL_TABLE) },
  { id: "pineapple", col: 68, kind: "categorical", section: "takes", label: "Pineapple on pizza?", short: "Pineapple on pizza", parse: (v, id) => mapCategory(id, v, PINEAPPLE_TABLE) },
  { id: "mbti", col: 55, kind: "categorical", section: "takes", label: "Myers-Briggs personality type?", short: "MBTI", parse: (v, id) => parseMbti(id, v) },
  { id: "ricePurity", col: 56, kind: "numeric", section: "takes", label: "What is your rice purity test score?", short: "Rice purity", lowN: true, parse: (v, id) => num(id, v, { min: 0, max: 100 }) },
  { id: "riceWaterloo", col: 57, kind: "numeric", section: "takes", label: "What is your Waterloo rice purity test score?", short: "Waterloo rice purity", lowN: true, parse: (v, id) => num(id, v, { min: 0, max: 100 }) },
  { id: "rateCity", col: 70, kind: "numeric", section: "takes", label: "On a scale from 1–10, rate Waterloo as a city.", short: "Waterloo city rating", intScale: [1, 10], parse: (v, id) => num(id, v, { min: 1, max: 10 }) },

  { id: "game", col: 60, kind: "text", section: "words", label: "What is your favourite video game?", short: "Favourite game" },
  { id: "artist", col: 58, kind: "text", section: "words", label: "Who is your favourite artist?", short: "Favourite artist" },
  { id: "song", col: 59, kind: "text", section: "words", label: "What is your favourite song?", short: "Favourite song" },
  { id: "dreamCompany", col: 62, kind: "text", section: "words", label: "If you could have a job at any company, where would it be?", short: "Dream company" },
  { id: "liveCarefree", col: 64, kind: "text", section: "words", label: "If you could live carefree somewhere for the rest of your life, where would it be?", short: "Carefree place" },
  { id: "foodSpot", col: 65, kind: "text", section: "words", label: "Favourite Waterloo food spot?", short: "Food spot" },
  { id: "campusSpot", col: 66, kind: "text", section: "words", label: "Favourite spot on campus?", short: "Campus spot" },
  { id: "deleteThing", col: 72, kind: "text", section: "words", label: "If you could pick one thing at Waterloo to permanently delete, what would it be?", short: "Would delete" },
  { id: "oneWord", col: 82, kind: "text", section: "words", label: "One word that best describes our program?", short: "One word" },
  { id: "advice", col: 80, kind: "text", section: "words", label: "What advice would you give to past you / new students?", short: "Advice", hideCard: true },
  { id: "message", col: 81, kind: "text", section: "words", label: "Leave a message for our class in the future:", short: "Message to the future", hideCard: true },
  // survey-feedback meta question — parsed but not displayed
  { id: "finalThoughts", col: 83, kind: "text", section: "words", label: "Leave any final thoughts or feedback you have here.", short: "Final thoughts", hideCard: true },
];

// ---------------------------------------------------------------- build rows

const rows = rawRows.map((r, i) => ({ resp: i + 1 }));

for (const f of FIELDS) {
  if (f.derived) continue;
  for (let i = 0; i < rawRows.length; i++) {
    const rawVal = rawRows[i][f.col];
    let val;
    if (f.kind === "text") {
      val = str(rawVal);
      // pure form-noise is dropped even from verbatim walls; jokes stay
      if (val !== null && /^n\/?a\.?$/i.test(val)) val = exclude(f.id, val, "non-answer");
    } else if (f.parse) {
      val = f.parse(rawVal, f.id);
    } else if (f.kind === "numeric") {
      val = num(f.id, rawVal);
    } else {
      val = str(rawVal);
    }
    rows[i][f.id] = f.kind === "multi" ? val : val ?? null;
  }
}

// derived fields
for (const row of rows) {
  const { avg1A, avg1B } = row;
  // integer-hundredths math so 79.415 rounds to 79.42, not down via FP error
  row.cumAvg =
    avg1A != null && avg1B != null
      ? Math.round((Math.round(avg1A * 100) + Math.round(avg1B * 100)) / 2) / 100
      : avg1A ?? avg1B ?? null;
  row.fromGroup = row.from ? FROM_GROUP[row.from] ?? "International" : null;
  row.hasCoop = row.coopVia.length === 0 ? null : row.coopVia.every((o) => o === "Not this term") ? "No" : "Yes";
}
note("cumAvg", "mean of 1A and 1B term averages; falls back to whichever exists (stream 4 has no 1B yet)");
note("residence", "UWP includes Beck Hall, Eby Hall, North Court and Woolwich answers");
note("residence", "dual answers like “V1/CMH” count under the first-named");
note("bestRes", "UWP includes Beck Hall and Woolwich answers");
note("favTeacher", "answers naming two teachers count once for each");
note("rate1B", "includes stream-4 ratings of a 1B term still in progress");

// ---------------------------------------------------------------- validate & emit

const errors = [];
for (const f of FIELDS) {
  if (f.kind === "numeric") {
    const vals = rows.map((r) => r[f.id]).filter((v) => v != null);
    if (vals.some((v) => typeof v !== "number" || !Number.isFinite(v))) errors.push(`${f.id}: non-numeric value`);
  }
  if (f.kind === "ordinal") {
    const vals = rows.map((r) => r[f.id]).filter((v) => v != null);
    const bad = vals.filter((v) => !f.order.includes(v));
    if (bad.length) errors.push(`${f.id}: values outside order: ${[...new Set(bad)].join(" | ")}`);
  }
}
if (errors.length) {
  console.error("VALIDATION ERRORS:\n" + errors.join("\n"));
  process.exit(1);
}

const out = {
  n: rows.length,
  generatedFrom: path.basename(XL),
  fields: FIELDS.map(({ parse, normalize, ...meta }) => meta),
  rows,
  report,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`Wrote ${OUT}`);
console.log(`n=${rows.length}, fields=${FIELDS.length}`);

// quick summary for eyeballing
for (const f of FIELDS) {
  const vals = rows.map((r) => r[f.id]);
  const nAns = vals.filter((v) => (Array.isArray(v) ? v.length > 0 : v != null)).length;
  const ex = report[f.id]?.excluded?.length ?? 0;
  console.log(`  ${f.id.padEnd(16)} ${String(nAns).padStart(3)} answered${ex ? `, ${ex} excluded` : ""}`);
}
