"use client";

import { ENTER_CODE_ANCHOR, ENTER_CODE_EVENT } from "@/components/EarlyAccess";

/**
 * "Enter code" in the header: scrolls to the hero's EarlyAccess box and opens its
 * "I have a code" tab. On the landing page Lenis smooth-scrolls the anchor and the
 * event switches the tab; from any other page the hash does both on arrival.
 */
export default function EnterCodeLink({ className }: { className: string }) {
  return (
    // A plain anchor: next/link's hash scroll would fight Lenis.
    <a href={`/#${ENTER_CODE_ANCHOR}`} className={className} onClick={() => window.dispatchEvent(new Event(ENTER_CODE_EVENT))}>
      Enter code
    </a>
  );
}
