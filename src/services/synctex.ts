// Parse the subset of SyncTeX required for source/PDF navigation: input tags,
// page boundaries, and box/glyph geometry. Unsupported hierarchy details are
// intentionally ignored.
//
// Coordinate system: SyncTeX records everything in scaled points
// (sp). 65 536 sp = 1 pt; 72.27 pt = 1 in; 72 pt = 1 PDF user-space
// unit. We convert sp -> pt at parse time and let consumers do the
// final px scaling so the parser stays output-DPI-agnostic.

const SP_PER_PT = 65536;
const SP_TO_PT = 1 / SP_PER_PT;

/** A rectangle on a PDF page in PDF user-space points (1pt = 1/72").
 *  Y is measured from the page top (CSS convention) for direct use
 *  by the canvas overlay - we flip the SyncTeX baseline at parse
 *  time using the page's recorded height. */
export interface PdfRect {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SourceLink {
  /** Source path as written in the synctex `Input:` preamble.
   *  Leading "./" stripped for caller convenience. */
  path: string;
  line: number;
}

export interface ForwardRecord extends PdfRect, SourceLink {}

/** Parsed SyncTeX file with O(1) lookups in both directions. */
export interface SyncTexIndex {
  pageCount: number;
  /**
   * Forward lookup. Returns every rectangle the source position
   * touched in the PDF (a single line can produce multiple boxes
   * - line-broken paragraphs, math display, two-column layouts).
   */
  forward(path: string, line: number): ForwardRecord[];
  /**
   * Reverse lookup. Given a point on a page, returns the smallest
   * record (by area) that contains it, or null when the click
   * landed outside any recorded box.
   */
  reverse(page: number, x: number, y: number): ForwardRecord | null;
  pageRecords(page: number): ForwardRecord[];
}

const RECORD_RE =
  /^([[(hvgkx$f])(\d+),(\d+)(?::(-?\d+),(-?\d+)(?::(-?\d+),(-?\d+)(?:,(-?\d+))?)?)?/;

/**
 * Decompress + parse a `.synctex.gz` payload. Returns null when
 * the buffer is empty / unrecognised / decompression fails - the
 * caller falls back to no-synctex behaviour.
 */
export async function parseSynctex(gzipped: Uint8Array): Promise<SyncTexIndex | null> {
  if (gzipped.length === 0) return null;
  try {
    const text = await gunzipToString(gzipped);
    return indexFromText(text);
  } catch {
    return null;
  }
}

/** Parse a synctex *text* payload (the already-decompressed
 *  content). Exposed for tests + for engines that produce
 *  uncompressed output. Returns null on a malformed header. */
export function parseSynctexText(text: string): SyncTexIndex | null {
  try {
    return indexFromText(text);
  } catch {
    return null;
  }
}

// -- decompression ----------------------------------------------

async function gunzipToString(gzipped: Uint8Array): Promise<string> {
  // DecompressionStream is supported in modern Chrome/Firefox/Safari
  // (every browser our SwiftLaTeX/BusyTeX path already targets).
  // The cast is for older TypeScript libs that don't carry the
  // global type yet.
  const Stream = (globalThis as { DecompressionStream?: typeof DecompressionStream })
    .DecompressionStream;
  if (typeof Stream !== "function") {
    throw new Error("DecompressionStream is not available in this environment");
  }
  // We feed bytes into a hand-rolled ReadableStream instead of
  // routing through Blob.stream() - jsdom (our test environment)
  // ships Blob and DecompressionStream but not Blob#stream, so a
  // direct ReadableStream is the lowest-common-denominator path.
  // The cast on the pipeThrough call is required because
  // DecompressionStream's lib type widens to BufferSource on the
  // writable side, which TS's strict `ReadableWritablePair<U8, U8>`
  // expects to match - they're compatible at runtime.
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(gzipped);
      controller.close();
    },
  });
  const stream = source.pipeThrough(
    new Stream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  );
  const decompressedBytes = await readAll(stream, 50 * 1024 * 1024);
  return new TextDecoder("utf-8").decode(decompressedBytes);
}

async function readAll(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error(`SyncTeX decompression exceeds ${maxBytes} byte limit; aborting`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    void stream.cancel().catch(() => {});
  }
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.byteLength;
  }
  return merged;
}

// -- text parser ------------------------------------------------

