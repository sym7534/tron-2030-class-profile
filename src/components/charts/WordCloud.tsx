"use client";

import { useEffect, useState } from "react";
import cloud from "d3-cloud";
import { useMeasure } from "./common";

export interface CloudEntry {
  text: string;
  count: number;
}

interface Props {
  entries: CloudEntry[];
  height?: number;
}

interface PlacedWord {
  text: string;
  count: number;
  size: number;
  x: number;
  y: number;
}

/** what d3-cloud sees: our data plus the layout fields it fills in */
interface LayoutWord {
  text: string;
  count: number;
  size: number;
  x?: number;
  y?: number;
  rotate?: number;
  font?: string;
}

/** deterministic PRNG so the layout is stable across renders */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FONT = "Lora, Georgia, serif";

/** stable per-phrase 0..1 hash — gives every entry its own size/shade personality */
function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function fontSize(count: number, maxCount: number, t: number): number {
  // hash jitter keeps all-unique clouds lively; kept small when real
  // duplicates exist so count still dominates the visual order
  if (maxCount <= 1) return 14 + t * 13; // 14 → 27
  const base = 15 + ((count - 1) / (maxCount - 1)) * 21; // 15 → 36
  return base + t * (count > 1 ? 2 : 4);
}

function fill(count: number, t: number): string {
  if (count >= 3) return "#171717";
  if (count === 2) return "#333333";
  // singles fan out across the gray ramp by hash
  if (t > 0.78) return "#1f1f1f";
  if (t > 0.52) return "#454545";
  if (t > 0.26) return "#6b6b6b";
  return "#8f8f8f";
}

function weight(count: number, t: number): number {
  if (count > 1) return 600;
  return t > 0.6 ? 500 : 400;
}

/** phrase cloud — each unique answer is one item, sized by how many gave it */
export default function WordCloud({ entries, height = 320 }: Props) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [words, setWords] = useState<PlacedWord[]>([]);

  const maxCount = Math.max(...entries.map((e) => e.count), 1);

  useEffect(() => {
    if (width === 0 || entries.length === 0) return;
    const layout = cloud<LayoutWord>()
      .size([width, height])
      .words(
        entries.map((e) => ({
          text: e.text,
          count: e.count,
          size: fontSize(e.count, maxCount, hash01(e.text)),
        }))
      )
      .padding(3)
      .rotate(0)
      .font(FONT)
      .fontSize((d) => d.size ?? 14)
      .random(mulberry32(2030))
      .on("end", (placed: LayoutWord[]) => {
        setWords(
          placed.map((w) => ({
            text: w.text,
            count: w.count,
            size: w.size,
            x: w.x ?? 0,
            y: w.y ?? 0,
          }))
        );
      });
    layout.start();
    return () => {
      layout.stop();
    };
  }, [width, height, entries, maxCount]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {width > 0 && (
        <svg className="chart-svg" width={width} height={height} role="img">
          <g transform={`translate(${width / 2},${height / 2})`}>
            {words.map((w, i) => (
              <text
                key={`${w.text}-${i}`}
                x={w.x}
                y={w.y}
                textAnchor="middle"
                style={{ fontFamily: FONT }}
                fontSize={w.size}
                fontWeight={weight(w.count, hash01(w.text))}
                fill={fill(w.count, hash01(w.text))}
              >
                {w.text}
                <title>
                  {w.text}
                  {w.count > 1 ? ` — ${w.count} of us` : ""}
                </title>
              </text>
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}
