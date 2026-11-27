"use client";

import { setSoundOn, setTheme, useSoundOn, useTheme, type ThemeChoice } from "@/lib/preferences";
import { caption } from "@/components/ui";

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "Device" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

const SOUND: { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
];

/**
 * Theme and sound. Both are saved in this browser, not on the account, and take effect at once.
 * The pills match the accent picker in the customize panel.
 */
export default function Appearance() {
  const theme = useTheme();
  const soundOn = useSoundOn();

  return (
    <div className="flex flex-col gap-8">
      <fieldset>
        <legend className="font-semibold">Theme</legend>
        <div className="mt-4 flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <Pill key={t.value} name="theme" label={t.label} checked={theme === t.value} onSelect={() => setTheme(t.value)} />
          ))}
        </div>
        <p className={`${caption} mt-3`}>Device follows your system setting. Dark is the default.</p>
      </fieldset>

      <fieldset>
        <legend className="font-semibold">Sound effects</legend>
        <div className="mt-4 flex flex-wrap gap-2">
          {SOUND.map((s) => (
            <Pill key={s.label} name="sound" label={s.label} checked={soundOn === s.value} onSelect={() => setSoundOn(s.value)} />
          ))}
        </div>
        <p className={`${caption} mt-3`}>Nothing plays yet. This remembers your choice for when sounds are added.</p>
      </fieldset>
    </div>
  );
}

/** One radio, drawn as a pill. The real input stays in the page for keyboards and screen readers. */
function Pill({ name, label, checked, onSelect }: { name: string; label: string; checked: boolean; onSelect: () => void }) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="peer sr-only" />
      <span className="inline-flex h-11 items-center rounded-(--r-pill) border border-hairline px-5 text-[15px] text-ink-muted peer-checked:border-ink peer-checked:font-semibold peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
        {label}
      </span>
    </label>
  );
}
