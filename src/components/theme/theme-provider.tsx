"use client";

// Light/dark theme and visual performance mode. Both are stored locally in this
// browser only: no account and no network request is needed to change them.
// State is read with useSyncExternalStore, so no effect calls setState.
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type ThemeName = "light" | "dark";
export type PerformanceChoice = "auto" | "elegant" | "balanced" | "minimal";
export type PerformanceMode = Exclude<PerformanceChoice, "auto">;

export const THEME_STORAGE_KEY = "pollify-theme";
export const PERFORMANCE_STORAGE_KEY = "pollify-performance";
const APPEARANCE_EVENT = "pollify:appearance";

type AppearanceValue = {
  theme: ThemeName;
  toggleTheme: () => void;
  performanceChoice: PerformanceChoice;
  setPerformanceChoice: (choice: PerformanceChoice) => void;
  performanceMode: PerformanceMode;
};

const AppearanceContext = createContext<AppearanceValue | null>(null);

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // Storage can be blocked (private mode, policy). Fall back to defaults.
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Keep the choice for this visit only.
  }
}

function isChoice(value: string | null): value is PerformanceChoice {
  return value === "auto" || value === "elegant" || value === "balanced" || value === "minimal";
}

/**
 * Automatic resolves to Minimal. Device hints (cores, memory) are too coarse to justify
 * heavier motion, so the background stays static unless the visitor picks another mode.
 */
export function resolveAutomaticMode(): PerformanceMode {
  return "minimal";
}

function notifyAppearanceChanged() {
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

function subscribeTheme(onChange: () => void) {
  window.addEventListener(APPEARANCE_EVENT, onChange);
  return () => window.removeEventListener(APPEARANCE_EVENT, onChange);
}

function getTheme(): ThemeName {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribePerformance(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  window.addEventListener(APPEARANCE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(APPEARANCE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    media.removeEventListener("change", onChange);
  };
}

function getPerformanceChoice(): PerformanceChoice {
  const saved = readStorage(PERFORMANCE_STORAGE_KEY);
  return isChoice(saved) ? saved : "minimal"; // Minimal is the default experience.
}

function getPerformanceMode(): PerformanceMode {
  const choice = getPerformanceChoice();
  return choice === "auto" ? resolveAutomaticMode() : choice;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  // Server snapshots are neutral defaults. After hydration React reads the real
  // values. The inline script in the root layout has already set the theme class.
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "light" as ThemeName);
  const performanceChoice = useSyncExternalStore(subscribePerformance, getPerformanceChoice, () => "minimal" as PerformanceChoice);
  const performanceMode = useSyncExternalStore(subscribePerformance, getPerformanceMode, () => "minimal" as PerformanceMode);

  useEffect(() => {
    document.documentElement.dataset.performance = performanceMode;
  }, [performanceMode]);

  const toggleTheme = useCallback(() => {
    const next: ThemeName = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    writeStorage(THEME_STORAGE_KEY, next);
    notifyAppearanceChanged();
  }, []);

  const setPerformanceChoice = useCallback((choice: PerformanceChoice) => {
    writeStorage(PERFORMANCE_STORAGE_KEY, choice);
    notifyAppearanceChanged();
  }, []);

  const value = useMemo(
    () => ({ theme, toggleTheme, performanceChoice, setPerformanceChoice, performanceMode }),
    [theme, toggleTheme, performanceChoice, setPerformanceChoice, performanceMode],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("useAppearance must be used inside <AppearanceProvider>.");
  return context;
}
