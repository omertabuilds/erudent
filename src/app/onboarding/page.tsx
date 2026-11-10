import type { Metadata } from "next";
import AuthShell from "@/components/AuthShell";
import OnboardingForm from "@/components/OnboardingForm";
import { SiteHeaderView } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Choose your name — Erudent",
};

export default function OnboardingPage() {
  return (
    <AuthShell header={<SiteHeaderView state="setup" />}>
      <OnboardingForm />
    </AuthShell>
  );
}
