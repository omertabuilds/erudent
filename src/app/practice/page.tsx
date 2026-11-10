import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import PracticeRoom from "@/components/PracticeRoom";

export const dynamic = "force-dynamic";

export default async function PracticePage() {
  await requirePlayer("/practice");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-10 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <h1 className="font-serif text-4xl tracking-tight">Practice</h1>
        <Link href="/play" className="inline-flex min-h-11 items-center text-sm text-muted underline-offset-4 hover:underline">
          Back to lobby
        </Link>
      </header>
      <p className="-mt-6 text-sm text-muted">Unrated · no timer · endless. Your Elo doesn&apos;t change here.</p>

      <PracticeRoom />
    </main>
  );
}
