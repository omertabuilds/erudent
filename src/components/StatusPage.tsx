import Link from "next/link";

/** 404 and error: the ∃ mark centered, one line, back to /play. */
export default function StatusPage({ line, code }: { line: string; code?: string }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-bg px-4 text-center font-ui text-text">
      <span aria-hidden="true" className="text-[64px] leading-none font-bold">
        ∃
      </span>
      {code && <p className="-mb-3 font-mono text-[11px] tracking-[0.14em] text-text-muted">{code}</p>}
      <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.03em] text-balance">{line}</h1>
      <Link
        href="/play"
        className="inline-flex h-[46px] items-center rounded-(--radius-md) bg-text px-[22px] text-[15px] font-semibold text-bg hover:bg-text/90"
      >
        Back to Play
      </Link>
    </main>
  );
}
