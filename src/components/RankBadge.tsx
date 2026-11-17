import Image from "next/image";
import { TIER_NAMES } from "@/lib/erudent";

const FILES = [
  "rank-1-novice",
  "rank-2-apprentice",
  "rank-3-scholar",
  "rank-4-savant",
  "rank-5-sage",
  "rank-6-erudite",
] as const;

export type Rank = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The badge for ranks I–VI (Novice to Erudite), from public/images/badges.
 * Pair it with the rank name in text: the badge is never the only signal.
 * Pass `decorative` when that name sits right beside it, so screen readers skip the image.
 */
export default function RankBadge({
  rank,
  size = 40,
  decorative = false,
  className,
}: {
  rank: Rank;
  size?: number;
  decorative?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={`/images/badges/${FILES[rank - 1]}.svg`}
      alt={decorative ? "" : `${TIER_NAMES[rank - 1]} rank badge`}
      width={size}
      height={size}
      unoptimized
      className={className}
    />
  );
}
