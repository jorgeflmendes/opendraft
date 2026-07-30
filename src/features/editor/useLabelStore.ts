import { getFileExtension } from "@/services/path-utils";
import { create } from "zustand";
import type { Project } from "@/domain";
import { collectTextSources, sameTextSources } from "./source-index";

// project-wide \label{} index.
//
// Scans every .tex / .ltx / .sty / .cls in the active project for
// `\label{...}` declarations and exposes them so the editor's
// \ref autocomplete can suggest the right key. We strip comment
// lines (`% ...`) so a commented-out label doesn't appear, but we
// keep it forgiving: anything past a `\label{` up to the next `}`
// is taken as the key.

export interface LabelDecl {
  /** The label key - passed to \ref / \eqref / \pageref. */
  key: string;
  /** Source path the label was declared in. */
  path: string;
  /** 1-based source line. */
  line: number;
}

const TEXT_LIKE_EXTS = new Set(["tex", "ltx", "sty", "cls"]);
const LABEL_RE = /\\label\{([^}]+)\}/g;

interface LabelStoreState {
  labels: LabelDecl[];
  rebuild: (project: Project, edits?: Record<string, string>) => void;
  reset: () => void;
}

export const useLabelStore = create<LabelStoreState>((set) => {
  let indexedProjectId: string | null = null;
  let indexedSources = new Map<string, string>();

  return {
    labels: [],
    rebuild: (project, edits) => {
      const sources = collectTextSources(project, edits, (path) =>
        TEXT_LIKE_EXTS.has(getFileExtension(path)),
      );
      if (indexedProjectId === project.id && sameTextSources(indexedSources, sources)) return;

      indexedProjectId = project.id;
      indexedSources = sources;
      const labels: LabelDecl[] = [];
      for (const [path, source] of sources) {
        if (source.length === 0) continue;
        const lines = source.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const raw = lines[i]!;
          if (/^\s*%/.test(raw)) continue;
          LABEL_RE.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = LABEL_RE.exec(raw)) !== null) {
            const key = match[1]!.trim();
            if (key) labels.push({ key, path, line: i + 1 });
          }
        }
      }
      set({ labels });
    },
    reset: () => {
      indexedProjectId = null;
      indexedSources = new Map();
      set({ labels: [] });
    },
  };
});
