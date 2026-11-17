"use client";

import { useEffect, useRef } from "react";


/**
 * Draws the question as an image instead of text, so it can't be
 * copied, selected or pasted into another tool during ranked play.
 * Set in Geist Mono, in text, at `size` px on 1.55 line height (the duel's prompt).
 */
export default function QuestionCanvas({ text, size = 22 }: { text: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const FONT_SIZE = size;
    const LINE_HEIGHT = Math.round(size * 1.55);
    const canvas = ref.current;
    if (!canvas) return;
    let ready = false; // nothing is drawn until Geist Mono has loaded
    let cancelled = false;

    const draw = () => {
      if (!ready) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.parentElement?.clientWidth ?? 600;
      // font-mono on the canvas resolves to the Geist Mono family next/font loaded.
      const style = getComputedStyle(canvas);
      const font = `${FONT_SIZE}px ${style.fontFamily}`;
      ctx.font = font;

      // Word-wrap, keeping the writer's own line breaks.
      const lines: string[] = [];
      for (const para of text.split("\n")) {
        let line = "";
        for (const word of para.split(" ")) {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width > width && line) {
            lines.push(line);
            line = word;
          } else line = test;
        }
        lines.push(line);
      }

      const height = Math.max(LINE_HEIGHT, lines.length * LINE_HEIGHT);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      ctx.font = font;
      ctx.fillStyle = style.color; // text-text
      ctx.textBaseline = "middle"; // centered in each line box, like the HTML prompt
      lines.forEach((l, i) => ctx.fillText(l, 0, i * LINE_HEIGHT + LINE_HEIGHT / 2));
    };

    const family = getComputedStyle(canvas).fontFamily;
    document.fonts
      .load(`${FONT_SIZE}px ${family}`)
      .catch(() => {})
      .then(() => document.fonts.ready)
      .then(() => {
        if (cancelled) return;
        ready = true;
        draw();
      });

    const ro = new ResizeObserver(draw);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    // Redraw in the new ink when the theme flips.
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      cancelled = true;
      ro.disconnect();
      mo.disconnect();
    };
  }, [text, size]);

  return (
    <div className="w-full select-none" onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={ref} role="img" aria-label="Question" className="block font-mono text-text" />
    </div>
  );
}
