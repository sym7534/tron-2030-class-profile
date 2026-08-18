import { survey, N, numericValues, median, distribution } from "@/lib/data";
import { SECTIONS, sectionFieldIds, questionNumbers } from "@/lib/sections";
import GraphBuilder from "@/components/GraphBuilder";
import QuestionCard from "@/components/QuestionCard";
import Waffle from "@/components/charts/Waffle";

function heroStats() {
  const wages = numericValues("wage");
  const apps = numericValues("jobsApplied");
  const caffeine = numericValues("caffeine");
  const cum = numericValues("cumAvg");
  return [
    { value: `${Math.round(median(cum) * 10) / 10}%`, label: "median first-year average" },
    { value: `$${Math.round(median(wages))}/h`, label: "median co-op wage" },
    {
      value: apps.reduce((a, b) => a + b, 0).toLocaleString("en-CA"),
      label: "applications sent, total",
    },
    {
      value: `${Math.round(median(caffeine))} mg`,
      label: "median daily caffeine",
    },
  ];
}

export default function Home() {
  const qNums = questionNumbers();
  const stats = heroStats();
  const genderDist = distribution(survey.fields.find((f) => f.id === "gender")!);
  const totalQuestions = Object.keys(qNums).length;

  return (
    <>
      <nav className="topnav">
        <a href="#top" className="topnav-brand">
          tron 2030
        </a>
        <span className="topnav-links">
          <a href="#builder">the instrument</a>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.title}
            </a>
          ))}
        </span>
      </nav>

      <main id="top">
        <header className="hero">
          <p className="hero-eyebrow">University of Waterloo &middot; Class Profile</p>
          <h1 className="hero-title">
            MECHATRONICS
            <br />
            ENGINEERING 2030
          </h1>
          <p className="hero-lede">
            <span className="tnum">{N}</span> of us answered{" "}
            <span className="tnum">{totalQuestions}</span> questions about where we came from,
            what first year did to us, and what we actually think. Every dot below is one
            person. Nothing is anonymized away except the names.
          </p>

          <div className="hero-waffle">
            <Waffle
              groups={genderDist.map((d) => ({ label: d.label, count: d.count }))}
              total={N}
              perRow={17}
              dot={12}
              gap={8}
            />
          </div>

          <div className="hero-stats">
            {stats.map((s) => (
              <div key={s.label} className="hero-stat">
                <div className="tnum hero-stat-value">{s.value}</div>
                <div className="muted hero-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </header>

        <section id="builder" className="builder-section">
          <h2 className="section-header">the instrument</h2>
          <p className="section-blurb">
            Put any question against any other. This is the whole survey, in one control panel.
          </p>
          <GraphBuilder />
        </section>

        {SECTIONS.map((s) => {
          const ids = sectionFieldIds(s.id);
          return (
            <section key={s.id} id={s.id} className="chapter">
              <div className="chapter-head">
                <h2 className="section-header">{s.title}</h2>
                <p className="section-blurb">{s.blurb}</p>
                <p className="muted chapter-count tnum">
                  {ids.length} question{ids.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className={s.id === "words" ? "card-grid one-col" : "card-grid"}>
                {ids.map((id) => (
                  <QuestionCard key={id} id={id} qNum={qNums[id]} />
                ))}
              </div>
            </section>
          );
        })}

        <footer className="page-footer">
          <p>
            <span className="tnum">{N}</span> respondents &middot;{" "}
            <span className="tnum">{totalQuestions}</span> questions &middot; built from the class
            survey spreadsheet, names and emails never read.
          </p>
          <p className="muted">
            Free-text answers are shown verbatim. Where answers had to be grouped to be counted
            (nine spellings of one professor&rsquo;s name, heights in four different units), the
            card says so. Numbers that could not be believed were set aside, and each card lists
            them.
          </p>
          <p className="muted">Mechatronics Engineering 2030 &middot; University of Waterloo</p>
        </footer>
      </main>
    </>
  );
}
