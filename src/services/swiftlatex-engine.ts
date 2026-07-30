import type { CtanFetcher, CtanFile } from "./ctan-fetcher";

// Protocol adapter for the SwiftLaTeX pdfTeX worker. It owns the ready/compile
// handshakes and services the worker's on-demand CTAN requests.

export interface SwiftLaTeXCompileOk {
  cmd: "compile";
  result: "ok";
  log: string;
  status: number;
  /** The worker transfers an ArrayBuffer (not a Uint8Array view).
   *  Consumers wrap it with `new Uint8Array(response.pdf)`. */
  pdf: ArrayBuffer;
}
export interface SwiftLaTeXCompileFail {
  cmd: "compile";
  result: "failed";
  log: string;
  status: number;
}
export type SwiftLaTeXCompileResponse = SwiftLaTeXCompileOk | SwiftLaTeXCompileFail;

export interface SwiftLaTeXEngineOptions {
  workerUrl: string;
  fmtUrl?: string;
  pdftexMapUrl?: string;
  ctanFetcher?: CtanFetcher | null;
  fetchImpl?: typeof fetch;
  /** Milliseconds to wait for the worker's ready handshake before
   *  giving up. A worker that loads but never handshakes (bad URL,
   *  broken WASM) would otherwise wedge the first compile forever.
   *  Defaults to 60s; set 0 to disable. */
  loadTimeoutMs?: number;
}

/** Bounds a worker that loads but never completes its ready handshake. */
const DEFAULT_LOAD_TIMEOUT_MS = 60_000;

interface DownloadFromCtanMessage {
  cmd: "downloadFromCTAN";
  id: number | string;
  filename: string;
}

/** Owns one worker whose in-memory filesystem persists across compilations. */
export class SwiftLaTeXEngine {
  private worker: Worker | null = null;
  private ready = false;
  private inflight: ((value: SwiftLaTeXCompileResponse) => void) | null = null;
  private inflightReject: ((reason: unknown) => void) | null = null;
  private readonly workerUrl: string;
  private readonly fmtUrl: string | null;
  private readonly pdftexMapUrl: string | null;
  private readonly ctan: CtanFetcher | null;
  private readonly fetchImpl: typeof fetch;
  private readonly loadTimeoutMs: number;
  private readonly writtenTexFiles = new Set<string>();
  private readonly dynamicMapFragments = new Map<string, Uint8Array>();

  constructor(options: SwiftLaTeXEngineOptions) {
    this.workerUrl = options.workerUrl;
    this.fmtUrl = options.fmtUrl ?? null;
    this.pdftexMapUrl = options.pdftexMapUrl ?? null;
    this.ctan = options.ctanFetcher ?? null;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.loadTimeoutMs = options.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
  }

