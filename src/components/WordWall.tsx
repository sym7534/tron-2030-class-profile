"use client";

import { useMemo, useState } from "react";

interface Props {
  values: string[];
  /** wall = flowing inline entries · quotes = stacked block quotes · big = display type */
  mode?: "wall" | "quotes" | "big";
}

/** group case-insensitive exact duplicates, keep the most common casing */
export function groupVerbatim(values: string[]): { text: string; count: number }[] {
  const groups = new Map<string, Map<string, number>>();
  for (const v of values) {
    const key = v.toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, new Map());
    const casings = groups.get(key)!;
    casings.set(v.trim(), (casings.get(v.trim()) ?? 0) + 1);
  }
  const out = [...groups.values()].map((casings) => {
    let best = "";
    let bestN = 0;
    let total = 0;
    for (const [text, n] of casings) {
      total += n;
      if (n > bestN) {
        bestN = n;
        best = text;
      }
    }
    return { text: best, count: total };
  });
  out.sort((a, b) => b.count - a.count);
  return out;
}

export default function WordWall({ values, mode = "wall" }: Props) {
  const all = useMemo(() => groupVerbatim(values), [values]);
  const [expanded, setExpanded] = useState(false);
  // long quote lists are collapsed so one card can't swallow the page
  const limit = mode === "quotes" ? 8 : Infinity;
  const grouped = expanded ? all : all.slice(0, limit);
  const hidden = all.length - grouped.length;

  const more =
    hidden > 0 || (expanded && all.length > limit) ? (
      <div style={{ marginTop: 10 }}>
        <button onClick={() => setExpanded((v) => !v)}>
          {expanded ? "show fewer" : `show all ${all.length} answers`}
        </button>
      </div>
    ) : null;

  if (mode === "big") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 26px", alignItems: "baseline" }}>
        {grouped.map((g, i) => (
          <span
            key={g.text}
            style={{
              fontFamily: "var(--display)",
              fontSize: i % 3 === 0 ? 36 : i % 3 === 1 ? 26 : 20,
              lineHeight: 1.2,
              color: i % 2 === 0 ? "var(--text-primary)" : "var(--text-secondary)",
              overflowWrap: "anywhere",
            }}
          >
            {g.text}
          </span>
        ))}
      </div>
    );
  }

  if (mode === "quotes") {
    return (
      <div>
        <div style={{ display: "grid", gap: 14 }}>
          {grouped.map((g) => (
            <blockquote
              key={g.text}
              style={{
                fontStyle: "italic",
                fontSize: 17,
                color: "var(--text-secondary)",
                borderLeft: "1px solid var(--border-card)",
                paddingLeft: 14,
                whiteSpace: "pre-wrap",
              }}
            >
              {g.text}
              {g.count > 1 && <span className="tnum muted"> ×{g.count}</span>}
            </blockquote>
          ))}
        </div>
        {more}
      </div>
    );
  }

  return (
    <div style={{ fontSize: 16, lineHeight: 2, color: "var(--text-secondary)" }}>
      {grouped.map((g, i) => (
        <span key={g.text} style={{ whiteSpace: "normal" }}>
          {i > 0 && <span className="muted"> · </span>}
          <span style={{ color: g.count > 1 ? "var(--text-primary)" : undefined }}>{g.text}</span>
          {g.count > 1 && <span className="tnum muted"> ×{g.count}</span>}
        </span>
      ))}
    </div>
  );
}
