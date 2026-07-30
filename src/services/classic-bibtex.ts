import { activeFileEntries, type LogEntry, type Project } from "@/domain";
import { dirname } from "./path-utils";

export interface ClassicBibtexOutput {
  path: string;
  content: string;
  log: LogEntry[];
}

interface SourceFile {
  path: string;
  content: string;
}

interface BibEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
  order: number;
}

const BIBLIOGRAPHY_RE = /\\bibliography\s*\{([^}]*)\}/g;
const CITE_RE =
  /\\(?:cite|citep|citet|citealp|citeauthor|citeyear|nocite)(?:\s*\[[^\]]*]){0,2}\s*\{([^}]*)\}/g;

export function generateClassicBibtexBbl(
  project: Project,
  edits: Record<string, string> | undefined,
): ClassicBibtexOutput | null {
  const entry = effectiveFile(project, project.entry, edits);
  if (!entry) return null;

  const databases = bibliographyDatabases(entry.content);
  if (databases.length === 0) return null;

  const bblPath = `${stripExtension(project.entry)}.bbl`;
  if (effectiveFile(project, bblPath, edits)) return null;

  const texFiles = activeFileEntries(project)
    .map(([, file]) => file)
    .filter((file) => file.kind === "tex" || file.kind === "sty")
    .map((file) => {
      const original = file.content;
      const text = edits?.[file.path] ?? (typeof original === "string" ? original : "");
      return { path: file.path, content: text };
    });
  const citations = collectCitationKeys(texFiles);
  const bibFiles = resolveBibFiles(project, edits, databases);
  const parsedEntries = bibFiles.flatMap((file) => parseBibEntries(file.content));
  const selectedEntries = selectEntries(parsedEntries, citations.keys, citations.includeAll);

  const log: LogEntry[] = [];
  for (const db of databases) {
    if (!bibFiles.some((file) => sameBibName(file.path, db, dirname(project.entry)))) {
      log.push({
        level: "warn",
        filePath: project.entry,
        line: lineOf(entry.content, /\\bibliography\s*\{/),
        message: `BibTeX database '${db}' was not found; generated bibliography may be incomplete.`,
      });
    }
  }

  for (const key of citations.keys) {
    if (!parsedEntries.some((entry) => entry.key === key)) {
      log.push({
        level: "warn",
        filePath: project.entry,
        message: `Citation '${key}' was not found in the available .bib files.`,
      });
    }
  }

  if (bibFiles.length > 0) {
    log.push({
      level: "info",
      filePath: project.entry,
      line: lineOf(entry.content, /\\bibliography\s*\{/),
      message: `Generated ${bblPath} from ${bibFiles.map((file) => file.path).join(", ")} serverlessly.`,
    });
  }

  return {
    path: bblPath,
    content: renderBbl(selectedEntries),
    log,
  };
}

export function parseBibEntries(content: string): BibEntry[] {
  const entries: BibEntry[] = [];
  let pos = 0;
  while (pos < content.length) {
    const at = content.indexOf("@", pos);
    if (at === -1) break;
    const typeStart = at + 1;
    const open = findNext(content, typeStart, ["{", "("]);
    if (!open) break;
    const type = content.slice(typeStart, open.index).trim().toLowerCase();
    const closeIndex = findBalancedClose(content, open.index, open.char);
    if (closeIndex === -1) break;

    const body = content.slice(open.index + 1, closeIndex);
    if (type && !["comment", "preamble", "string"].includes(type)) {
      const entry = parseBibEntryBody(type, body, entries.length);
      if (entry) entries.push(entry);
    }
    pos = closeIndex + 1;
  }
  return entries;
}

function bibliographyDatabases(content: string): string[] {
  const names: string[] = [];
  for (const match of content.matchAll(BIBLIOGRAPHY_RE)) {
    for (const rawName of match[1]!.split(",")) {
      const name = rawName.trim();
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

function collectCitationKeys(files: SourceFile[]): { keys: string[]; includeAll: boolean } {
  const keys: string[] = [];
  let includeAll = false;
  for (const file of files) {
    for (const match of file.content.matchAll(CITE_RE)) {
      for (const rawKey of match[1]!.split(",")) {
        const key = rawKey.trim();
        if (!key) continue;
        if (key === "*") {
          includeAll = true;
          continue;
        }
        if (!keys.includes(key)) keys.push(key);
      }
    }
  }
  return { keys, includeAll };
}

function resolveBibFiles(
  project: Project,
  edits: Record<string, string> | undefined,
  databases: string[],
): SourceFile[] {
  const entryDir = dirname(project.entry);
  const out: SourceFile[] = [];
  for (const db of databases) {
    const candidates = bibCandidates(db, entryDir);
    const path = candidates.find((candidate) => effectiveFile(project, candidate, edits));
    if (!path || out.some((file) => file.path === path)) continue;
    const file = effectiveFile(project, path, edits);
    if (file) out.push(file);
  }
  return out;
}

function parseBibEntryBody(type: string, body: string, order: number): BibEntry | null {
  const comma = body.indexOf(",");
  if (comma === -1) return null;
  const key = body.slice(0, comma).trim();
  if (!key) return null;
  return {
    type,
    key,
    fields: parseBibFields(body.slice(comma + 1)),
    order,
  };
}

function parseBibFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let pos = 0;
  while (pos < body.length) {
    pos = skipSeparators(body, pos);
    const nameStart = pos;
    while (pos < body.length && /[A-Za-z0-9_-]/.test(body[pos]!)) pos++;
    const name = body.slice(nameStart, pos).trim().toLowerCase();
    pos = skipWhitespace(body, pos);
    if (!name || body[pos] !== "=") break;
    pos++;
    const parsed = parseBibValue(body, pos);
    fields[name] = cleanBibValue(parsed.value);
    pos = parsed.next;
  }
  return fields;
}

function parseBibValue(body: string, start: number): { value: string; next: number } {
  const values: string[] = [];
  let pos = start;
  for (;;) {
    pos = skipWhitespace(body, pos);
    const token = parseBibValueToken(body, pos);
    values.push(token.value);
    pos = skipWhitespace(body, token.next);
    if (body[pos] !== "#") break;
    pos++;
  }
  while (pos < body.length && body[pos] !== ",") pos++;
  if (body[pos] === ",") pos++;
  return { value: values.join(""), next: pos };
}

function parseBibValueToken(body: string, start: number): { value: string; next: number } {
  const first = body[start];
  if (first === "{") {
    const close = findBalancedClose(body, start, "{");
    if (close === -1) return { value: body.slice(start + 1), next: body.length };
    return { value: body.slice(start + 1, close), next: close + 1 };
  }
  if (first === '"') {
    let pos = start + 1;
    let depth = 0;
    while (pos < body.length) {
      const ch = body[pos]!;
      if (ch === "{" && body[pos - 1] !== "\\") depth++;
      else if (ch === "}" && body[pos - 1] !== "\\" && depth > 0) depth--;
      else if (ch === '"' && body[pos - 1] !== "\\" && depth === 0) break;
      pos++;
    }
    return { value: body.slice(start + 1, pos), next: Math.min(pos + 1, body.length) };
  }
  let pos = start;
  while (pos < body.length && ![",", "#", "\n", "\r"].includes(body[pos]!)) pos++;
  return { value: body.slice(start, pos).trim(), next: pos };
}

function selectEntries(
  entries: BibEntry[],
  citationKeys: string[],
  includeAll: boolean,
): BibEntry[] {
  if (includeAll || citationKeys.length === 0)
    return [...entries].sort((a, b) => a.order - b.order);
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  return citationKeys.flatMap((key) => {
    const entry = byKey.get(key);
    return entry ? [entry] : [];
  });
}

function renderBbl(entries: BibEntry[]): string {
  const width = Math.max(1, entries.length).toString();
  const items = entries.map(renderBibItem).join("\n\n");
  return `\\begin{thebibliography}{${width}}\n${items}${items ? "\n" : ""}\\end{thebibliography}\n`;
}

function renderBibItem(entry: BibEntry): string {
  const fields = entry.fields;
  const chunks = [
    sentence(fields.author ?? fields.editor),
    titleChunk(entry),
    publicationChunk(entry),
    sentence(fields.note),
    urlChunk(fields.url ?? fields.doi),
  ].filter(Boolean);
  return `\\bibitem{${entry.key}}\n${chunks.join("\n\\newblock ") || sentence(entry.key)}`;
}

function titleChunk(entry: BibEntry): string {
  const title = entry.fields.title;
  if (!title) return "";
  if (entry.type === "book" || entry.type === "manual") return sentence(`\\emph{${title}}`);
  return sentence(title);
}

function publicationChunk(entry: BibEntry): string {
  const f = entry.fields;
  const chunks: string[] = [];
  if (entry.type === "article") {
    if (f.journal) chunks.push(`\\emph{${f.journal}}`);
    if (f.volume) chunks.push(f.number ? `${f.volume}(${f.number})` : f.volume);
    if (f.pages) chunks.push(f.pages);
  } else if (entry.type === "book") {
    if (f.publisher) chunks.push(f.publisher);
    if (f.address) chunks.push(f.address);
  } else {
    if (f.booktitle) chunks.push(`In \\emph{${f.booktitle}}`);
    if (f.publisher) chunks.push(f.publisher);
    if (f.howpublished) chunks.push(f.howpublished);
    if (f.pages) chunks.push(f.pages);
  }
  if (f.year) chunks.push(f.year);
  return sentence(chunks.join(", "));
}

function urlChunk(value: string | undefined): string {
  if (!value) return "";
  return sentence(`\\texttt{${value}}`);
}

function sentence(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function cleanBibValue(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[{}]/g, "")
    .replace(/~/g, " ")
    .trim();
}

function effectiveFile(
  project: Project,
  path: string,
  edits: Record<string, string> | undefined,
): SourceFile | null {
  const file = project.files[path];
  if (file?.deletedAt) return null;
  if (!file && edits?.[path] === undefined) return null;
  const original = file?.content;
  const text = edits?.[path] ?? (typeof original === "string" ? original : "");
  return { path, content: text };
}

function bibCandidates(name: string, entryDir: string): string[] {
  const base = name.endsWith(".bib") ? name : `${name}.bib`;
  const candidates = [base];
  if (entryDir && !base.includes("/")) candidates.push(`${entryDir}/${base}`);
  return candidates;
}

function sameBibName(path: string, db: string, entryDir: string): boolean {
  return bibCandidates(db, entryDir).includes(path);
}

function findNext(
  text: string,
  start: number,
  chars: readonly string[],
): { index: number; char: string } | null {
  let best: { index: number; char: string } | null = null;
  for (const char of chars) {
    const index = text.indexOf(char, start);
    if (index !== -1 && (!best || index < best.index)) best = { index, char };
  }
  return best;
}

function findBalancedClose(text: string, openIndex: number, openChar: string): number {
  const closeChar = openChar === "{" ? "}" : ")";
  let depth = 0;
  for (let pos = openIndex; pos < text.length; pos++) {
    const ch = text[pos]!;
    if (ch === openChar && text[pos - 1] !== "\\") depth++;
    if (ch === closeChar && text[pos - 1] !== "\\") {
      depth--;
      if (depth === 0) return pos;
    }
  }
  return -1;
}

function skipWhitespace(text: string, pos: number): number {
  while (pos < text.length && /\s/.test(text[pos]!)) pos++;
  return pos;
}

function skipSeparators(text: string, pos: number): number {
  while (pos < text.length && (/\s/.test(text[pos]!) || text[pos] === ",")) pos++;
  return pos;
}

function stripExtension(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? path : path.slice(0, i);
}

function lineOf(content: string, pattern: RegExp): number {
  const match = pattern.exec(content);
  if (!match) return 1;
  return content.slice(0, match.index).split("\n").length;
}
