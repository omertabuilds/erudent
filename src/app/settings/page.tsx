import type { Metadata } from "next";
import { requirePlayer } from "@/lib/session";
import { tierOf } from "@/lib/profile";
import { SiteHeaderView } from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ProfileSettings from "@/components/settings/ProfileSettings";
import Appearance from "@/components/settings/Appearance";
import { caption, secondary } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings — Erudent",
};

/**
 * Settings for the signed-in player: profile (opens the customize panel), appearance, account.
 * Only what the database supports today. Bio, school, password and delete wait on new database functions.
 */
export default async function SettingsPage() {
  // Sends anyone who is signed out, or still making or renaming a profile, somewhere else first.
  const { user, profile } = await requirePlayer("/settings");
  const email = user.email ?? null;
  const viaGoogle = user.app_metadata?.provider === "google";

  return (
    <div className="flex min-h-screen flex-col bg-bg font-ui text-[17px] leading-[26px] text-text">
      <SiteHeaderView state="player" current="settings" />

      <main className="mx-auto w-full max-w-[960px] flex-[1_0_auto] px-4 pt-8 pb-14 md:px-10">
        <h1 className="text-[clamp(36px,5vw,56px)] leading-none font-extrabold tracking-[-0.03em]">Settings</h1>

        <div className="mt-10 flex flex-col gap-12">
          <Section title="Profile">
            <ProfileSettings player={profile} tier={tierOf(profile.elo, profile.matches_played)} />
          </Section>

          <Section title="Appearance">
            <Appearance />
          </Section>

          <Section title="Account">
            <dl className="flex flex-col gap-6">
              <div>
                <dt className="font-semibold">Username</dt>
                <dd className="mt-1 text-ink-muted">@{profile.username}</dd>
                <dd className={`${caption} mt-1`}>Usernames can&apos;t be changed yet.</dd>
              </div>
              <div>
                <dt className="font-semibold">Email</dt>
                <dd className="mt-1 text-ink-muted">{email ?? "No email on this account"}</dd>
                {viaGoogle && <dd className={`${caption} mt-1`}>You sign in with Google, so your email and password are managed there.</dd>}
              </div>
            </dl>

            <form action="/auth/signout" method="post" className="mt-8">
              <button type="submit" className={`${secondary} cursor-pointer`}>
                Sign out
              </button>
            </form>
          </Section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/** A titled block, set off from the one above by a hairline rule. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `settings-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="border-t border-hairline pt-8">
      <h2 id={id} className="mb-6 text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
        {title}
      </h2>
      {children}
    </section>
  );
}