function indexFromText(text: string): SyncTexIndex {
  // Tag -> path lookup, populated from `Input:N:./path` lines.
  const tagToPath = new Map<number, string>();
  const lines = text.split(/\r?\n/);

  // First pass: preamble. The preamble ends at the line containing
  // just `Content:`; everything after it is the page tree.
  let contentStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line === "Content:") {
      contentStart = i + 1;
      break;
    }
    const inputMatch = /^Input:(\d+):(.*)$/.exec(line);
    if (inputMatch) {
      const tag = Number(inputMatch[1]);
      const path = normalizeSynctexPath(inputMatch[2]!.trim());
      tagToPath.set(tag, path);
      continue;
    }
  }
  if (contentStart === -1) throw new Error("synctex: missing Content section");

  // Second pass: page tree. We track the current page (none until
  // we hit a `{N` marker) and the running stack so child boxes
  // know what page they live on.
  const records: ForwardRecord[] = [];
  // `pageHeight[page]` is the top-of-page Y origin captured from
  // the outermost vbox of the page so we can flip Y for canvas
  // use. SyncTeX measures Y *down* from the page top in the
  // baseline-origin format - modern engines emit `Page` records
  // that confirm this, and we keep the down-from-top convention
  // straight through.
  let currentPage = 0;
  let pageCount = 0;
  for (let i = contentStart; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.length === 0) continue;
    const lead = raw[0]!;
    // Page open: `{1` (we ignore the `Post-Page-Vertical-List`
    // marker `<` and the page-close `}` - they don't introduce
    // new geometry).
    if (lead === "{") {
      const page = Number(raw.slice(1));
      if (Number.isFinite(page)) {
        currentPage = page;
        pageCount = Math.max(pageCount, page);
      }
      continue;
    }
    if (lead === "}" || lead === "<" || lead === ">" || lead === "]" || lead === ")") {
      continue;
    }
    if (currentPage === 0) continue;
    const m = RECORD_RE.exec(raw);
    if (!m) continue;
    const tag = Number(m[2]);
    const line = Number(m[3]);
    const path = tagToPath.get(tag);
    if (!path) continue;
    // Some record types (`g`, `x`) omit width/height; treat them
    // as zero-area so the reverse lookup ignores them but the
    // forward lookup still produces a jump target.
    const sx = m[4] !== undefined ? Number(m[4]) : 0;
    const sy = m[5] !== undefined ? Number(m[5]) : 0;
    const sw = m[6] !== undefined ? Number(m[6]) : 0;
    const sh = m[7] !== undefined ? Number(m[7]) : 0;
    const sd = m[8] !== undefined ? Number(m[8]) : 0;
    records.push({
      path,
      line,
      page: currentPage,
      x: sx * SP_TO_PT,
      y: (sy - sh) * SP_TO_PT,
      w: sw * SP_TO_PT,
      // SyncTeX boxes report height+depth separately; the total
      // visual height is the sum. We collapse it for one-rect-per
      // -record consumers.
      h: (sh + sd) * SP_TO_PT,
    });
  }

  // Build forward index keyed by `path|line` -> records.
  const forwardIdx = new Map<string, ForwardRecord[]>();
  // Reverse index keyed by page -> records (already sorted by
  // descending area so the smallest box wins ties).
  const byPage = new Map<number, ForwardRecord[]>();
  for (const r of records) {
    const k = `${r.path}|${r.line}`;
    let bucket = forwardIdx.get(k);
    if (!bucket) {
      bucket = [];
      forwardIdx.set(k, bucket);
    }
    bucket.push(r);
    let page = byPage.get(r.page);
    if (!page) {
      page = [];
      byPage.set(r.page, page);
    }
    page.push(r);
  }
  for (const [, bucket] of byPage) {
    bucket.sort((a, b) => a.w * a.h - b.w * b.h);
  }

  return {
    pageCount,
    forward(path, line) {
      const key = `${stripLeadingDotSlash(path)}|${line}`;
      return forwardIdx.get(key) ?? [];
    },
    reverse(page, x, y) {
      const bucket = byPage.get(page);
      if (!bucket) return null;
      // Smallest containing rectangle wins - closest match to a
      // glyph rather than the page-wide vbox.
      for (const r of bucket) {
        if (r.w <= 0 || r.h <= 0) continue;
        // SyncTeX stores the *baseline* origin of horizontal
        // boxes; the visible top of the box is `y - h` (h is
        // height-above-baseline). We collapsed height+depth into
        // r.h during parse, so the true bottom is `r.y + depth`.
        // To safely catch descenders, we use `r.y + (r.h / 2)`
        // as a heuristic since depth isn't stored independently.
        const top = r.y - r.h;
        const bottom = r.y + r.h / 2;
        if (x >= r.x && x <= r.x + r.w && y >= top && y <= bottom) {
          return r;
        }
      }
      return null;
    },
    pageRecords(page) {
      return byPage.get(page) ?? [];
    },
  };
}

function stripLeadingDotSlash(path: string): string {
  return path.startsWith("./") ? path.slice(2) : path;
}

function normalizeSynctexPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/\.\//g, "/");
  const projectRoot = "/project_dir/";
  const rootIndex = normalized.lastIndexOf(projectRoot);
  if (rootIndex !== -1) {
    return stripLeadingDotSlash(normalized.slice(rootIndex + projectRoot.length));
  }
  return stripLeadingDotSlash(normalized);
}
