import { getFileExtension } from "@/services/path-utils";
import type { Project } from "@/domain";
import { diffLines, type DiffOp, type DiffStats } from "@/lib/diff/line-diff";

export type FileDiffStatus = "unchanged" | "modified" | "added" | "deleted";

export interface FileDiff {
  path: string;
  status: FileDiffStatus;
  isBinary: boolean;
  ops: DiffOp[];
  stats: DiffStats;
}

export interface ProjectDiffSummary {
  files: FileDiff[];
  totals: DiffStats;
  changedCount: number;
}

const TEXTUAL_EXTENSIONS = new Set([
  "tex",
  "ltx",
  "sty",
  "cls",
  "clo",
  "def",
  "cfg",
  "fd",
  "bib",
  "bst",
  "bbx",
  "cbx",
  "lbx",
  "ist",
  "md",
  "makefile",
  "license",
  "dockerfile",
  "gitignore",
  "editorconfig",
  "env",
  "txt",
  "yml",
  "yaml",
  "json",
]);

/**
 * Compare the in-memory edit overlay with the saved project. Unknown file
 * formats are treated as binary, and results are path-sorted for stable UI.
 */
export function diffProject(project: Project, edits: Record<string, string>): ProjectDiffSummary {
  const paths = new Set([...Object.keys(project.files), ...Object.keys(edits)]);
  const files: FileDiff[] = [];

  for (const path of paths) {
    const file = project.files[path];
    const editedContent = edits[path];

    if (editedContent === undefined) {
      continue;
    }

    if (!file) {
      if (isLikelyBinary(path)) {
        files.push({ path, status: "added", isBinary: true, ops: [], stats: zeroStats() });
        continue;
      }
      try {
        const { ops, stats } = diffLines("", editedContent);
        files.push({ path, status: "added", isBinary: false, ops, stats });
      } catch {
        files.push({ path, status: "added", isBinary: true, ops: [], stats: zeroStats() });
      }
      continue;
    }

    if (isLikelyBinary(path)) {
      if (editedContent === "") {
        files.push({ path, status: "deleted", isBinary: true, ops: [], stats: zeroStats() });
      } else if (typeof file.content === "string" ? file.content !== editedContent : true) {
        files.push({ path, status: "modified", isBinary: true, ops: [], stats: zeroStats() });
      }
      continue;
    }

    const baseline = typeof file.content === "string" ? file.content : "";
    if (baseline === editedContent) {
      continue;
    }
    try {
      const { ops, stats } = diffLines(baseline, editedContent);
      files.push({ path, status: "modified", isBinary: false, ops, stats });
    } catch {
      files.push({ path, status: "modified", isBinary: true, ops: [], stats: zeroStats() });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  const totals = files.reduce<DiffStats>(
    (acc, f) => ({
      added: acc.added + f.stats.added,
      removed: acc.removed + f.stats.removed,
      context: acc.context + f.stats.context,
    }),
    zeroStats(),
  );
  return { files, totals, changedCount: files.length };
}

function isLikelyBinary(path: string): boolean {
  const ext = getFileExtension(path);
  if (TEXTUAL_EXTENSIONS.has(ext)) return false;
  // Fail closed: attempting a line diff on arbitrary bytes can corrupt content.
  return true;
}

function zeroStats(): DiffStats {
  return { added: 0, removed: 0, context: 0 };
}
