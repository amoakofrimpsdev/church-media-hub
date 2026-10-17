"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

/**
 * Light, dark, or whatever the device is set to. Remembered on this device
 * only. The script in the root layout applies it before the page paints, so
 * there is no flash of the wrong theme.
 */

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "rcw-theme";

/** Runs in <head> before the page paints. Kept tiny and dependency-free. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.dataset.theme="dark"}catch(e){}`;

const listeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "system" ? stored : "light";
  } catch {
    return "light";
  }
}

function apply(choice: ThemeChoice) {
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}

function choose(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private browsing: still switch for this visit.
  }
  apply(choice);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Follow the device while "system" is chosen.
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (readChoice() === "system") apply("system");
  };
  media.addEventListener("change", onChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onChange);
  };
}

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const current = useSyncExternalStore(subscribe, readChoice, () => "light" as const);
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={cn("grid grid-cols-3 gap-1 rounded-full bg-surface-soft p-1", className)}
    >
      {OPTIONS.map((option) => {
        const selected = current === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => choose(option.value)}
            className={cn(
              "flex h-8 items-center justify-center gap-1.5 rounded-full text-caption font-bold transition-colors",
              selected ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
            )}
          >
            <option.icon aria-hidden size={14} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
