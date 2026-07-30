import { create } from "zustand";

/**
 * Session-local tabs and text edits. Project-aware dirty checks stay in
 * selectors.ts; callers must reset this store when switching projects.
 */
interface TabsState {
  openTabs: string[];
  activeTab: string | null;
  /** Absence means the editor should read the saved project content. */
  edits: Record<string, string>;

  open: (path: string) => void;

  openMany: (paths: string[]) => void;

  /**
   * Close `path`. If it was the active tab, activates the neighbour
   * to its right when one exists, otherwise to its left. Draft edits
   * remain in memory so closing and reopening a tab cannot lose work.
   */
  close: (path: string) => void;

  setActive: (path: string) => void;

  updateContent: (path: string, content: string) => void;

  markClean: (path?: string) => void;

  markCleanMany: (paths: readonly string[]) => void;

  discardEdits: (path: string) => void;

  reset: (initial?: string[]) => void;
}

export const useTabsStore = create<TabsState>((set) => ({
  openTabs: [],
  activeTab: null,
  edits: {},

  open: (path) =>
    set((s) => {
      if (s.openTabs.includes(path)) return { activeTab: path };
      return { openTabs: [...s.openTabs, path], activeTab: path };
    }),

  openMany: (paths) =>
    set((s) => {
      if (paths.length === 0) return s;
      const toAdd = paths.filter((p) => !s.openTabs.includes(p));
      if (toAdd.length === 0) {
        return { activeTab: paths[paths.length - 1]! };
      }
      return {
        openTabs: [...s.openTabs, ...toAdd],
        activeTab: paths[paths.length - 1]!,
      };
    }),

  close: (path) =>
    set((s) => {
      const idx = s.openTabs.indexOf(path);
      if (idx === -1) return s;
      const nextTabs = s.openTabs.filter((p) => p !== path);
      let nextActive: string | null = s.activeTab;
      if (s.activeTab === path) {
        // Prefer the tab to the right, fall back to the left.
        nextActive = nextTabs[idx] ?? nextTabs[idx - 1] ?? null;
      }
      return { openTabs: nextTabs, activeTab: nextActive };
    }),

  setActive: (path) => set((s) => (s.openTabs.includes(path) ? { activeTab: path } : s)),

  updateContent: (path, content) => set((s) => ({ edits: { ...s.edits, [path]: content } })),

  markClean: (path) =>
    set((s) => {
      if (path === undefined) return { edits: {} };
      if (!(path in s.edits)) return s;
      const { [path]: _drop, ...rest } = s.edits;
      return { edits: rest };
    }),

  markCleanMany: (paths) =>
    set((s) => {
      const present = paths.filter((p) => p in s.edits);
      if (present.length === 0) return s;
      const next = { ...s.edits };
      for (const p of present) delete next[p];
      return { edits: next };
    }),

  discardEdits: (path) =>
    set((s) => {
      if (!(path in s.edits)) return s;
      const { [path]: _drop, ...rest } = s.edits;
      return { edits: rest };
    }),

  reset: (initial) =>
    set({
      openTabs: initial ?? [],
      activeTab: initial && initial.length > 0 ? (initial[0] ?? null) : null,
      edits: {},
    }),
}));
