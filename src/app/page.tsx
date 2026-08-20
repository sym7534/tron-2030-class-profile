import { survey, N, numericValues, median, distribution } from "@/lib/data";
import { SECTIONS, sectionFieldIds, questionNumbers, SECTION_COMPARISONS } from "@/lib/sections";
import GraphBuilder from "@/components/GraphBuilder";
import QuestionCard from "@/components/QuestionCard";
import ComparisonCard from "@/components/ComparisonCard";
import LenisScroll from "@/components/LenisScroll";
import Waffle from "@/components/charts/Waffle";

function heroStats() {
  const wages = numericValues("wage");
  const apps = numericValues("jobsApplied");
  const distance = numericValues("distanceKm");
  const cum = numericValues("cumAvg");
  return [
    { value: `${Math.round(median(cum) * 10) / 10}%`, label: "median first-year average" },
    { value: `$${Math.round(median(wages))}/h`, label: "median co-op wage" },
    {
      value: apps.reduce((a, b) => a + b, 0).toLocaleString("en-CA"),
      label: "applications sent, total",
    },
    {
      value: `${Math.round(distance.reduce((a, b) => a + b, 0)).toLocaleString("en-CA")} km`,
      label: "combined distance from home",
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
      <LenisScroll />
      <nav className="topnav">
        <a href="#top" className="topnav-brand">
          tron 2030
        </a>
        <span className="topnav-links">
          <a href="#top">home</a>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.title}
            </a>
          ))}
        </span>
        <a
          className="topnav-github"
          href="https://github.com/sym7534/tron-2030-class-profile"
          target="_blank"
          rel="noopener noreferrer"
        >
          github
        </a>
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
            Welcome to the University of Waterloo Mechatronics Engineering Class of 2030
            class profile! A total of <span className="tnum">{N}</span> people answered{" "}
            <span className="tnum">{totalQuestions}</span> unique questions; check out the
            results below.
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
          <GraphBuilder />
        </section>

        {SECTIONS.map((s) => {
          const ids = sectionFieldIds(s.id);
          return (
            <section key={s.id} id={s.id} className="chapter">
              <div className="chapter-head">
                <h2 className="section-header">{s.title}</h2>
              </div>
              <div className={s.id === "words" ? "card-grid one-col" : "card-grid"}>
                {(SECTION_COMPARISONS[s.id] ?? []).map((c) => (
                  <ComparisonCard key={`${c.y}-${c.x}`} spec={c} />
                ))}
                {ids.map((id) => (
                  <QuestionCard key={id} id={id} qNum={qNums[id]} />
                ))}
              </div>
            </section>
          );
        })}

        <footer className="page-footer">
          <p className="muted">Mechatronics Engineering 2030 &middot; University of Waterloo</p>
        </footer>
      </main>
    </>
  );
}
