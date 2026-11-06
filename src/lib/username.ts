/**
 * Username rules the browser can check instantly. The database enforces the same rules
 * (supabase/migrations/20261106025646_username_rules.sql) plus the wordlist and "taken",
 * which only it knows: ask it with api.checkUsername. tests/db/usernames.test.ts keeps
 * the two in step.
 */

export type UsernameProblem =
  | "username_length"
  | "username_chars"
  | "username_start"
  | "username_symbols"
  | "username_reserved"
  | "username_blocked"
  | "username_taken"
  | "rate_limited";

export const USERNAME_MESSAGES: Record<UsernameProblem, string> = {
  username_length: "Use 3–20 characters.",
  username_chars: "Use only letters a–z, numbers, and _ . -",
  username_start: "Start with a letter or a number.",
  username_symbols: "Put a letter or number between symbols.",
  username_reserved: "That name is reserved.",
  username_blocked: "Choose a different name.",
  username_taken: "That name is taken.",
  rate_limited: "Too many checks. Wait a few minutes and try again.",
};

export const USERNAME_HINT = "3–20 characters. Letters, numbers, and _ . - (never two in a row). Start with a letter or number.";

// The database also finds brand and staff names inside a name (eliam_admin), using an allow
// list for innocent overlaps (model, badminton). The browser only catches the whole name.
const RESERVED = new Set(["erudent", "omerta", "admin", "mod", "moderator", "staff", "support", "official", "system", "null", "undefined"]);
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a" };

/** What names are compared as: lowercase, leetspeak undone, only a–z and 0–9. */
export function usernameKey(v: string) {
  return v
    .toLowerCase()
    .replace(/[01345@]/g, (c) => LEET[c])
    .replace(/[^a-z0-9]/g, "");
}

/** Every rule except the wordlist, reserved names inside a name, and "taken": the database checks those. */
export function localUsernameProblem(raw: string): UsernameProblem | null {
  const v = raw.trim();
  const length = [...v].length; // characters, like Postgres, not UTF-16 units
  if (length < 3 || length > 20) return "username_length";
  if (!/^[A-Za-z0-9_.-]+$/.test(v)) return "username_chars";
  if (!/^[A-Za-z0-9]/.test(v)) return "username_start";
  if (/[_.-]{2}/.test(v)) return "username_symbols";
  const key = usernameKey(v);
  if (RESERVED.has(key) || key.includes("moderator")) return "username_reserved";
  return null;
}

/** A database error or check result → the problem, if it's a username one. */
export function usernameProblemFrom(msg: string | null | undefined): UsernameProblem | null {
  if (!msg) return null;
  return (Object.keys(USERNAME_MESSAGES) as UsernameProblem[]).find((k) => msg.includes(k)) ?? null;
}
