import { useSyncExternalStore } from "react";

/**
 * Device-level preferences (theme, sound), kept in localStorage.
 * They belong to this browser, not the account, so they need no database change.
 * Used by the Settings page; the root layout reads THEME_KEY before first paint.
 */

export const THEME_KEY = "erudent-theme";
export const SOUND_KEY = "erudent-sound";

/** "system" follows the device (dark unless the device asks for light). */
export type ThemeChoice = "system" | "dark" | "light";

// ── Tiny store, so components re-render when a preference changes ──
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange); // another tab changed it
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (some private windows)
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice still applies until the page reloads.
  }
  emit();
}

// ── Theme ──

/** Puts the choice on <html data-theme>, which tokens.css switches on. */
export function applyTheme(choice: ThemeChoice) {
  const light = choice === "light" || (choice === "system" && matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
}

export function setTheme(choice: ThemeChoice) {
  write(THEME_KEY, choice === "system" ? null : choice);
  applyTheme(choice);
}

export function useTheme(): ThemeChoice {
  const saved = useSyncExternalStore(subscribe, () => read(THEME_KEY), () => null);
  return saved === "dark" || saved === "light" ? saved : "system";
}

// ── Sound ──
// Nothing plays yet. When sounds are added, check isSoundOn() before playing one.

export const isSoundOn = () => read(SOUND_KEY) !== "off";

export function setSoundOn(on: boolean) {
  write(SOUND_KEY, on ? null : "off");
}

export function useSoundOn(): boolean {
  return useSyncExternalStore(subscribe, isSoundOn, () => true);
}
