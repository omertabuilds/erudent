import type { ReactNode } from "react";
import { gutter } from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { FAR, MID, NEAR, ridge } from "@/components/landing/ridges";

/**
 * The frame for sign-in and username pages: header, a left-aligned column on the
 * 12-column grid, the Climb's ridges as a quiet band at the foot, footer.
 */
export default function AuthShell({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper font-ui text-[17px] leading-[26px] text-ink">
      {header}
      <main className="flex flex-[1_0_auto] flex-col">
        <div className={`mx-auto w-full max-w-[1312px] pt-8 pb-16 md:pt-16 md:pb-20 ${gutter}`}>{children}</div>
        <Ridges />
      </main>
      <SiteFooter />
    </div>
  );
}

/** The landing's three ridges, flat in ridge-far / ridge-mid, the near one in paper on a hairline. */
function Ridges() {
  return (
    <div aria-hidden="true" className="mt-auto h-[120px] overflow-hidden md:h-[200px] lg:h-[240px]">
      <svg viewBox="-1200 20 2400 520" preserveAspectRatio="xMidYMin slice" className="block size-full">
        <path d={ridge(FAR)} style={{ fill: "var(--ridge-far)" }} />
        <path d={ridge(MID)} style={{ fill: "var(--ridge-mid)" }} />
        <path
          d={ridge(NEAR)}
          strokeWidth="1"
          style={{ fill: "var(--paper)", stroke: "var(--hairline)", vectorEffect: "non-scaling-stroke" }}
        />
      </svg>
    </div>
  );
}
