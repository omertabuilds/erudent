import type { Metadata } from "next";
import AuthShell from "@/components/AuthShell";
import GoogleSignIn from "@/components/GoogleSignIn";
import { SiteHeaderView } from "@/components/SiteHeader";
import { caption, kicker, title } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sign in — Erudent",
};

export default function LoginPage() {
  return (
    <AuthShell header={<SiteHeaderView state="signed-out" />}>
      <div className="max-w-[640px]">
        <p className={kicker}>Sign in</p>
        <h1 className={`${title} mt-5`}>There exists a faster solver than you. Find out who.</h1>
      </div>
      <div className="max-w-[480px]">
        <p className="mt-6 text-ink-muted">Sign in to play ranked math duels.</p>
        <div className="mt-10">
          <GoogleSignIn />
        </div>
        <p className={`${caption} mt-6 border-t border-hairline pt-4`}>
          Erudent is invite-only for now: you&apos;ll need a code to play. You must be 13 or older.
        </p>
      </div>
    </AuthShell>
  );
}
