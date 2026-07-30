import { foldService, foldGutter } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";

const BEGIN_RE = /\\begin\{([^}]+)\}/g;
const END_RE = /\\end\{([^}]+)\}/g;
const MAX_SCAN_LINES = 500;

export const latexFoldService = foldService.of((state: EditorState, lineStart: number) => {
  const line = state.doc.lineAt(lineStart);
  const text = line.text;

  BEGIN_RE.lastIndex = 0;
  const beginMatch = BEGIN_RE.exec(text);
  if (!beginMatch) return null;

  const envName = beginMatch[1];
  if (!envName) return null;

  const startPos = line.from + beginMatch.index + beginMatch[0].length;

  // Nesting depth matters for environments containing another environment of
  // the same name.
  let depth = 1;
  let endPos: number | null = null;

  const maxScanLines = Math.min(line.number + MAX_SCAN_LINES, state.doc.lines);

  for (let i = line.number; i <= maxScanLines; i++) {
    const scanLine = i === line.number ? line : state.doc.line(i);
    const scanText =
      i === line.number ? text.slice(beginMatch.index + beginMatch[0].length) : scanLine.text;
    const offset = i === line.number ? beginMatch.index + beginMatch[0].length : 0;

    let m;

    const tokens: { type: "begin" | "end"; name: string; pos: number }[] = [];

    BEGIN_RE.lastIndex = 0;
    while ((m = BEGIN_RE.exec(scanText)) !== null) {
      if (m[1]) {
        tokens.push({
          type: "begin",
          name: m[1],
          pos: scanLine.from + offset + m.index + m[0].length,
        });
      }
    }

    END_RE.lastIndex = 0;
    while ((m = END_RE.exec(scanText)) !== null) {
      if (m[1]) {
        tokens.push({ type: "end", name: m[1], pos: scanLine.from + offset + m.index });
      }
    }

    tokens.sort((a, b) => a.pos - b.pos);

    for (const token of tokens) {
      if (token.name === envName) {
        if (token.type === "begin") {
          depth++;
        } else {
          depth--;
          if (depth === 0) {
            endPos = token.pos;
            break;
          }
        }
      }
    }

    if (endPos !== null) {
      break;
    }
  }

  if (endPos !== null && endPos > startPos) {
    return { from: startPos, to: endPos };
  }

  return null;
});

export function latexFoldingExtension(): Extension[] {
  return [latexFoldService, foldGutter()];
}
