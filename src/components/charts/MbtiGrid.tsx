"use client";

import { useMeasure, useTooltip, Tooltip } from "./common";

const TYPES = [
  ["INTJ", "INTP", "ENTJ", "ENTP"],
  ["INFJ", "INFP", "ENFJ", "ENFP"],
  ["ISTJ", "ISFJ", "ESTJ", "ESFJ"],
  ["ISTP", "ISFP", "ESTP", "ESFP"],
];
const ROLES = ["analysts", "diplomats", "sentinels", "explorers"];

function shade(t: number): string {
  if (t <= 0) return "#f7f7f7";
  const l = 93 - t * 84;
  return `hsl(0 0% ${l}%)`;
}

export default function MbtiGrid({ counts }: { counts: Record<string, number> }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();
  const max = Math.max(...Object.values(counts), 1);

  return (
    <div ref={ref} data-mbti style={{ position: "relative" }}>
      <div style={{ display: "grid", gap: 10 }}>
        {TYPES.map((row, ri) => (
          <div key={ri}>
            <div className="muted" style={{ fontSize: 12, fontStyle: "italic", marginBottom: 3 }}>
              {ROLES[ri]}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {row.map((t) => {
                const c = counts[t] ?? 0;
                const dark = c / max > 0.55;
                return (
                  <div
                    key={t}
                    onPointerMove={(e) => {
                      const r = (e.currentTarget.closest("[data-mbti]") as HTMLElement).getBoundingClientRect();
                      show(e.clientX - r.left, e.clientY - r.top, [
                        { value: String(c), label: t },
                      ]);
                    }}
                    onPointerLeave={hide}
                    style={{
                      background: shade(c / max),
                      borderRadius: 3,
                      padding: "10px 6px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      className="sans"
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: dark ? "#fff" : "var(--text-primary)",
                      }}
                    >
                      {t}
                    </div>
                    <div
                      className="tnum"
                      style={{ fontSize: 12, color: dark ? "rgba(255,255,255,.75)" : "var(--text-muted)" }}
                    >
                      {c || "–"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}
