import { create } from "zustand";
import { persist } from "zustand/middleware";

// User-facing UI preferences. Persisted to localStorage so a reload keeps
// the user's theme and density. The pre-mount script in index.html reads
// from the same key (`opendraft.prefs`) to set the data-attrs before React
// boots, which is what prevents a theme flash.

export type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";
/** Auto-save cadence. `off` disables the periodic save timer. */
export type AutoSaveInterval = "off" | "5s" | "15s" | "30s";

interface PreferencesState {
  theme: Theme;
  density: Density;
  autoSave: AutoSaveInterval;
  setTheme: (theme: Theme) => void;
  setDensity: (density: Density) => void;
  setAutoSave: (interval: AutoSaveInterval) => void;
  toggleTheme: () => void;
}

export function autoSaveIntervalSeconds(interval: AutoSaveInterval): number {
  if (interval === "5s") return 5;
  if (interval === "15s") return 15;
  if (interval === "30s") return 30;
  return 0;
}

function validTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function validDensity(value: unknown): value is Density {
  return value === "comfortable" || value === "compact";
}

function validAutoSave(value: unknown): value is AutoSaveInterval {
  return value === "off" || value === "5s" || value === "15s" || value === "30s";
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      // Match the index.html pre-mount fallback so SSR/initial-paint agree.
      theme:
        typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
      density: "comfortable",
      autoSave: "15s",
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setAutoSave: (autoSave) => set({ autoSave }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
    }),
    {
      name: "opendraft.prefs",
      version: 1,
      // Only persist values, not the setters.
      partialize: (s) => ({ theme: s.theme, density: s.density, autoSave: s.autoSave }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PreferencesState>;
        return {
          ...current,
          theme: validTheme(saved.theme) ? saved.theme : current.theme,
          density: validDensity(saved.density) ? saved.density : current.density,
          autoSave: validAutoSave(saved.autoSave) ? saved.autoSave : current.autoSave,
        };
      },
    },
  ),
);
