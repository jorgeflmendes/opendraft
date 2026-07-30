import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  SHORTCUT_BY_ID,
  SHORTCUT_DEFINITIONS,
  type ShortcutBindingMap,
  type ShortcutId,
  scopesConflict,
  shortcutDefaults,
} from "@/features/shortcuts/shortcut-registry";
import { comboSignature, isMacPlatform } from "@/lib/keymap/parse-combo";

export type ShortcutOverrides = Partial<Record<ShortcutId, string[]>>;

interface ShortcutState {
  overrides: ShortcutOverrides;
  setBindings: (id: ShortcutId, bindings: readonly string[]) => void;
  resetBinding: (id: ShortcutId) => void;
  resetAll: () => void;
}

const platformIsMac = () => isMacPlatform(typeof navigator !== "undefined" ? navigator : {});
const PLATFORM_DEFAULTS = shortcutDefaults();

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set) => ({
      overrides: {},
      setBindings: (id, bindings) =>
        set((state) => ({
          overrides: {
            ...state.overrides,
            [id]: deduplicateBindings(bindings),
          },
        })),
      resetBinding: (id) =>
        set((state) => {
          const overrides = { ...state.overrides };
          delete overrides[id];
          return { overrides };
        }),
      resetAll: () => set({ overrides: {} }),
    }),
    {
      name: "opendraft.shortcuts",
      version: 1,
      partialize: (state) => ({ overrides: state.overrides }),
      merge: (persisted, current) => {
        const candidate = persisted as { overrides?: unknown };
        return {
          ...current,
          overrides: sanitizeOverrides(candidate.overrides),
        };
      },
    },
  ),
);

export function effectiveShortcutBindings(overrides: ShortcutOverrides): ShortcutBindingMap {
  return Object.fromEntries(
    SHORTCUT_DEFINITIONS.map(({ id }) => [id, overrides[id] ?? PLATFORM_DEFAULTS[id]]),
  ) as ShortcutBindingMap;
}

export function useShortcutBindings(id: ShortcutId): readonly string[] {
  const override = useShortcutStore((state) => state.overrides[id]);
  return override ?? PLATFORM_DEFAULTS[id];
}

export interface ShortcutConflict {
  id: ShortcutId;
  label: string;
}

export function findShortcutConflict(
  bindings: ShortcutBindingMap,
  ownerId: ShortcutId,
  combo: string,
  ignoredIndex?: number,
): ShortcutConflict | null {
  const owner = SHORTCUT_BY_ID[ownerId];
  const signature = comboSignature(combo, platformIsMac());

  for (const definition of SHORTCUT_DEFINITIONS) {
    if (!scopesConflict(owner.scope, definition.scope)) continue;
    const candidates = bindings[definition.id];
    for (let index = 0; index < candidates.length; index += 1) {
      if (definition.id === ownerId && index === ignoredIndex) continue;
      const candidate = candidates[index];
      if (candidate && comboSignature(candidate, platformIsMac()) === signature) {
        return { id: definition.id, label: definition.label };
      }
    }
  }
  return null;
}

function deduplicateBindings(bindings: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const binding of bindings) {
    const trimmed = binding.trim();
    if (!trimmed) continue;
    const signature = comboSignature(trimmed, platformIsMac());
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(trimmed);
  }
  return result;
}

function sanitizeOverrides(value: unknown): ShortcutOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const sanitized: ShortcutOverrides = {};
  for (const [id, bindings] of Object.entries(value)) {
    if (!(id in SHORTCUT_BY_ID) || !Array.isArray(bindings)) continue;
    if (!bindings.every((binding) => typeof binding === "string")) continue;
    try {
      sanitized[id as ShortcutId] = deduplicateBindings(bindings);
    } catch {
      // Ignore malformed persisted values instead of breaking app startup.
    }
  }
  return sanitized;
}
