"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fades and lifts its content in the first time it scrolls into view.
 * Opacity and transform only. Under reduced motion (or without JS, via the
 * <noscript> rule on the page) the content is simply there.
 */
export default function Reveal({ children, className = "", as: Tag = "div", id }: { children: ReactNode; className?: string; as?: "div" | "section"; id?: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref as React.RefObject<HTMLDivElement>} id={id} className={`reveal ${className}`}>
      {children}
    </Tag>
  );
}
