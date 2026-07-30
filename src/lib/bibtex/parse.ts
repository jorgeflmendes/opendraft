// Forgiving BibTeX parser for editor features. It preserves recognizable
// entries from imperfect files, resolves @string values, and ignores
// formatter-only @preamble/@comment blocks.

export interface BibEntry {
  /** Lowercase entry type without the leading `@`. */
  type: string;
  /** Case-sensitive citation key. */
  key: string;
  /** Field map: lowercased name -> unwrapped value with
   *  surrounding braces/quotes already stripped and embedded
   *  whitespace collapsed. */
  fields: Record<string, string>;
  /** 1-based source line of the entry opener. */
  line: number;
}

/** Parse a .bib source string. Returns every recognisable entry
 *  in source order. Malformed entries are skipped silently. */
export function parseBib(source: string): BibEntry[] {
  const reader = new Reader(source);
  const strings: Record<string, string> = {};
  const entries: BibEntry[] = [];
  while (reader.skipUntilAt()) {
    reader.next(); // consume '@'
    const start = reader.cursor;
    const type = reader.readIdentifier().toLowerCase();
    reader.skipWhitespace();
    if (reader.peek() !== "{" && reader.peek() !== "(") {
      // Malformed - advance past the bad header and resume.
      continue;
    }
    const closer = reader.next() === "{" ? "}" : ")";
    reader.skipWhitespace();
    if (type === "preamble" || type === "comment") {
      reader.skipBracedBlock(closer);
      continue;
    }
    if (type === "string") {
      const name = reader.readIdentifier().toLowerCase();
      reader.skipWhitespace();
      if (reader.peek() !== "=") {
        reader.skipBracedBlock(closer);
        continue;
      }
      reader.next();
      reader.skipWhitespace();
      const value = reader.readFieldValue(strings);
      strings[name] = value;
      reader.skipUntil(closer);
      reader.next(); // consume closer
      continue;
    }
    // The cite key runs until either a comma (followed by fields)
    // or the entry closer. Thread the *actual* closer so paren-
    // delimited entries pick up `)` not `}`.
    const key = reader.readUntilDelimiter("," + closer);
    if (!key) {
      reader.skipBracedBlock(closer);
      continue;
    }
    const fields: Record<string, string> = {};
    if (reader.peek() === ",") {
      reader.next();
      reader.skipWhitespace();
      while (reader.peek() !== closer && !reader.eof()) {
        const fieldName = reader.readIdentifier().toLowerCase();
        if (!fieldName) {
          reader.skipBracedBlock(closer);
          break;
        }
        reader.skipWhitespace();
        if (reader.peek() !== "=") {
          reader.skipBracedBlock(closer);
          break;
        }
        reader.next();
        reader.skipWhitespace();
        const value = reader.readFieldValue(strings);
        fields[fieldName] = value;
        reader.skipWhitespace();
        if (reader.peek() === ",") {
          reader.next();
          reader.skipWhitespace();
        } else {
          // Trailing field without comma - perfectly legal.
          break;
        }
      }
    }
    if (reader.peek() === closer) reader.next();
    entries.push({ type, key: key.trim(), fields, line: reader.lineOf(start) });
  }
  return entries;
}

/** Convenience: convert a parsed entry to a single-line summary
 *  for autocomplete and the browser list. Falls back to the cite
 *  key when no title is set. */
export function bibEntrySummary(entry: BibEntry): string {
  const title = entry.fields.title?.trim();
  const author = entry.fields.author?.trim();
  const year = entry.fields.year?.trim();
  const parts: string[] = [];
  if (title) parts.push(title);
  if (author) parts.push(`- ${shortAuthor(author)}`);
  if (year) parts.push(`(${year})`);
  return parts.length > 0 ? parts.join(" ") : entry.key;
}

/** Shorten a BibTeX author list to "Foo et al." style for one-
 *  line displays. Keeps the first author's surname when possible. */
function shortAuthor(raw: string): string {
  const first = raw.split(/\s+and\s+/i)[0]!.trim();
  // Surname-first form: "Last, First M."
  if (first.includes(",")) {
    const surname = first.split(",")[0]!.trim();
    return raw.includes(" and ") ? `${surname} et al.` : surname;
  }
  // First-last form: pick the last token as surname.
  const tokens = first.split(/\s+/);
  const surname = tokens[tokens.length - 1] ?? first;
  return raw.includes(" and ") ? `${surname} et al.` : surname;
}

