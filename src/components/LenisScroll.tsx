"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Momentum smoothing for the landing page (Lenis, ~4KB).
 *
 * Lenis intercepts wheel/touch, tracks a virtual target offset, and a rAF loop
 * interpolates the real scroll position toward it every frame — accelerate,
 * then decelerate, with a short drift after the wheel stops.
 *
 * Scoping decisions:
 * - Mounted only on this page (not the layout): this site is a single scroll
 *   page today, but keeping it out of the layout means any future route with
 *   its own scroll container never fights the interceptor, and Lenis stays in
 *   this page's client chunk only.
 * - prefers-reduced-motion: reduce → return early, never instantiate Lenis;
 *   those users keep plain native scrolling (matches the global CSS media rule).
 * - Unmount cancels the rAF and destroys the instance so nothing leaks.
 */
export default function LenisScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return; // native scrolling, no interception at all
    }

    // Lenis drives anchor scrolling itself; the CSS scroll-behavior:smooth
    // fallback would double-animate, so neutralize it while Lenis is alive.
    const prevBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";

    const lenis = new Lenis({
      duration: 0.9, // settle sooner than the 1.2 default — snappy, not drifty
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // punchy start, soft landing
      wheelMultiplier: 1.4, // each notch travels ~40% further, feels light
      touchMultiplier: 1.4,
      smoothWheel: true, // anchor navigation eases too
      anchors: true, // let Lenis handle same-page # links
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      document.documentElement.style.scrollBehavior = prevBehavior;
    };
  }, []);

  return null;
}
