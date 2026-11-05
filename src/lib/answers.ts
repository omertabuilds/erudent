/**
 * Same rules as the database's normalize_answer(): integers or fractions only.
 * "6/8" → "3/4", "-3/-4" → "3/4", "007" → "7", "4/2" → "2". Decimals and junk → null.
 * Used by the question importer to catch bad answers before they reach the database.
 */
export function normalizeAnswer(raw: string): string | null {
  const s = raw.replace(/\s+/g, "").replace(/−/g, "-");
  if (s.length > 40) return null;
  if (/^-?\d+$/.test(s)) return BigInt(s).toString();
  const m = s.match(/^(-?\d+)\/(-?\d+)$/);
  if (!m) return null;
  let num = BigInt(m[1]);
  let den = BigInt(m[2]);
  if (den === 0n) return null;
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const abs = (x: bigint) => (x < 0n ? -x : x);
  const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));
  const g = gcd(abs(num), den) || 1n;
  num /= g;
  den /= g;
  return den === 1n ? num.toString() : `${num}/${den}`;
}
