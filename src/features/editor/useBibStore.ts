import { create } from "zustand";
import type { Project } from "@/domain";
import { parseBib, type BibEntry } from "@/lib/bibtex/parse";
import { collectTextSources, sameTextSources } from "./source-index";

// project-wide bibliography index.
//
// Owns a flat list of every BibEntry parsed from every .bib file
// in the active project. Rebuilt by the editor's effect on project
// switches and after every .bib edit lands in tabs.edits - that
// way \cite autocomplete sees a freshly-added entry the moment the
// user closes the brace, no save required.
//
// Reads are cheap: callers either consume the whole list (the bib
// browser panel) or call `byKey(key)` for single-entry lookup.

interface BibStoreState {
  /** Every parsed entry in stable per-file source order. */
  entries: BibEntry[];
  /** Path of the .bib file each entry came from - same length
   *  as `entries` so callers can group / link back to source. */
  origins: string[];
  /** Rebuild from a project + optional edits overlay. */
  rebuild: (project: Project, edits?: Record<string, string>) => void;
  /** Resolve an entry by its cite key. O(n) - fine for our
   *  project sizes; an index would only matter for thousands of
   *  entries. */
  byKey: (key: string) => BibEntry | undefined;
  /** Clear (project closed). */
  reset: () => void;
}

export const useBibStore = create<BibStoreState>((set) => {
  let indexedProjectId: string | null = null;
  let indexedSources = new Map<string, string>();
  let entriesByKey = new Map<string, BibEntry>();

  return {
    entries: [],
    origins: [],
    rebuild: (project, edits) => {
      const sources = collectTextSources(project, edits, (path) =>
        path.toLowerCase().endsWith(".bib"),
      );
      if (indexedProjectId === project.id && sameTextSources(indexedSources, sources)) return;

      indexedProjectId = project.id;
      indexedSources = sources;
      const entries: BibEntry[] = [];
      const origins: string[] = [];
      entriesByKey = new Map();
      for (const [path, source] of sources) {
        if (source.length === 0) continue;
        for (const entry of parseBib(source)) {
          entries.push(entry);
          origins.push(path);
          entriesByKey.set(entry.key, entry);
        }
      }
      set({ entries, origins });
    },
    byKey: (key) => entriesByKey.get(key),
    reset: () => {
      indexedProjectId = null;
      indexedSources = new Map();
      entriesByKey = new Map();
      set({ entries: [], origins: [] });
    },
  };
});
