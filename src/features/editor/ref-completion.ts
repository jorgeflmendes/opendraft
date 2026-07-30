import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { useLabelStore } from "./useLabelStore";

// \ref autocomplete.
//
// Sister to cite-completion: detects whether the cursor is inside
// a referencing command's brace argument and returns matching
// labels from the project-wide \label{} index. Supports the
// classic family (\ref, \pageref, \eqref) plus cleveref's
// \cref / \Cref / \autoref / \nameref.
//
// Only one key per ref command in practice, but cleveref's \cref
// accepts a comma-separated list (\cref{eq:a,eq:b}), so we
// behave like cite-completion and only complete the chunk after
// the last comma.

const REF_RE =
  /\\(?:ref|pageref|eqref|autoref|nameref|cref|Cref|crefrange|labelcref)\*?\s*\{([^}]*)$/;

interface ParsedRefContext {
  inside: string;
  cursor: number;
}

/** Pure parser exposed for tests. Returns null when the cursor
 *  isn't inside a recognised ref command. */
export function parseRefContext(textBeforeCursor: string): ParsedRefContext | null {
  const m = REF_RE.exec(textBeforeCursor);
  if (!m) return null;
  return { inside: m[1] ?? "", cursor: textBeforeCursor.length };
}

export function refCompletionSource(context: CompletionContext): CompletionResult | null {
  const before = context.state.sliceDoc(0, context.pos);
  const ref = parseRefContext(before);
  if (!ref) return null;

  const lastComma = ref.inside.lastIndexOf(",");
  const chunkStart = lastComma === -1 ? 0 : lastComma + 1;
  const rawPrefix = ref.inside.slice(chunkStart);
  const prefix = rawPrefix.replace(/^\s+/, "");
  const leadingWhitespace = rawPrefix.length - prefix.length;
  const openBracePos = ref.cursor - ref.inside.length - 1;
  const fromPos = openBracePos + 1 + chunkStart + leadingWhitespace;
  const toPos = ref.cursor;

  const labels = useLabelStore.getState().labels;
  if (labels.length === 0) return null;
  const lcPrefix = prefix.toLowerCase();
  // De-duplicate labels by key (a label declared twice - usually
  // a mistake - would otherwise appear twice in the popup).
  const seen = new Set<string>();
  const options: Completion[] = [];
  for (const label of labels) {
    if (seen.has(label.key)) continue;
    if (lcPrefix && !label.key.toLowerCase().includes(lcPrefix)) continue;
    seen.add(label.key);
    options.push({
      label: label.key,
      detail: label.path,
      info: `${label.path}:${label.line}`,
      type: "variable",
      apply: label.key,
    });
    if (options.length >= 50) break;
  }
  if (options.length === 0) return null;
  return {
    from: fromPos,
    to: toPos,
    options,
    validFor: /^[A-Za-z0-9:_\-/.]*$/,
  };
}
