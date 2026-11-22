import { notFound, redirect } from "next/navigation";
import { createClient as createBrowserlessClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { api } from "@/lib/erudent";

export const dynamic = "force-dynamic";
function localConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const password = process.env.LOCAL_TEST_PASSWORD;
  if (process.env.NODE_ENV !== "development" || !url || !key || !password || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) notFound();
  return {url,key,password};
}
async function start(form: FormData) {
  "use server";
  const {url,key,password} = localConfig();
  const sb = await createClient();
  const {error} = await sb.auth.signInWithPassword({email:"alice@erudent.test",password});
  if(error) throw new Error("Local test account unavailable. Run npm run local:setup first.");
  if(form.get("mode") === "duel") {
    const active = await api.myActiveMatch(sb);
    if(active) redirect("/match/"+active);
    const bot = createBrowserlessClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const signed = await bot.auth.signInWithPassword({email:"bob@erudent.test",password});
    if(signed.error) throw new Error("Local opponent unavailable.");
    const match = await api.createFriendMatch(sb);
    await api.joinFriendMatch(bot,match.code);
    redirect("/match/"+match.match_id);
  }
  redirect("/play");
}
export default function LocalLogin() {
  localConfig();
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-16 text-ink">
    <h1 className="text-3xl font-bold">Local duel testing</h1>
    <p>Sign in as Alice and try a duel against the local Bob account. These accounts and questions exist only in your local database.</p>
    <form action={start} className="flex flex-wrap gap-4">
      <button name="mode" value="duel" className="min-h-11 rounded-lg bg-ink px-5 text-on-ink">Start test duel</button>
      <button name="mode" value="lobby" className="min-h-11 rounded-lg border border-line px-5">Open lobby as Alice</button>
    </form>
    <p className="text-sm text-ink-muted">Bob does not submit answers. You can report any question during play or in the results.</p>
  </main>;
}
