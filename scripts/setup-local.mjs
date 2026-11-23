import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(
  execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], {
    encoding: "utf8",
  }),
);
const url = status.API_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Local Supabase only.");
const anon = status.ANON_KEY;
const service = status.SERVICE_ROLE_KEY;
if (!anon || !service) throw new Error("Local status must include anon and service-role keys.");
const existing = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
const oldUrl = existing.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim();
if (oldUrl && !["127.0.0.1", "localhost"].includes(new URL(oldUrl).hostname))
  throw new Error("Refusing to replace a hosted environment.");
const password = existing.match(/^LOCAL_TEST_PASSWORD=(.*)$/m)?.[1]?.trim() || randomBytes(24).toString("hex");
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const check = (result) => {
  if (result.error) throw result.error;
  return result.data;
};
const users = check(await admin.auth.admin.listUsers({ perPage: 1000 })).users;
for (const username of ["alice", "bob"]) {
  const email = username + "@erudent.test";
  let user = users.find((u) => u.email === email);
  if (!user) user = check(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;
  else check(await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true }));
  const profile = check(await admin.from("profiles").select("id").eq("id", user.id).maybeSingle());
  if (!profile) check(await admin.from("profiles").insert({ id: user.id, username, elo: 900 }));
  const code_hash = createHash("sha256")
    .update("erudent-local-test:" + user.id)
    .digest("hex");
  check(
    await admin
      .from("access_codes")
      .upsert(
        {
          code_hash,
          note: "Local development test account",
          redeemed_by: user.id,
          redeemed_at: new Date().toISOString(),
        },
        { onConflict: "code_hash" },
      ),
  );
}
const questions = [];
for (const pool of ["ranked", "practice"])
  for (let tier = 1; tier <= 6; tier++)
    for (let i = 1; i <= 12; i++) {
      const a = tier * 10 + i,
        b = i + 2;
      questions.push({
        notion_id: "local-report:" + pool + ":" + tier + ":" + i,
        tier,
        pool,
        topic: "Arithmetic",
        prompt: "Calculate " + a + " + " + b + ".",
        answer: String(a + b),
        solution: a + " + " + b + " = " + (a + b) + ".",
        active: true,
      });
    }
check(await admin.from("questions").upsert(questions, { onConflict: "notion_id" }));
let env = existing;
for (const [key, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
  LOCAL_TEST_PASSWORD: password,
})) {
  const re = new RegExp("^" + key + "=.*$", "m");
  env = re.test(env) ? env.replace(re, key + "=" + value) : env + "\n" + key + "=" + value;
}
writeFileSync(".env.local", env.trim() + "\n");
console.log("Created local Alice and Bob, seeded 144 questions, and configured .env.local.");
console.log("Start npm run dev, then open http://127.0.0.1:3000/dev-login");
