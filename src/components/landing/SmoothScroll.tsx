"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Smooth scroll for the page it's mounted on, anchor links included ("How it works").
 * Lenis drives the native scroll position, so plain `scroll` listeners (the hero's
 * parallax) keep working. Off under prefers-reduced-motion, and turns off live if the
 * setting changes; anchors then jump as normal.
 */
export default function SmoothScroll() {
  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let lenis: Lenis | null = null;
    const sync = () => {
      if (still.matches) {
        lenis?.destroy();
        lenis = null;
      } else if (!lenis) {
        lenis = new Lenis({ autoRaf: true, anchors: { offset: -16 } });
      }
    };
    sync();
    still.addEventListener("change", sync);
    return () => {
      still.removeEventListener("change", sync);
      lenis?.destroy();
    };
  }, []);
  return null;
}
