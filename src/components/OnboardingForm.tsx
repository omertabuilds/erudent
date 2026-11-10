"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError } from "@/lib/erudent";
import { usernameProblemFrom } from "@/lib/username";
import UsernameField, { errorClass, safeNext, useUsername } from "@/components/UsernameField";
import { BannerArt, Picture, RankTag, hue } from "@/components/ProfileBanner";
import { caption, field, kicker, label, primary, title } from "@/components/ui";

export default function OnboardingForm() {
  const router = useRouter();
  const username = useUsername();
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createProfile(createClient(), username.value.trim(), birthDate);
      router.replace(safeNext());
    } catch (err) {
      const problem = usernameProblemFrom(err instanceof Error ? err.message : null);
      if (problem && problem !== "rate_limited") username.setProblem(problem);
      else setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-16 md:grid-cols-12 md:gap-x-8 lg:gap-x-16">
      <div className="max-w-[480px] min-w-0 md:col-span-7 lg:col-span-6">
        <p className={kicker}>Step 1 of 1</p>
        <h1 className={`${title} mt-5`}>Choose your name.</h1>
        <form onSubmit={submit} className="mt-10 flex flex-col gap-8" noValidate>
          <UsernameField state={username} autoFocus />
          <div className="flex flex-col">
            <label htmlFor="birth-date" className={label}>
              Birth date
            </label>
            <input
              id="birth-date"
              type="date"
              className={`${field} mt-2 text-left tabular-nums scheme-light in-data-[theme=dark]:scheme-dark`}
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              aria-describedby="birth-date-note"
            />
            <p id="birth-date-note" className={`${caption} mt-2`}>
              Only used to check you&apos;re 13 or older. We don&apos;t save it.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <button
              className={`${primary} w-full cursor-pointer disabled:cursor-not-allowed sm:w-auto sm:min-w-[200px] sm:self-start`}
              disabled={!username.locallyValid || birthDate === "" || busy}
            >
              {busy ? "Saving…" : "Start"}
            </button>
            {error && (
              <p className={errorClass} role="alert">
                {error}
              </p>
            )}
          </div>
        </form>
      </div>

      <aside className="hidden min-w-0 md:col-span-5 md:col-start-8 md:block lg:col-span-4 lg:col-start-9" aria-hidden="true">
        <NamePreview name={username.value.trim()} />
      </aside>
    </div>
  );
}

/** A compact banner as others will see it: the default graph-paper art, unranked. Saves nothing. */
function NamePreview({ name }: { name: string }) {
  const color = hue(0); // the rank accent while unranked
  return (
    <div className="md:pt-[52px]">
      <p className="text-[13px] leading-[18px] font-semibold text-ink-muted">How others see you</p>
      <div className="mt-3 overflow-hidden rounded-(--r-md) border border-hairline bg-surface">
        <div className="h-20">
          <BannerArt banner="grid" color={color} />
        </div>
        <div className="flex items-start gap-3 px-4 pb-4">
          <span className="-mt-6 flex">
            <Picture username={name} url={null} size={48} />
          </span>
          <div className="min-w-0 pt-2">
            <p className={`text-[20px] leading-[26px] font-extrabold tracking-[-0.01em] break-all ${name ? "text-ink" : "text-ink-muted"}`}>
              @{name || "yourname"}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <RankTag rank="Unranked" tier={0} />
              <span className="text-[13px] text-ink-muted tabular-nums">0W · 0L · 0D</span>
            </div>
          </div>
        </div>
      </div>
      <p className={`${caption} mt-3`}>Your rank is set after ten ranked duels. Change the banner and accent later on Play.</p>
    </div>
  );
}
