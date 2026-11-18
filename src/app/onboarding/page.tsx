import type { Metadata } from "next";
import AuthShell, { SignOutButton } from "@/components/AuthShell";
import OnboardingForm from "@/components/OnboardingForm";

export const metadata: Metadata = {
  title: "Choose your name — Erudent",
};

export default function OnboardingPage() {
  return (
    <AuthShell aside={<SignOutButton />}>
      <OnboardingForm />
    </AuthShell>
  );
}
