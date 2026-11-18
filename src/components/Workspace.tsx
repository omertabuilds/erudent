"use client";

import { useRef } from "react";

/** Drawing: strokes of [x, y] points in the pad's own CSS pixels. */
export type Stroke = [number, number][];

const card = "rounded-(--radius-lg) border border-line bg-surface/92";

/** Lined monospace scratch area. Private: nothing typed here is sent anywhere. */
export function ScratchPad({
  value,
  onChange,
  height,
  label = "Scratch work",
}: {
  value: string;
  onChange: (v: string) => void;
  height: number;
  label?: string;
}) {
  return (
    <textarea
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Work it out here…"
      spellCheck={false}
      style={{ height }}
      className="block w-full resize-none bg-transparent bg-[linear-gradient(#16161a_1px,transparent_1px)] bg-size-[100%_22px] bg-position-[0_15px] p-4 font-mono text-[14px] leading-[22px] text-[#d6d2c9] outline-none placeholder:text-[#6e6a62]"
    />
  );
}

/**
 * Scratch (lined text) or Draw, under the problem. Nothing here is sent anywhere: the state lives
 * in MatchRoom, so it survives switching tabs and focus view, and is gone when the duel ends.
 */
export default function Workspace({
  width,
  tall,
  mode,
  setMode,
  scratch,
  setScratch,
  strokes,
  setStrokes,
}: {
  width: string;
  tall: boolean;
  mode: "scratch" | "draw";
  setMode: (m: "scratch" | "draw") => void;
  scratch: string;
  setScratch: (s: string) => void;
  strokes: Stroke[];
  setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>;
}) {
  const height = tall ? 360 : 200;
  const tab = (on: boolean) =>
    `h-7 cursor-pointer rounded-[6px] px-3 text-[12px] font-medium ${on ? "bg-surface-raised text-text" : "text-[#8a867d] hover:text-text"}`;
  return (
    <section aria-label="Workspace" className={`${card} w-full ${width} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-1 border-b border-line py-2 pr-2.5 pl-3.5">
        <div role="tablist" aria-label="Workspace mode" className="flex gap-0.5">
          <button type="button" role="tab" aria-selected={mode === "scratch"} onClick={() => setMode("scratch")} className={tab(mode === "scratch")}>
            Scratch
          </button>
          <button type="button" role="tab" aria-selected={mode === "draw"} onClick={() => setMode("draw")} className={tab(mode === "draw")}>
            Draw
          </button>
        </div>
        <div className="flex items-center gap-3.5 text-[11px] text-[#6e6a62]">
          <span>Private · not graded · cleared after the duel</span>
          <button
            type="button"
            onClick={() => (mode === "scratch" ? setScratch("") : setStrokes([]))}
            className="inline-flex min-h-8 cursor-pointer items-center text-[12px] text-text-muted hover:text-text"
          >
            Clear
          </button>
        </div>
      </div>
      {mode === "scratch" ? (
        <ScratchPad value={scratch} onChange={setScratch} height={height} />
      ) : (
        <DrawPad height={height} strokes={strokes} setStrokes={setStrokes} />
      )}
    </section>
  );
}

/** Pointer drawing on a dot grid. Strokes are kept in pad pixels, so resizing never distorts them. */
export function DrawPad({ height, strokes, setStrokes }: { height: number; strokes: Stroke[]; setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>> }) {
  const drawing = useRef(false);
  const at = (e: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10];
  };
  return (
    <svg
      role="img"
      aria-label="Drawing pad"
      style={{ height }}
      className="block w-full cursor-crosshair touch-none bg-[radial-gradient(#26262c_1px,transparent_1px)] bg-size-[20px_20px]"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = true;
        const p = at(e);
        setStrokes((s) => [...s, [p]]);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const p = at(e);
        setStrokes((s) => [...s.slice(0, -1), [...s[s.length - 1], p]]);
      }}
      onPointerUp={() => (drawing.current = false)}
      onPointerCancel={() => (drawing.current = false)}
    >
      {strokes.map((k, i) => (
        <path
          key={i}
          d={`M${k.map(([x, y]) => `${x} ${y}`).join(" L")}${k.length === 1 ? " l0.01 0" : ""}`}
          fill="none"
          stroke="var(--text)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

