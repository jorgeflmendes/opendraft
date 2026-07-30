import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { bibEntrySummary } from "@/lib/bibtex/parse";
import { useBibStore } from "./useBibStore";

// Anchoring after the opening brace ensures completion only runs inside a
// supported citation argument, including comma-separated key lists.
const CITE_RE =
  /\\(?:cite|citep|citet|citealp|citealt|citeauthor|citeyear|nocite|parencite|textcite|autocite|fullcite|smartcite|citeyearpar|citetitle)\*?\s*\{([^}]*)$/;

interface ParsedCiteContext {
  inside: string;
  start: number;
  cursor: number;
}

export function parseCiteContext(textBeforeCursor: string): ParsedCiteContext | null {
  const m = CITE_RE.exec(textBeforeCursor);
  if (!m) return null;
  return {
    inside: m[1] ?? "",
    start: m.index,
    cursor: textBeforeCursor.length,
  };
}

export function citeCompletionSource(context: CompletionContext): CompletionResult | null {
  const before = context.state.sliceDoc(0, context.pos);
  const cite = parseCiteContext(before);
  if (!cite) return null;
  // Replace only the current key in a comma-separated citation list.
  const lastComma = cite.inside.lastIndexOf(",");
  const chunkStart = lastComma === -1 ? 0 : lastComma + 1;
  const rawPrefix = cite.inside.slice(chunkStart);
  const prefix = rawPrefix.replace(/^\s+/, "");
  const leadingWhitespace = rawPrefix.length - prefix.length;
  const openBracePos = cite.cursor - cite.inside.length - 1;
  const fromPos = openBracePos + 1 + chunkStart + leadingWhitespace;
  const toPos = cite.cursor;

  const entries = useBibStore.getState().entries;
  if (entries.length === 0) return null;
  const lcPrefix = prefix.toLowerCase();
  const options: Completion[] = [];
  for (const entry of entries) {
    if (lcPrefix && !entry.key.toLowerCase().includes(lcPrefix)) continue;
    options.push({
      label: entry.key,
      detail: entry.type,
      info: bibEntrySummary(entry),
      type: "variable",
      apply: entry.key,
    });
    if (options.length >= 50) break;
  }
  if (options.length === 0) return null;
  return {
    from: fromPos,
    to: toPos,
    options,
    validFor: /^[A-Za-z0-9:_\-/]*$/,
  };
}
