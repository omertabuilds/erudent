/**
 * Question drafts (JSONL) → Notion, as Draft pages.
 *
 * Reads data/questions/ranked.jsonl and data/questions/practice.jsonl (one JSON object per line)
 * and creates one page per line in the Question Bank or the Practice Bank. It never touches
 * Supabase or the live game; drafts only go live after review and `npm run import-questions`.
 *
 *   npm run upload-drafts -- --dry                 # show what would be created, no API calls
 *   npm run upload-drafts                          # upload ranked, then practice
 *   npm run upload-drafts -- --bank ranked         # one bank only
 *
 * Reruns are safe: created page ids are saved to data/questions/uploaded.json after every
 * page, and any line already listed there is skipped.
 *
 * Needs NOTION_TOKEN in .env.local (not needed for --dry). The integration must have
 * access to both databases.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeAnswer } from "../src/lib/answers";

const NOTION_VERSION = "2025-09-03"; // same as scripts/import-questions.ts
const DATA_DIR = join(__dirname, "..", "data", "questions");
const UPLOADED_PATH = join(DATA_DIR, "uploaded.json");
const BANKS = {
  ranked: { file: "ranked.jsonl", dataSourceId: "5b2cca4f-30a4-405c-8ba2-8978bf9f8450" }, // Question Bank
  practice: { file: "practice.jsonl", dataSourceId: "23819bf1-ea0e-4c13-9513-699d244473f6" }, // Practice Bank
} as const;
type Bank = keyof typeof BANKS;

const TIERS = ["1 Novice", "2 Apprentice", "3 Scholar", "4 Savant", "5 Sage", "6 Erudite"];
const TOPICS = [
  "Mental math", "Algebra", "Geometry", "Probability & EV", "Combinatorics", "Number theory",
  "Calculus", "Ratios", "Arithmetic", "System of Equations", "Sequences",
];
const STATUSES = ["Draft", "Needs fix"];
const MIN_GAP_MS = 350; // ~3 requests per second
const MAX_RETRIES = 6;

type Draft = {
  id: string;
  Question: string;
  Answer: string;
  Solution: string;
  Tier: string;
  Topic: string;
  Author: string;
  Status: string;
  Source?: string;
  Notes?: string;
};

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const bankArg = args.includes("--bank") ? args[args.indexOf("--bank") + 1] : undefined;
if (bankArg && !(bankArg in BANKS)) {
  console.error(`--bank must be one of: ${Object.keys(BANKS).join(", ")}`);
  process.exit(1);
}
const banks: Bank[] = bankArg ? [bankArg as Bank] : ["ranked", "practice"]; // ranked first

const notionToken = dry ? "" : process.env.NOTION_TOKEN;
if (!dry && !notionToken) {
  console.error("Missing NOTION_TOKEN. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const uploaded: Record<string, string> = existsSync(UPLOADED_PATH)
  ? JSON.parse(readFileSync(UPLOADED_PATH, "utf8"))
  : {};
const saveUploaded = () => writeFileSync(UPLOADED_PATH, JSON.stringify(uploaded, null, 2) + "\n");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;

async function notion(path: string, body: unknown) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    const res = await fetch(`https://api.notion.com/v1${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`Notion POST ${path}: ${res.status} ${await res.text()}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
    console.log(`  ${res.status}, retrying in ${Math.round(delay / 1000)}s…`);
    await sleep(delay);
  }
}

const richText = (s: string) => [{ type: "text", text: { content: s.slice(0, 2000) } }];

function problems(d: Draft, bank: Bank): string[] {
  return [
    !d.id && "no id",
    !d.Question?.trim() && "no question",
    normalizeAnswer(d.Answer ?? "") !== d.Answer && `answer "${d.Answer}" isn't an integer or lowest-terms fraction`,
    !d.Solution?.trim() && "no solution",
    !TIERS.includes(d.Tier) && `unknown tier "${d.Tier}"`,
    !TOPICS.includes(d.Topic) && `unknown topic "${d.Topic}"`,
    !STATUSES.includes(d.Status) && `status "${d.Status}" isn't Draft or Needs fix`,
    bank === "practice" && d.Source !== "Written for practice" && "practice draft without Source",
  ].filter((p): p is string => Boolean(p));
}

function properties(d: Draft, bank: Bank) {
  return {
    Question: { title: richText(d.Question) },
    Answer: { rich_text: richText(d.Answer) },
    Solution: { rich_text: richText(d.Solution) },
    Tier: { select: { name: d.Tier } },
    Topic: { select: { name: d.Topic } },
    Author: { select: { name: d.Author } },
    Status: { status: { name: d.Status } },
    ...(d.Notes ? { Notes: { rich_text: richText(d.Notes) } } : {}),
    ...(bank === "practice" ? { Source: { select: { name: d.Source } } } : {}),
  };
}

function readDrafts(bank: Bank): Draft[] {
  const path = join(DATA_DIR, BANKS[bank].file);
  if (!existsSync(path)) {
    console.error(`Missing ${path}.`);
    process.exit(1);
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Draft);
}

async function main() {
  // Validate everything before creating anything.
  const plan = banks.map((bank) => ({ bank, drafts: readDrafts(bank) }));
  const bad = plan.flatMap(({ bank, drafts }) =>
    drafts.map((d) => ({ id: d.id, p: problems(d, bank) })).filter((x) => x.p.length),
  );
  if (bad.length) {
    for (const b of bad) console.error(`✗ ${b.id}: ${b.p.join(", ")}`);
    console.error(`${bad.length} draft(s) failed checks. Nothing was uploaded.`);
    process.exit(1);
  }

  for (const { bank, drafts } of plan) {
    const todo = drafts.filter((d) => !uploaded[d.id]);
    console.log(`\n${bank}: ${drafts.length} drafts, ${drafts.length - todo.length} already uploaded, ${todo.length} to create.${dry ? " (dry run)" : ""}`);
    for (const d of todo) {
      const label = `${d.id} [${d.Tier} · ${d.Topic} · ${d.Status}] ${d.Question.slice(0, 60)}`;
      if (dry) {
        console.log(`  would create ${label}`);
        continue;
      }
      const page = await notion("/pages", {
        parent: { type: "data_source_id", data_source_id: BANKS[bank].dataSourceId },
        properties: properties(d, bank),
      });
      uploaded[d.id] = page.id;
      saveUploaded();
      console.log(`  ✓ ${label}`);
    }
  }
  if (!dry) console.log(`\nDone. ${Object.keys(uploaded).length} page id(s) recorded in data/questions/uploaded.json.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
