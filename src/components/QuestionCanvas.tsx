"use client";

import { useEffect, useRef } from "react";

/**
 * Draws the question as an image instead of text, so it can't be
 * copied, selected or pasted into another tool during ranked play.
 */
export default function QuestionCanvas({ text }: { text: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.parentElement?.clientWidth ?? 600;
      const fontSize = width < 480 ? 18 : 21;
      const lineHeight = fontSize * 1.5;
      const font = `${fontSize}px "Times New Roman", Times, serif`;
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

      const height = Math.max(lineHeight, lines.length * lineHeight + 8);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      ctx.font = font;
      ctx.fillStyle = getComputedStyle(canvas).color;
      ctx.textBaseline = "top";
      lines.forEach((l, i) => ctx.fillText(l, 0, i * lineHeight + 4));
    };

    draw();
    const ro = new ResizeObserver(draw);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div className="w-full select-none" onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={ref} role="img" aria-label="Question" className="text-foreground" />
    </div>
  );
}
