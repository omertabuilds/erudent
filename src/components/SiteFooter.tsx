import { gutter } from "@/components/SiteHeader";

export default function SiteFooter() {
  return (
    <footer className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-hairline py-5 text-[13px] text-ink-muted ${gutter}`}>
      <span>© 2026 Erudent · Built by Omerta</span>
      <a
        href="https://www.instagram.com/omertabuilds/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center font-semibold text-ink-muted hover:text-ink"
      >
        Omerta on Instagram
      </a>
    </footer>
  );
}
