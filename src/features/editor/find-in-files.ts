import { activeFileEntries, type Project } from "@/domain";

export interface FindHit {
  line: number;
  text: string;
  columnStart: number;
  columnEnd: number;
}

export interface FindFileResult {
  path: string;
  hits: FindHit[];
}

export interface FindOptions {
  /** Invalid regular expressions fall back to literal search while typing. */
  regex?: boolean;
  caseInsensitive?: boolean;
  /** Unsaved content overlay, keyed by project-relative path. */
  edits?: Record<string, string>;
  /** Global result cap that bounds work and rendered rows. */
  maxHits?: number;
}

const TEXT_LIKE_KINDS = new Set(["tex", "bib", "sty", "md", "txt", "yml"]);

const DEFAULT_MAX_HITS = 500;

/** Search active text files and return only matching files in path order. */
export function findInProject(
  project: Project,
  query: string,
  options: FindOptions = {},
): FindFileResult[] {
  if (query.length === 0) return [];
  const { regex = false, caseInsensitive = true, edits, maxHits = DEFAULT_MAX_HITS } = options;
  const matcher = buildMatcher(query, regex, caseInsensitive);
  if (!matcher) return [];

  const paths = activeFileEntries(project)
    .map(([path]) => path)
    .sort();
  const out: FindFileResult[] = [];
  let totalHits = 0;
  for (const path of paths) {
    if (totalHits >= maxHits) break;
    const file = project.files[path]!;
    if (!TEXT_LIKE_KINDS.has(file.kind)) continue;
    const source = edits?.[path] ?? file.content;
    if (typeof source !== "string" || source.length === 0) continue;
    const hits: FindHit[] = [];
    let lineStart = 0;
    let lineNumber = 1;
    while (lineStart <= source.length) {
      const newline = source.indexOf("\n", lineStart);
      const lineEnd = newline === -1 ? source.length : newline;
      const rawLine = source.slice(lineStart, lineEnd);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      for (const range of matcher(line)) {
        hits.push({
          line: lineNumber,
          text: line,
          columnStart: range.start,
          columnEnd: range.end,
        });
        totalHits++;
        if (totalHits >= maxHits) break;
      }
      if (totalHits >= maxHits) break;
      if (newline === -1) break;
      lineStart = newline + 1;
      lineNumber++;
    }
    if (hits.length > 0) out.push({ path, hits });
  }
  return out;
}

export function replaceInString(
  source: string,
  query: string,
  replacement: string,
  options: FindOptions = {},
): string {
  if (query.length === 0) return source;
  const { regex = false, caseInsensitive = true } = options;

  if (regex) {
    try {
      const flags = caseInsensitive ? "gim" : "gm";
      const re = new RegExp(query, flags);
      return source.replace(re, replacement);
    } catch {
      // A half-typed expression remains usable as a literal query.
    }
  }

  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escapeRegex(query), caseInsensitive ? "gi" : "g");
  return source.replace(re, replacement);
}

interface Range {
  start: number;
  end: number;
}

type LineMatcher = (line: string) => Range[];

function buildMatcher(query: string, regex: boolean, caseInsensitive: boolean): LineMatcher | null {
  if (regex) {
    try {
      const flags = caseInsensitive ? "gi" : "g";
      const re = new RegExp(query, flags);
      return (line) => {
        const ranges: Range[] = [];
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        // RegExp.exec does not advance after a zero-width match.
        while ((m = re.exec(line)) !== null) {
          const end = m.index + m[0].length;
          ranges.push({ start: m.index, end });
          if (m[0].length === 0) re.lastIndex++;
        }
        return ranges;
      };
    } catch {
      // Fall through to literal mode while the user is still typing.
    }
  }
  const needle = caseInsensitive ? query.toLowerCase() : query;
  return (line) => {
    const haystack = caseInsensitive ? line.toLowerCase() : line;
    const ranges: Range[] = [];
    let from = 0;
    let idx = haystack.indexOf(needle, from);
    while (idx !== -1) {
      ranges.push({ start: idx, end: idx + needle.length });
      from = idx + Math.max(1, needle.length);
      idx = haystack.indexOf(needle, from);
    }
    return ranges;
  };
}
