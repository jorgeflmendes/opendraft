import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { useProjectsStore } from "@/features/projects/useProjectsStore";

const FILE_CMD_RE = /\\(?:includegraphics|input|include|bibliography)(?:\[[^\]]*\])?\s*\{([^}]*)$/;

interface ParsedFileContext {
  /** The prefix typed so far. */
  inside: string;
  /** Source offset where the matched command starts (for `from`). */
  start: number;
  /** Source offset where the cursor sits (for `to`). */
  cursor: number;
}

export function parseFileContext(textBeforeCursor: string): ParsedFileContext | null {
  const m = FILE_CMD_RE.exec(textBeforeCursor);
  if (!m) return null;
  return {
    inside: m[1] ?? "",
    start: m.index,
    cursor: textBeforeCursor.length,
  };
}

export function fileCompletionSource(context: CompletionContext): CompletionResult | null {
  const before = context.state.sliceDoc(0, context.pos);
  const fileCtx = parseFileContext(before);
  if (!fileCtx) return null;

  const rawPrefix = fileCtx.inside;
  const prefix = rawPrefix.replace(/^\s+/, "");
  const leadingWhitespace = rawPrefix.length - prefix.length;

  const openBracePos = fileCtx.cursor - fileCtx.inside.length - 1;
  const fromPos = openBracePos + 1 + leadingWhitespace;
  const toPos = fileCtx.cursor;

  const activeProject = useProjectsStore.getState().active;
  if (!activeProject) return null;

  const lcPrefix = prefix.toLowerCase();
  const options: Completion[] = [];

  for (const path of Object.keys(activeProject.files)) {
    if (lcPrefix && !path.toLowerCase().includes(lcPrefix)) continue;

    const ext = path.split(".").pop() || "";
    let type = "text";
    let detail = "file";

    if (["png", "jpg", "jpeg", "pdf", "eps", "svg"].includes(ext)) {
      type = "variable";
      detail = "image";
    } else if (ext === "tex") {
      type = "keyword";
      detail = "tex";
    } else if (ext === "bib") {
      type = "namespace";
      detail = "bib";
    }

    options.push({
      label: path,
      detail,
      type,
      apply: path,
    });

    if (options.length >= 50) break;
  }

  if (options.length === 0) return null;

  return {
    from: fromPos,
    to: toPos,
    options,
    validFor: /^[a-zA-Z0-9_./-]*$/,
  };
}
