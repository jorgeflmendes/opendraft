import { XzReadableStream } from "xz-decompress";
import { assetUrl } from "@/lib/asset-url";
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
  /** Same-origin directory containing format-compatible package manifests. */
  pinnedPackageBase?: string | null;
}

const DEFAULT_INDEX_URL = assetUrl("engine/texlive-index.json");
/** TeX Live packages remain well below this ceiling under normal operation. */
const DEFAULT_MAX_DECOMPRESSED_BYTES = 128 * 1024 * 1024;
const DEFAULT_PINNED_PACKAGE_BASE = assetUrl("engine/packages");
const MAX_PINNED_MANIFEST_BYTES = 64 * 1024;
const MAX_PINNED_FILES = 128;
const PINNED_RUNTIME_PACKAGES = new Set(["l3kernel"]);
/** TeX Live package names are lowercase alphanumerics with dots,
 *  hyphens, and underscores. Reject anything else so a poisoned index
 *  can't traverse or rewrite the mirror URL. */
const VALID_PACKAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// Vite and the Sites worker both expose this same-origin boundary because CTAN
// mirrors do not reliably provide CORS headers.
const DEFAULT_MIRROR = import.meta.env.VITE_CTAN_MIRROR_BASE?.trim() || assetUrl("ctan");

type IndexShape = Record<string, string[] | undefined>;

interface PinnedPackageFile {
  filename: string;
  path: string;
  size: number;
}

interface PinnedPackageManifest {
  package: string;
  version: string;
  sourceSha256: string;
  files: PinnedPackageFile[];
}

export class CtanFetcher {
  private readonly indexUrl: string;
  private readonly mirrorBase: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxDecompressedBytes: number;
  private readonly pinnedPackageBase: string | null;
  private indexPromise: Promise<IndexShape> | null = null;
  private readonly packageCache = new Map<string, CtanFile[]>();
  /** Coalesces concurrent downloads of the same package. */
  private readonly packageInflight = new Map<string, Promise<CtanFile[]>>();

  constructor(options: CtanFetcherOptions = {}) {
    this.indexUrl = options.indexUrl ?? DEFAULT_INDEX_URL;
    this.mirrorBase = options.mirrorBase ?? DEFAULT_MIRROR;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.maxDecompressedBytes = options.maxDecompressedBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES;
    this.pinnedPackageBase =
      options.pinnedPackageBase === undefined
        ? DEFAULT_PINNED_PACKAGE_BASE
        : (options.pinnedPackageBase?.replace(/\/$/, "") ?? null);
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
    // A rolling index may change candidate order. Format-locked packages must
    // win over development or mirror variants whenever they are available.
    const orderedPackages = [
      ...packages.filter((pkg) => typeof pkg === "string" && this.isPinnedPackage(pkg)),
      ...packages.filter((pkg) => typeof pkg !== "string" || !this.isPinnedPackage(pkg)),
    ];
    for (const pkg of orderedPackages) {
      if (typeof pkg !== "string" || pkg.startsWith("00texlive.")) continue;
      if (!VALID_PACKAGE_NAME.test(pkg)) continue;
      let files: CtanFile[] | null;
      try {
        files = await this.fetchPackage(pkg);
      } catch (error) {
        // A pinned kernel must never silently fall through to a rolling CTAN
        // variant: that recreates the format/package mismatch this lock avoids.
        if (this.isPinnedPackage(pkg)) throw error;
        files = null;
      }
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

    const promise = (
      this.isPinnedPackage(pkg) ? this.downloadPinnedPackage(pkg) : this.downloadAndExtract(pkg)
    )
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

  private isPinnedPackage(pkg: string): boolean {
    return this.pinnedPackageBase !== null && PINNED_RUNTIME_PACKAGES.has(pkg);
  }

  private async downloadPinnedPackage(pkg: string): Promise<CtanFile[]> {
    if (!this.pinnedPackageBase) throw new Error(`Pinned package base is unavailable for ${pkg}`);
    const manifestUrl = `${this.pinnedPackageBase}/${encodeURIComponent(pkg)}.json`;
    const manifestResponse = await this.fetchImpl(manifestUrl);
    if (!manifestResponse.ok) {
      throw new Error(`${manifestUrl} -> HTTP ${manifestResponse.status}`);
    }
    const manifestText = await manifestResponse.text();
    if (new TextEncoder().encode(manifestText).byteLength > MAX_PINNED_MANIFEST_BYTES) {
      throw new Error(`${pkg} pinned package manifest exceeds the size limit`);
    }
    const manifest = parsePinnedManifest(manifestText, pkg, this.maxDecompressedBytes);

    return Promise.all(
      manifest.files.map(async (file) => {
        const url = `${this.pinnedPackageBase}/${encodeURIComponent(pkg)}/${encodeURIComponent(file.filename)}`;
        const res = await this.fetchImpl(url);
        if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
        const content = new Uint8Array(await res.arrayBuffer());
        if (content.byteLength !== file.size) {
          throw new Error(`${url} -> expected ${file.size} bytes, received ${content.byteLength}`);
        }
        return { filename: file.filename, path: file.path, content };
      }),
    );
  }
}

function parsePinnedManifest(
  raw: string,
  expectedPackage: string,
  maxBytes: number,
): PinnedPackageManifest {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new Error(`${expectedPackage} pinned package manifest is invalid JSON`);
  }
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`${expectedPackage} pinned package manifest is invalid`);
  }
  const manifest = candidate as Partial<PinnedPackageManifest>;
  if (
    manifest.package !== expectedPackage ||
    typeof manifest.version !== "string" ||
    typeof manifest.sourceSha256 !== "string" ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0 ||
    manifest.files.length > MAX_PINNED_FILES
  ) {
    throw new Error(`${expectedPackage} pinned package manifest is invalid`);
  }
  let total = 0;
  const names = new Set<string>();
  for (const file of manifest.files) {
    if (
      !file ||
      typeof file.filename !== "string" ||
      !file.filename ||
      file.filename.includes("/") ||
      file.filename.includes("\\") ||
      names.has(file.filename) ||
      typeof file.path !== "string" ||
      file.path.split(/[\\/]/).includes("..") ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0
    ) {
      throw new Error(`${expectedPackage} pinned package manifest contains an invalid file`);
    }
    names.add(file.filename);
    total += file.size;
    if (total > maxBytes) {
      throw new Error(`${expectedPackage} pinned package exceeds ${maxBytes} byte limit`);
    }
  }
  return manifest as PinnedPackageManifest;
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