  /** Spin up the worker and wait for its `ok` handshake. The .fmt
   *  file is *not* pre-loaded - the worker's kpse only consults its
   *  in-memory cache, never the FS - so we serve the fmt on demand
   *  when the worker first asks for it via `downloadFromCTAN`. */
  async load(): Promise<void> {
    if (this.ready) return;
    const w = new Worker(this.workerUrl);
    this.worker = w;
    try {
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const cleanup = () => {
          if (timer !== null) clearTimeout(timer);
          w.removeEventListener("message", onMessage);
          w.removeEventListener("error", onError);
          w.removeEventListener("messageerror", onError);
        };
        const onMessage = (ev: MessageEvent) => {
          const data = ev.data as { result?: string } | undefined;
          if (data?.result === "ok") {
            cleanup();
            this.ready = true;
            w.addEventListener("message", (next) => {
              void this.handleResponse(next.data);
            });
            // A worker runtime error (e.g. an Emscripten abort during a
            // compile) surfaces as an ErrorEvent, not a `cmd: "compile"`
            // message. Without this listener the inflight compile
            // promise would never settle and the engine would leak.
            w.addEventListener("error", this.onWorkerError);
            w.addEventListener("messageerror", this.onWorkerError);
            resolve();
          }
        };
        const onError: EventListener = (e: Event) => {
          cleanup();
          reject(
            new Error(
              `Failed to load SwiftLaTeX worker: ${e instanceof ErrorEvent ? e.message : String(e)}`,
            ),
          );
        };
        w.addEventListener("message", onMessage);
        w.addEventListener("error", onError);
        w.addEventListener("messageerror", onError);
        if (this.loadTimeoutMs > 0) {
          timer = setTimeout(() => {
            cleanup();
            reject(
              new Error(`SwiftLaTeX worker did not hand shake within ${this.loadTimeoutMs}ms`),
            );
          }, this.loadTimeoutMs);
        }
      });
    } catch (err) {
      // Boot failed: drop the half-initialised worker so a later
      // load() starts clean instead of reusing a dead handle.
      w.terminate();
      if (this.worker === w) this.worker = null;
      throw err;
    }
  }

  /** Persistent worker error handler installed after boot. Rejects
   *  any inflight compile so callers don't hang on a worker crash. */
  private readonly onWorkerError = (event: Event): void => {
    const message = event instanceof ErrorEvent && event.message ? event.message : "worker error";
    if (this.inflightReject) {
      const reject = this.inflightReject;
      this.inflight = null;
      this.inflightReject = null;
      reject(new Error(`SwiftLaTeXEngine: ${message}`));
    }
  };

  isReady(): boolean {
    return this.ready;
  }

  writeMemFSFile(path: string, src: string | Uint8Array): void {
    this.ensureWorker().postMessage({ cmd: "writefile", url: path, src });
  }

  writeTexFSFile(path: string, src: Uint8Array): void {
    this.ensureWorker().postMessage({ cmd: "writetexfile", url: path, src });
    this.writtenTexFiles.add(path);
  }

  makeMemFSFolder(path: string): void {
    this.ensureWorker().postMessage({ cmd: "mkdir", url: path });
  }

  setEngineMainFile(path: string): void {
    this.ensureWorker().postMessage({ cmd: "setmainfile", url: path });
  }

  flushCache(): void {
    this.ensureWorker().postMessage({ cmd: "flushcache" });
    this.writtenTexFiles.clear();
  }

  setTexliveEndpoint(url: string): void {
    this.ensureWorker().postMessage({ cmd: "settexliveurl", url });
  }

  compileLaTeX(): Promise<SwiftLaTeXCompileResponse> {
    const w = this.ensureWorker();
    if (this.inflight) {
      return Promise.reject(new Error("SwiftLaTeXEngine: a compile is already in flight"));
    }
    return new Promise((resolve, reject) => {
      this.inflight = resolve;
      this.inflightReject = reject;
      w.postMessage({ cmd: "compilelatex" });
    });
  }

  close(): void {
    if (!this.worker) return;
    try {
      this.worker.postMessage({ cmd: "grace" });
    } catch {
      // Runtime failures may terminate the worker before cleanup.
    }
    this.worker.terminate();
    this.worker = null;
    this.ready = false;
    this.writtenTexFiles.clear();
    this.dynamicMapFragments.clear();
    if (this.inflightReject) {
      this.inflightReject(new Error("SwiftLaTeXEngine: closed mid-compile"));
      this.inflight = null;
      this.inflightReject = null;
    }
  }

  private ensureWorker(): Worker {
    if (!this.worker || !this.ready) {
      throw new Error("SwiftLaTeXEngine: load() before use");
    }
    return this.worker;
  }

  /** Lazily loaded base font-map bytes - served back when the worker
   *  asks for "pdftex.map" via downloadFromCTAN. Runtime CTAN package
   *  map fragments are appended by buildPdftexMap(). */
  private baseMapPromise: Promise<Uint8Array> | null = null;
  private loadBasePdftexMap(): Promise<Uint8Array> {
    if (!this.pdftexMapUrl) return Promise.reject(new Error("No pdftexMapUrl"));
    if (!this.baseMapPromise) {
      this.baseMapPromise = (async () => {
        const res = await this.fetchImpl(this.pdftexMapUrl!);
        if (!res.ok) throw new Error(`pdftex.map fetch ${this.pdftexMapUrl} -> ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      })();
    }
    return this.baseMapPromise;
  }

  private async buildPdftexMap(): Promise<Uint8Array> {
    const base = await this.loadBasePdftexMap();
    if (this.dynamicMapFragments.size === 0) return base;

    const chunks: Uint8Array[] = [
      base,
      utf8("\n% --- dynamically loaded CTAN map fragments ---\n"),
    ];
    for (const [filename, bytes] of this.dynamicMapFragments) {
      chunks.push(utf8(`\n% --- from CTAN package file: ${filename} ---\n`), bytes, utf8("\n"));
    }
    return concatBytes(chunks);
  }

  private async refreshPdftexMap(): Promise<void> {
    if (!this.worker || !this.ready || !this.pdftexMapUrl) return;
    this.writeTexFSFile("pdftex.map", await this.buildPdftexMap());
  }

  /** Lazily loaded .fmt bytes - served back when the worker first
   *  asks for "swiftlatexpdftex.fmt" via downloadFromCTAN. */
  private fmtPromise: Promise<Uint8Array> | null = null;
  private loadFmt(): Promise<Uint8Array> {
    if (!this.fmtUrl) return Promise.reject(new Error("No fmtUrl configured"));
    if (!this.fmtPromise) {
      this.fmtPromise = (async () => {
        const res = await this.fetchImpl(this.fmtUrl!);
        if (!res.ok) {
          throw new Error(`SwiftLaTeXEngine: fetch ${this.fmtUrl} -> HTTP ${res.status}`);
        }
        return new Uint8Array(await res.arrayBuffer());
      })();
    }
    return this.fmtPromise;
  }

  private async handleResponse(data: unknown): Promise<void> {
    if (!data || typeof data !== "object") return;
    const msg = data as Record<string, unknown>;
    if (msg.cmd === "compile") {
      this.resolveCompile(data as SwiftLaTeXCompileResponse);
      return;
    }
    if (msg.cmd === "downloadFromCTAN") {
      await this.handleCtanRequest(msg as unknown as DownloadFromCtanMessage);
    }
  }

  private resolveCompile(payload: SwiftLaTeXCompileResponse): void {
    if (!this.inflight) return;
    const resolve = this.inflight;
    this.inflight = null;
    this.inflightReject = null;
    resolve(payload);
  }

  /**
   * Fetch a CTAN package on the worker's behalf and post the reply
   * the worker is blocking on. The worker keys this reply by the
   * same `id` it sent in the request.
   *
   * Wire format: `result` is a Map<string, Uint8Array> - that's
   * what the worker's `kpse_find_file_impl` iterates (`result.has`,
   * `result.entries()`). Structured clone preserves Map across
   * postMessage.
   *
   * Special case: the .fmt format dump isn't on CTAN - we ship it
   * locally under /engine/. When the worker asks for it the first
   * time, we serve our shipped copy and cache it for the session.
   */
  private async handleCtanRequest(msg: DownloadFromCtanMessage): Promise<void> {
    const w = this.worker;
    if (!w) return;
    try {
      const result = await this.resolveCtanFilename(msg.filename);
      if (result.size === 0) {
        // Tell the worker: "we didn't find that". The worker maps
        // undefined -> kpse returns 0 -> pdfTeX raises its own
        // "file not found" error which surfaces in the log.
        w.postMessage({ cmd: "sendCTANFiles", id: msg.id, result: undefined, error: false });
        return;
      }
      w.postMessage({ cmd: "sendCTANFiles", id: msg.id, result, error: false });
    } catch {
      w.postMessage({ cmd: "sendCTANFiles", id: msg.id, result: undefined, error: false });
    }
  }

  private async resolveCtanFilename(filename: string): Promise<Map<string, Uint8Array>> {
    // 1. Locally-shipped artefacts - served from /engine/, not CTAN.
    //    .fmt: pre-built pdfLaTeX format dump (gboyd068 fork).
    //    pdftex.map: synthesised at install time by setup-engine.mjs
    //    by concatenating font .map fragments from amsfonts etc.
    if (filename === "swiftlatexpdftex.fmt") {
      const bytes = await this.loadFmt();
      const m = new Map<string, Uint8Array>();
      m.set(filename, bytes);
      return m;
    }
    if (filename === "pdftex.map") {
      const bytes = await this.buildPdftexMap();
      const m = new Map<string, Uint8Array>();
      m.set(filename, bytes);
      return m;
    }
    // 2. Everything else - through the CTAN fetcher.
    if (!this.ctan) return new Map();
    const files = await this.ctan.fetchByFilename(filename);
    // The worker has a quirk where its `texlive200_cache[cacheKey]`
    // is overwritten inside the file-write loop with the savepath of
    // each entry in the Map. That means the cache key ends up
    // pointing at whichever file was *last* in iteration order. We
    // build the Map so the requested file is last - every other file
    // in the package still lands on disk for future lookups, but the
    // immediate kpse return value resolves to the right path.
    const m = new Map<string, Uint8Array>();
    let requestedContent: Uint8Array | undefined;
    let sawNewMapFragment = false;
    for (const f of files) {
      const mapKey = pdftexMapFragmentKey(f);
      if (mapKey && !this.dynamicMapFragments.has(mapKey)) {
        this.dynamicMapFragments.set(mapKey, f.content);
        sawNewMapFragment = true;
      }
      if (f.filename === filename) {
        requestedContent = f.content;
        continue;
      }
      if (requestedContent === undefined && f.filename === `${filename}.tex`) {
        requestedContent = f.content;
      }
      m.set(f.filename, f.content);
    }
    if (sawNewMapFragment) await this.refreshPdftexMap();
    if (requestedContent !== undefined) m.set(filename, requestedContent);
    return m;
  }
}

function pdftexMapFragmentKey(file: CtanFile): string | null {
  const lowerFilename = file.filename.toLowerCase();
  if (!lowerFilename.endsWith(".map") || lowerFilename === "pdftex.map") return null;
  if (!file.path) return file.filename;

  const path = file.path.replaceAll("\\", "/").toLowerCase();
  if (!path.includes("/fonts/map/")) return null;
  if (path.includes("/dvipdfm/") || path.includes("/dvipdfmx/") || path.includes("/xdvipdfmx/")) {
    return null;
  }
  return file.path;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
