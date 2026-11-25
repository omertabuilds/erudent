import type { Metadata } from "next";
import AuthShell from "@/components/AuthShell";
import { authLabel, authNote, authTitle } from "@/components/ui";
import GoogleSignIn from "@/components/GoogleSignIn";

export const metadata: Metadata = {
  title: "Sign in — Erudent",
};

export default function LoginPage() {
  return (
    <AuthShell>
      <p className={authLabel}>Sign in</p>
      <h1 className={`${authTitle} mt-3`}>There exists a faster solver than you. Find out who.</h1>
      <p className="mt-3 text-[15px] leading-[23px] text-[#b3afa6]">Sign in to play ranked math duels.</p>
      <div className="mt-6">
        <GoogleSignIn />
      </div>
      <p className={`${authNote} mt-6 border-t border-line pt-4`}>
        You must be 13 or older to play.
      </p>
    </AuthShell>
  );
}
