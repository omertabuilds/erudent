import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { api } from "@/lib/erudent";
import RenameForm from "@/components/RenameForm";

export const dynamic = "force-dynamic";

/** Players whose username breaks the naming rules land here before anything else. */
export default async function RenamePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: nextParam } = await searchParams;
  const next = nextParam?.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/play";
  const here = `/onboarding/rename?next=${encodeURIComponent(next)}`;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);
  const profile = await api.myPlayer(supabase);
  if (!profile) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  if (!profile.needs_rename) redirect(next);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col justify-center gap-8 px-4 py-12 font-ui text-ink">
      <div className="flex flex-col gap-4">
        <h1 className="text-[40px] leading-[1.05] font-extrabold tracking-[-0.03em]">Pick a new username</h1>
        <p className="text-[17px] leading-[26px] text-ink-muted">
          <span className="break-all text-ink">@{profile.username}</span> doesn&apos;t fit our naming rules. Your Elo and
          match history stay with you.
        </p>
      </div>
      <RenameForm />
    </main>
  );
}
