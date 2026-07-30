import { XzReadableStream } from "xz-decompress";
import { readTar } from "./tar-reader";

// Resolve missing TeX files through the SwiftLaTeX host protocol. Fetching the
// entire indexed package lets subsequent sibling lookups resolve from MemFS.

export interface CtanFile {
  filename: string;
  path?: string;
  content: Uint8Array;
}

export interface CtanFetcherOptions {
  indexUrl?: string;
  /**
   * TLNET mirror base, e.g.
   *   "https://mirrors.up.pt/pub/CTAN/systems/texlive/tlnet"
   * The fetcher will hit `<mirror>/archive/<pkg>.tar.xz`.
   */
  mirrorBase?: string;
  fetchImpl?: typeof fetch;
  /** Cap on the decompressed archive size, in bytes. The mirror is
   *  external/untrusted, so an unbounded decompress is a DoS vector
   *  (a small `.tar.xz` can inflate to gigabytes). Defaults to 128 MB;
   *  the largest real TeX Live package archives are well under this. */
  maxDecompressedBytes?: number;
}

const DEFAULT_INDEX_URL = "/engine/texlive-index.json";
/** TeX Live packages remain well below this ceiling under normal operation. */
const DEFAULT_MAX_DECOMPRESSED_BYTES = 128 * 1024 * 1024;
/** TeX Live package names are lowercase alphanumerics with dots,
 *  hyphens, and underscores. Reject anything else so a poisoned index
 *  can't traverse or rewrite the mirror URL. */
const VALID_PACKAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// Vite and the Sites worker both expose this same-origin boundary because CTAN
// mirrors do not reliably provide CORS headers.
const DEFAULT_MIRROR = import.meta.env.VITE_CTAN_MIRROR_BASE?.trim() || "/ctan";

type IndexShape = Record<string, string[] | undefined>;

export class CtanFetcher {
  private readonly indexUrl: string;
  private readonly mirrorBase: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxDecompressedBytes: number;
  private indexPromise: Promise<IndexShape> | null = null;
  private readonly packageCache = new Map<string, CtanFile[]>();
  /** Coalesces concurrent downloads of the same package. */
  private readonly packageInflight = new Map<string, Promise<CtanFile[]>>();

  constructor(options: CtanFetcherOptions = {}) {
    this.indexUrl = options.indexUrl ?? DEFAULT_INDEX_URL;
    this.mirrorBase = options.mirrorBase ?? DEFAULT_MIRROR;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.maxDecompressedBytes = options.maxDecompressedBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES;
  }

  /**
   * Resolve a single basename (e.g. "article.cls") to every file we
   * could find in the same package. The engine writes them all to
   * MemFS - kpsewhich's next lookup for a sibling .sty/.clo is a
   * pure MemFS hit. Returns [] when the file is unknown to the
   * index.
   */
  async fetchByFilename(filename: string): Promise<CtanFile[]> {
    // kpathsea may request an input such as `lipsum.ltd` while TeX Live
    // records the same runfile as `lipsum.ltd.tex`.
    const texFilename = filename.endsWith(".tex") ? filename : `${filename}.tex`;
    const index = await this.loadIndex();
    // Guard against prototype keys ("__proto__", "constructor") in the
    // untrusted index: use hasOwnProperty and require a real array.
    const indexedFilename = Object.prototype.hasOwnProperty.call(index, filename)
      ? filename
      : texFilename;
    const packages = Object.prototype.hasOwnProperty.call(index, indexedFilename)
      ? index[indexedFilename]
      : undefined;
    if (!Array.isArray(packages) || packages.length === 0) return [];
    // tlpdb lists `latex-base-dev` etc. alongside the real package -
    // those are dev variants whose archives may not exist. The
    // `00texlive.*` entries are metadata-only and never resolve to
    // an archive. We try each remaining entry in order and return
    // the first non-empty result.
    for (const pkg of packages) {
      if (typeof pkg !== "string" || pkg.startsWith("00texlive.")) continue;
      if (!VALID_PACKAGE_NAME.test(pkg)) continue;
      const files = await this.fetchPackage(pkg).catch(() => {
        return null;
      });
      if (files && files.length > 0) return files;
    }
    return [];
  }

  /**
   * Fetch and extract a TeX Live package archive. Idempotent -
   * concurrent calls for the same package share the same promise,
   * and a successful fetch is remembered for the session.
   */
  async fetchPackage(pkg: string): Promise<CtanFile[]> {
    if (!VALID_PACKAGE_NAME.test(pkg)) {
      throw new Error(`CTAN: invalid package name ${JSON.stringify(pkg)}`);
    }
    const cached = this.packageCache.get(pkg);
    if (cached) return cached;
    const inflight = this.packageInflight.get(pkg);
    if (inflight) return inflight;

    const promise = this.downloadAndExtract(pkg)
      .then((files) => {
        this.packageCache.set(pkg, files);
        if (this.packageCache.size > 20) {
          const firstKey = this.packageCache.keys().next().value;
          if (firstKey !== undefined) {
            this.packageCache.delete(firstKey);
          }
        }
        this.packageInflight.delete(pkg);
        return files;
      })
      .catch((e) => {
        this.packageInflight.delete(pkg);
        throw e;
      });
    this.packageInflight.set(pkg, promise);
    return promise;
  }

  private async loadIndex(): Promise<IndexShape> {
    if (!this.indexPromise) {
      this.indexPromise = (async () => {
        const res = await this.fetchImpl(this.indexUrl);
        if (!res.ok) throw new Error(`CTAN index ${this.indexUrl} -> HTTP ${res.status}`);
        return (await res.json()) as IndexShape;
      })().catch((e) => {
        // Reset so a later retry can succeed.
        this.indexPromise = null;
        throw e;
      });
    }
    return this.indexPromise;
  }

  private async downloadAndExtract(pkg: string): Promise<CtanFile[]> {
    // pkg is validated against VALID_PACKAGE_NAME by callers, but
    // encode the segment anyway so the URL stays well-formed and
    // traversal-safe regardless of the entry point.
    const url = `${this.mirrorBase}/archive/${encodeURIComponent(pkg)}.tar.xz`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    if (!res.body) throw new Error(`${url} -> no body`);

    // Decompress the xz stream -> uncompressed tar bytes. Cap the
    // accumulated size: the mirror is untrusted and a small archive
    // can inflate to gigabytes (decompression bomb).
    const xz = new XzReadableStream(res.body);
    const tarBytes = await readAll(xz, this.maxDecompressedBytes);

    // Walk the tar and pull out files with a known extension. We
    // keep the basename only - pdfTeX/kpsewhich looks up files by
    // basename, and we want any future hit in this package to be
    // free.
    const out: CtanFile[] = [];
    for (const entry of readTar(tarBytes)) {
      if (entry.type !== "file") continue;
      const base = entry.name.split("/").pop() ?? entry.name;
      if (!base.includes(".")) continue;
      // We're handed a *view*; copy because the underlying buffer
      // is about to be GC'd after the function returns.
      out.push({ filename: base, path: entry.name, content: new Uint8Array(entry.content) });
    }
    return out;
  }
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
        throw new Error(`CTAN archive exceeds ${maxBytes} byte decompression limit; aborting`);
      }
      chunks.push(value);
    }
  } finally {
    // Release the lock and cancel the underlying source so a bailed
    // decompression doesn't leak the reader.
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
