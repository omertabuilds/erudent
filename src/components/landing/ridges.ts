/**
 * The Climb's mountain: three ridge silhouettes in a -1200…1200 × 0…~560 box, summit at (0, SUMMIT_Y).
 * Shared by the landing hero (Climb.tsx) and the "mountain" profile banner.
 */

export type Pt = [number, number];
export const ridge = (pts: Pt[]) => `M ${pts[0][0]} 1400 ${pts.map(([x, y]) => `L ${x} ${y}`).join(" ")} L ${pts[pts.length - 1][0]} 1400 Z`;

export const FAR: Pt[] = [
  [-3000, 210], [-2200, 150], [-1750, 210], [-1380, 110], [-1050, 195], [-800, 130], [-560, 205], [-330, 145],
  [-90, 210], [160, 135], [420, 205], [660, 100], [920, 185], [1170, 120], [1460, 200], [1820, 130], [2300, 190], [3000, 155],
];

// Main peak: summit at (0, SUMMIT_Y), flanks no narrower than 2.2u per u of descent, so every
// altitude line sits inside the silhouette.
export const SUMMIT_Y = 34;
export const K = 2.2;
const flank = (side: -1 | 1, jitter: number[]): Pt[] =>
  [70, 110, 150, 200, 250, 300, 360, 420].map((y, i) => [side * (K * (y - SUMMIT_Y) + jitter[i]), y] as Pt);
export const MID: Pt[] = [
  [-3000, 430], [-1750, 390], [-1320, 430],
  ...flank(-1, [6, 3, 14, 4, 18, 6, 12, 5]).reverse(),
  [-14, SUMMIT_Y + 10], [0, SUMMIT_Y], [10, SUMMIT_Y + 6],
  ...flank(1, [4, 12, 5, 16, 3, 10, 6, 14]),
  [1340, 440], [1800, 390], [3000, 430],
];

export const NEAR: Pt[] = [
  [-3000, 476], [-1500, 426], [-1100, 476], [-820, 386], [-580, 456], [-410, 424], [-200, 496], [0, 516],
  [210, 486], [430, 418], [650, 468], [910, 376], [1220, 456], [1600, 406], [3000, 476],
];
