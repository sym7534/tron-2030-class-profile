import type { Metadata } from "next";
import { Lora, Geist } from "next/font/google";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import survey from "@/data/survey.json";
import "./globals.css";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const endless = localFont({
  src: "../fonts/Endless.ttf",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mechatronics 2030 — Class Profile",
  description: `${survey.n} responses, 78 questions. The University of Waterloo Mechatronics Engineering class of 2030, measured against itself.`,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${lora.variable} ${geist.variable} ${endless.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
