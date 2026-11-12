/**
 * Notion Question Bank + Practice Bank → Supabase.
 *
 * For each bank, takes every question with Status = Approved, checks it, saves it to the
 * questions table, then flips it to Live in Notion. Bad answers get flipped
 * to "Needs fix" instead, with the reason printed here.
 *
 *   npm run import-questions             # do it
 *   npm run import-questions -- --dry    # just show what would happen
 *   npm run import-questions -- --bank practice   # only one bank (ranked | practice)
 *
 * Needs these in .env.local (server-only, never NEXT_PUBLIC_, never in Discord):
 *   NOTION_TOKEN, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 */
import { createClient } from "@supabase/supabase-js";
import { normalizeAnswer } from "../src/lib/answers";

const BANKS = [
  { pool: "ranked", name: "Question Bank", dataSourceId: "5b2cca4f-30a4-405c-8ba2-8978bf9f8450" },
  { pool: "practice", name: "Practice Bank", dataSourceId: "23819bf1-ea0e-4c13-9513-699d244473f6" },
] as const;
type Bank = (typeof BANKS)[number];
const bankArg = process.argv.includes("--bank") ? process.argv[process.argv.indexOf("--bank") + 1] : undefined;
const NOTION_VERSION = "2025-09-03";
const dry = process.argv.includes("--dry");

function env(name: string) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Add it to .env.local (see .env.example).`);
    process.exit(1);
  }
  return v;
}

const notionToken = env("NOTION_TOKEN");
const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

async function notion(path: string, method: "GET" | "POST" | "PATCH", body?: unknown) {
  // Retries dropped connections and rate limits, so a long import doesn't die halfway.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`https://api.notion.com/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if ((res.status === 429 || res.status >= 500) && attempt < 5) throw new Error(`retryable ${res.status}`);
      if (!res.ok) throw new Error(`Notion ${method} ${path}: ${res.status} ${await res.text()}`);
      return res.json();
    } catch (e) {
      const retryable = e instanceof TypeError || (e instanceof Error && e.message.startsWith("retryable"));
      if (!retryable || attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

type RichText = { plain_text: string }[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = { id: string; properties: Record<string, any> };

const text = (rt: RichText | undefined) => (rt ?? []).map((t) => t.plain_text).join("").trim();

async function pagesWithStatus(bank: Bank, status: string): Promise<Page[]> {
  const pages: Page[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion(`/data_sources/${bank.dataSourceId}/query`, "POST", {
      filter: { property: "Status", status: { equals: status } },
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

const setStatus = (pageId: string, name: string) =>
  notion(`/pages/${pageId}`, "PATCH", { properties: { Status: { status: { name } } } });

async function importBank(bank: Bank) {
  const pages = await pagesWithStatus(bank, "Approved");
  console.log(`\n${bank.name}: ${pages.length} approved question(s).${dry ? " (dry run)" : ""}`);
  let imported = 0;
  let rejected = 0;

  for (const page of pages) {
    const p = page.properties;
    const prompt = text(p.Question?.title);
    const rawAnswer = text(p.Answer?.rich_text);
    const solution = text(p.Solution?.rich_text);
    const topic = p.Topic?.select?.name as string | undefined;
    const tier = Number.parseInt(p.Tier?.select?.name ?? "", 10); // "3 Scholar" → 3
    const answer = normalizeAnswer(rawAnswer);

    const problems = [
      !prompt && "no question text",
      !topic && "no topic",
      !(tier >= 1 && tier <= 6) && "no tier",
      answer === null && `answer "${rawAnswer}" isn't an integer or fraction`,
    ].filter(Boolean);

    const label = `#${p.ID?.unique_id?.number ?? "?"} ${prompt.slice(0, 50)}`;
    if (problems.length) {
      rejected++;
      console.log(`✗ ${label}: ${problems.join(", ")} → Needs fix`);
      if (!dry) await setStatus(page.id, "Needs fix");
      continue;
    }

    console.log(`✓ ${label} (tier ${tier}, ${topic}, answer ${answer})`);
    if (dry) continue;

    const { error } = await supabase.from("questions").upsert(
      {
        notion_id: page.id,
        pool: bank.pool,
        tier,
        topic,
        prompt,
        answer,
        solution,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "notion_id" },
    );
    if (error) {
      console.error(`  database error: ${error.message}`);
      continue;
    }
    await setStatus(page.id, "Live");
    imported++;
  }

  // Questions moved back to "Needs fix" in Notion get pulled out of play.
  if (!dry) {
    const ids = (await pagesWithStatus(bank, "Needs fix")).map((pg) => pg.id);
    if (ids.length) {
      const { count } = await supabase
        .from("questions")
        .update({ active: false }, { count: "exact" })
        .in("notion_id", ids)
        .eq("active", true);
      if (count) console.log(`Pulled ${count} question(s) marked Needs fix out of play.`);
    }
  }

  const { data: counts, error } = await supabase.from("questions").select("tier").eq("active", true).eq("pool", bank.pool);
  if (error) throw new Error(`Couldn't read live counts from Supabase: ${error.message}`);
  const perTier = [1, 2, 3, 4, 5, 6].map((t) => (counts ?? []).filter((r) => r.tier === t).length);
  console.log(`${bank.name}: imported ${imported}, sent back ${rejected}.`);
  console.log(`Live ${bank.pool} questions per tier: ${perTier.map((n, i) => `T${i + 1} ${n}`).join(" · ")}`);
  if (perTier.some((n) => n < 3)) console.log(`Heads up: every tier needs at least 3 ${bank.pool} questions.`);
}

async function main() {
  const banks = BANKS.filter((b) => !bankArg || b.pool === bankArg);
  if (!banks.length) {
    console.error(`Unknown --bank "${bankArg}". Use ranked or practice.`);
    process.exit(1);
  }
  for (const bank of banks) await importBank(bank);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