// -- Reader -----------------------------------------------------

class Reader {
  cursor = 0;
  constructor(private readonly src: string) {}
  eof(): boolean {
    return this.cursor >= this.src.length;
  }
  peek(offset = 0): string {
    return this.src[this.cursor + offset] ?? "";
  }
  next(): string {
    return this.src[this.cursor++] ?? "";
  }
  skipWhitespace(): void {
    while (!this.eof() && /\s/.test(this.peek())) this.cursor++;
  }
  /** Advance until the next `@` outside a comment line. Returns
   *  true when found, false at EOF. */
  skipUntilAt(): boolean {
    while (!this.eof()) {
      const ch = this.peek();
      if (ch === "@") return true;
      // BibTeX has no formal comment syntax; everything outside
      // entries is ignored. We just walk forward.
      this.cursor++;
    }
    return false;
  }
  skipUntil(...chars: string[]): void {
    const set = new Set(chars);
    while (!this.eof() && !set.has(this.peek())) this.cursor++;
  }
  /** Skip past a malformed entry: walk until a balanced close
   *  brace appears, tracking nesting so embedded braces don't
   *  trip us up. */
  skipBracedBlock(closer: string): void {
    let depth = 1;
    while (!this.eof() && depth > 0) {
      const ch = this.next();
      if (ch === "{") depth++;
      else if (ch === closer || (closer === ")" && ch === ")")) depth--;
    }
  }
  readIdentifier(): string {
    const start = this.cursor;
    while (!this.eof()) {
      const ch = this.peek();
      // BibTeX cite keys + field names use a wide character set.
      // We accept anything that isn't whitespace, `=`, `,`, `{`,
      // `}`, `(`, `)`, `"`, or `@`. Both brace styles stop the
      // scan so paren-delimited entries' types/keys read cleanly.
      if (/[\s=,(){}"@]/.test(ch)) break;
      this.cursor++;
    }
    return this.src.slice(start, this.cursor);
  }
  readUntilDelimiter(delims: string): string {
    const start = this.cursor;
    while (!this.eof()) {
      const ch = this.peek();
      if (delims.includes(ch)) break;
      this.cursor++;
    }
    return this.src.slice(start, this.cursor);
  }
  /** Parse one field value: a brace-delimited block, a
   *  quote-delimited string, a number, or a @string-table
   *  identifier. Concatenation with `#` is supported. */
  readFieldValue(strings: Record<string, string>): string {
    const pieces: string[] = [];
    while (!this.eof()) {
      this.skipWhitespace();
      const ch = this.peek();
      if (ch === "{") {
        this.next();
        pieces.push(this.readBraced());
      } else if (ch === '"') {
        this.next();
        pieces.push(this.readQuoted());
      } else if (/\d/.test(ch)) {
        const start = this.cursor;
        while (!this.eof() && /\d/.test(this.peek())) this.cursor++;
        pieces.push(this.src.slice(start, this.cursor));
      } else if (/[A-Za-z_]/.test(ch)) {
        const name = this.readIdentifier().toLowerCase();
        pieces.push(strings[name] ?? name);
      } else {
        break;
      }
      this.skipWhitespace();
      if (this.peek() === "#") {
        this.next();
        continue;
      }
      break;
    }
    return collapseWhitespace(pieces.join(""));
  }
  readBraced(): string {
    let depth = 1;
    const start = this.cursor;
    while (!this.eof() && depth > 0) {
      const ch = this.peek();
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) break;
      }
      this.cursor++;
    }
    const body = this.src.slice(start, this.cursor);
    if (this.peek() === "}") this.next();
    return body;
  }
  readQuoted(): string {
    // BibTeX quote-delimited values can contain { } balanced
    // groups; an inner `"` inside braces is allowed.
    let depth = 0;
    const start = this.cursor;
    while (!this.eof()) {
      const ch = this.peek();
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === '"' && depth === 0) break;
      this.cursor++;
    }
    const body = this.src.slice(start, this.cursor);
    if (this.peek() === '"') this.next();
    return body;
  }
  lineOf(index: number): number {
    let line = 1;
    for (let i = 0; i < index && i < this.src.length; i++) {
      if (this.src[i] === "\n") line++;
    }
    return line;
  }
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
