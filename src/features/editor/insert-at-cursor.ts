// text-at-cursor splicer.
//
// Used by the bibliography browser to drop `\cite{key}` at the
// editor's current cursor without reaching into CodeMirror's
// imperative API. The active line/col is captured in the editor
// screen's cursorRef (set by EditorBody's onCursorChange); we
// convert to a byte offset against the current content and
// return the spliced string for the caller to push through
// `useTabsStore.updateContent(path, next)`.
//
// `line` is 1-based; `col` is 1-based and counts code units
// (matches CodeMirror's column convention).

export function offsetFromLineCol(content: string, line: number, col: number): number {
  let cursor = 0;
  let l = 1;
  while (cursor < content.length && l < line) {
    const nl = content.indexOf("\n", cursor);
    if (nl === -1) {
      // Past the last line - clamp to end of content.
      return content.length;
    }
    cursor = nl + 1;
    l++;
  }
  // Clamp col to the end of the current line so an over-long
  // column doesn't run into the next line's text.
  const lineEnd = content.indexOf("\n", cursor);
  const max = lineEnd === -1 ? content.length : lineEnd;
  return Math.min(cursor + Math.max(0, col - 1), max);
}

export function insertAtCursor(
  content: string,
  line: number,
  col: number,
  insert: string,
): { next: string; insertedAt: number } {
  const at = offsetFromLineCol(content, line, col);
  return { next: content.slice(0, at) + insert + content.slice(at), insertedAt: at };
}
