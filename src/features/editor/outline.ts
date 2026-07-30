// A line-oriented outline is sufficient for section declarations and avoids
// pretending to implement TeX parsing. Depth follows command semantics, not
// observed nesting.

export type OutlineKind =
  "part" | "chapter" | "section" | "subsection" | "subsubsection" | "paragraph" | "subparagraph";

export interface OutlineNode {
  kind: OutlineKind;
  depth: number;
  title: string;
  line: number;
  starred: boolean;
}

const KIND_DEPTH: Record<OutlineKind, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};

// Capture the rendered title while ignoring the optional short-title argument.
const SECTIONING_RE =
  /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*(?:\[[^\]]*])?\s*\{([^}]*)\}/;

export function parseOutline(source: string): OutlineNode[] {
  const out: OutlineNode[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (isCommentLine(raw)) continue;
    const match = SECTIONING_RE.exec(raw);
    if (!match) continue;
    const kind = match[1] as OutlineKind;
    const starred = match[2] === "*";
    const title = match[3]!.trim();
    out.push({
      kind,
      starred,
      depth: KIND_DEPTH[kind],
      title,
      line: i + 1,
    });
  }
  return out;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.replace(/^\s+/, "");
  return trimmed.startsWith("%");
}
