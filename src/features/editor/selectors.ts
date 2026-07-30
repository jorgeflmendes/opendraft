import { isTextContent } from "@/domain";
import { useProjectsStore } from "@/features/projects/useProjectsStore";
import { useTabsStore } from "./useTabsStore";

/**
 * Hooks that cross the tabs <-> projects boundary. Co-located here
 * so the stores themselves stay independent (and individually
 * testable), and so consumers get a stable, narrow API.
 *
 * FileNode.content can be a Uint8Array now. These hooks
 * surface only the textual variant; binary files (images, PDFs)
 * return undefined / never appear in `useDirtyPaths`. The editor
 * never opens a binary file as a tab, so a non-text content here
 * means "no editable view available".
 */

/** Effective content for `path` - the in-memory edit if one exists,
 *  otherwise the project's original text. Undefined when neither
 *  exists (no active project, path missing, or the file is binary). */
export function useFileContent(path: string | null): string | undefined {
  const edit = useTabsStore((s) => (path ? s.edits[path] : undefined));
  const original = useProjectsStore((s) => {
    if (!path) return undefined;
    const content = s.active?.files[path]?.content;
    if (content === undefined) return undefined;
    return isTextContent(content) ? content : undefined;
  });
  return edit ?? original;
}

/** True when `path` has an edit entry that diverges from the
 *  project's original text. Binary files are never dirty. */
export function useFileDirty(path: string | null): boolean {
  const edit = useTabsStore((s) => (path ? s.edits[path] : undefined));
  const original = useProjectsStore((s) => {
    if (!path) return undefined;
    const content = s.active?.files[path]?.content;
    return content !== undefined && isTextContent(content) ? content : undefined;
  });
  return edit !== undefined && edit !== original;
}

/** Set of dirty paths across the whole project. Recomputed when
 *  either edits or the project change - both Zustand subs are
 *  shallow, so callers re-render only on actual flips. Binary
 *  files never appear here since tabs.edits only holds strings. */
export function useDirtyPaths(): readonly string[] {
  const edits = useTabsStore((s) => s.edits);
  const files = useProjectsStore((s) => s.active?.files);
  if (!files) return EMPTY;
  return Object.keys(edits).filter((p) => {
    const original = files[p]?.content;
    if (original === undefined || !isTextContent(original)) return false;
    return edits[p] !== original;
  });
}
const EMPTY: readonly string[] = Object.freeze([]);
