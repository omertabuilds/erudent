import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { api } from "@/lib/erudent";
import type { Metadata } from "next";
import AuthShell from "@/components/AuthShell";
import { RenameView } from "@/components/RenameForm";
import { SiteHeaderView } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choose a new name — Erudent",
};

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
    <AuthShell header={<SiteHeaderView state="setup" />}>
      <RenameView username={profile.username} />
    </AuthShell>
  );
}
