import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SwiftLaTeXEngine } from "./swiftlatex-engine";
import type { CtanFetcher } from "./ctan-fetcher";

// We stub the global Worker. jsdom ships a no-op Worker that just
// posts errors, which would mask the protocol we want to assert on.
// Each test gets a fresh FakeWorker captured via `lastWorker` so we
// can inspect what the engine posted and reply with our own message.

interface FakeMsgEvent {
  data: unknown;
}
type MsgListener = (ev: FakeMsgEvent) => void;
type ErrListener = (ev: ErrorEvent) => void;

class FakeWorker {
  posted: unknown[] = [];
  private msgListeners = new Set<MsgListener>();
  private errListeners = new Set<ErrListener>();

  constructor(public url: string) {
    // Resolve the engine's ready handshake on next tick.
    queueMicrotask(() => {
      this.emit({ result: "ok" });
    });
  }

  postMessage(data: unknown): void {
    this.posted.push(data);
  }

  addEventListener(type: string, fn: MsgListener | ErrListener): void {
    if (type === "message") this.msgListeners.add(fn as MsgListener);
    if (type === "error") this.errListeners.add(fn as ErrListener);
  }

  removeEventListener(type: string, fn: MsgListener | ErrListener): void {
    if (type === "message") this.msgListeners.delete(fn as MsgListener);
    if (type === "error") this.errListeners.delete(fn as ErrListener);
  }

  terminate(): void {}

  // Test helpers.
  emit(data: unknown): void {
    for (const fn of this.msgListeners) fn({ data });
  }
  emitError(message: string): void {
    for (const fn of this.errListeners) {
      fn(new ErrorEvent("error", { message }));
    }
  }
}

let lastWorker: FakeWorker | null = null;

beforeEach(() => {
  lastWorker = null;
  vi.stubGlobal("Worker", function CapturingWorker(this: FakeWorker, url: string) {
    const w = new FakeWorker(url);
    lastWorker = w;
    return w;
  } as unknown as typeof Worker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SwiftLaTeXEngine", () => {
  it("waits for the worker's ok handshake before reporting ready", async () => {
    const engine = new SwiftLaTeXEngine({ workerUrl: "/w.js" });
    await engine.load();
    expect(engine.isReady()).toBe(true);
    await engine.load();
    expect(lastWorker!.url).toBe("/w.js");
  });

  it("posts filesystem, cache, endpoint, and main-file commands to the worker", async () => {
    const engine = new SwiftLaTeXEngine({ workerUrl: "/w.js" });
    await engine.load();

    engine.writeMemFSFile("main.tex", "hello");
    engine.writeTexFSFile("article.cls", new Uint8Array([1]));
    engine.makeMemFSFolder("chapters");
    engine.setEngineMainFile("main.tex");
    engine.flushCache();
    engine.setTexliveEndpoint("/ctan");

    expect(lastWorker!.posted).toEqual(
      expect.arrayContaining([
        { cmd: "writefile", url: "main.tex", src: "hello" },
        { cmd: "writetexfile", url: "article.cls", src: new Uint8Array([1]) },
        { cmd: "mkdir", url: "chapters" },
        { cmd: "setmainfile", url: "main.tex" },
        { cmd: "flushcache" },
        { cmd: "settexliveurl", url: "/ctan" },
      ]),
    );
  });

  it("throws when commands are used before load()", () => {
    const engine = new SwiftLaTeXEngine({ workerUrl: "/w.js" });

    expect(() => engine.writeMemFSFile("main.tex", "")).toThrow(/load\(\) before use/);
  });

  it("serves the locally-shipped .fmt when the worker asks for it on demand", async () => {
    const fmtBytes = new Uint8Array([0xfa, 0xfa, 0xfa]);
    const fetchImpl = vi.fn(async () => Promise.resolve(new Response(fmtBytes, { status: 200 })));
    const engine = new SwiftLaTeXEngine({
      workerUrl: "/w.js",
      fmtUrl: "/x.fmt",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await engine.load();
    lastWorker!.emit({ cmd: "downloadFromCTAN", id: 0, filename: "swiftlatexpdftex.fmt" });
    await new Promise((r) => setTimeout(r, 0));
    const reply = lastWorker!.posted.find(
      (m): m is { cmd: string; id: number; result: Map<string, Uint8Array>; error: boolean } =>
        typeof m === "object" && m !== null && (m as { cmd: string }).cmd === "sendCTANFiles",
    );
    expect(reply).toBeDefined();
    expect(reply!.error).toBe(false);
    expect(reply!.result instanceof Map).toBe(true);
    const bytes = reply!.result.get("swiftlatexpdftex.fmt");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes!]).toEqual([...fmtBytes]);
    // fmtUrl was fetched once and the bytes are cached for later asks.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refreshes pdftex.map with map fragments from fetched CTAN packages", async () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(new Response(encode("% base pdftex.map\n"), { status: 200 })),
    );
    const fetcher = {
      fetchByFilename: vi.fn(async (n: string) =>
        n === "fontpkg.sty"
          ? [
              {
                filename: "fontpkg.map",
                path: "texmf-dist/fonts/map/dvips/fontpkg/fontpkg.map",
                content: encode("FontPkg-Regular <fontpkg.pfb\n"),
              },
              {
                filename: "fontpkg-dvipdfmx.map",
                path: "texmf-dist/fonts/map/dvipdfmx/fontpkg/fontpkg-dvipdfmx.map",
                content: encode("DvipdfmxOnly H fontpkg\n"),
              },
              {
                filename: "fontpkg.sty",
                path: "texmf-dist/tex/latex/fontpkg/fontpkg.sty",
                content: encode("\\endinput\n"),
              },
            ]
          : [],
      ),
      fetchPackage: vi.fn(),
    } as unknown as CtanFetcher;
    const engine = new SwiftLaTeXEngine({
      workerUrl: "/w.js",
      pdftexMapUrl: "/pdftex.map",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ctanFetcher: fetcher,
    });
    await engine.load();

    lastWorker!.emit({ cmd: "downloadFromCTAN", id: 7, filename: "fontpkg.sty" });
    await new Promise((r) => setTimeout(r, 0));

    const mapWrite = lastWorker!.posted.find(
      (m): m is { cmd: string; url: string; src: Uint8Array } =>
        typeof m === "object" &&
        m !== null &&
        (m as { cmd: string }).cmd === "writetexfile" &&
        (m as { url: string }).url === "pdftex.map",
    );
    expect(mapWrite).toBeDefined();
    expect(decode(mapWrite!.src)).toContain("% base pdftex.map");
    expect(decode(mapWrite!.src)).toContain("FontPkg-Regular <fontpkg.pfb");
    expect(decode(mapWrite!.src)).not.toContain("DvipdfmxOnly");

    lastWorker!.emit({ cmd: "downloadFromCTAN", id: 8, filename: "pdftex.map" });
    await new Promise((r) => setTimeout(r, 0));

    const reply = lastWorker!.posted.find(
      (m): m is { cmd: string; id: number; result: Map<string, Uint8Array>; error: boolean } =>
        typeof m === "object" &&
        m !== null &&
        (m as { cmd: string }).cmd === "sendCTANFiles" &&
        (m as { id: number }).id === 8,
    );
    expect(reply).toBeDefined();
    const pdftexMap = reply!.result.get("pdftex.map");
    expect(pdftexMap).toBeInstanceOf(Uint8Array);
    expect(decode(pdftexMap!)).toContain("FontPkg-Regular <fontpkg.pfb");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("ignores duplicate map fragments and non-font map files", async () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(new Response(encode("% base\n"), { status: 200 })),
    );
    const fetcher = {
      fetchByFilename: vi.fn(async () => [
        {
          filename: "plain.map",
          content: encode("PlainMap\n"),
        },
        {
          filename: "not-font.map",
          path: "texmf-dist/tex/latex/pkg/not-font.map",
          content: encode("NotFont\n"),
        },
        {
          filename: "fontpkg.map",
          path: "texmf-dist\\fonts\\map\\dvips\\fontpkg\\fontpkg.map",
          content: encode("FontPkg\n"),
        },
        {
          filename: "fontpkg.map",
          path: "texmf-dist/fonts/map/dvips/fontpkg/fontpkg.map",
          content: encode("FontPkgDuplicate\n"),
        },
      ]),
      fetchPackage: vi.fn(),
    } as unknown as CtanFetcher;
    const engine = new SwiftLaTeXEngine({
      workerUrl: "/w.js",
      pdftexMapUrl: "/pdftex.map",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ctanFetcher: fetcher,
    });
    await engine.load();

    lastWorker!.emit({ cmd: "downloadFromCTAN", id: 11, filename: "missing.sty" });
    await new Promise((r) => setTimeout(r, 0));

    const mapWrites = lastWorker!.posted.filter(
      (m): m is { cmd: string; url: string; src: Uint8Array } =>
        typeof m === "object" &&
        m !== null &&
        (m as { cmd: string }).cmd === "writetexfile" &&
        (m as { url: string }).url === "pdftex.map",
    );
    expect(mapWrites).toHaveLength(1);
  });

  it("forwards downloadFromCTAN requests to the fetcher and replies with a Map", async () => {
    const article = { filename: "article.cls", content: new Uint8Array([1, 2, 3]) };
    const sibling = { filename: "size10.clo", content: new Uint8Array([9, 9]) };
    const fetcher = {
      fetchByFilename: vi.fn(async (n: string) => (n === "article.cls" ? [sibling, article] : [])),
      fetchPackage: vi.fn(),
    } as unknown as CtanFetcher;
    const engine = new SwiftLaTeXEngine({
      workerUrl: "/w.js",
      ctanFetcher: fetcher,
    });
    await engine.load();

    lastWorker!.emit({ cmd: "downloadFromCTAN", id: 42, filename: "article.cls" });
    await new Promise((r) => setTimeout(r, 0));

    const reply = lastWorker!.posted.find(
      (m): m is { cmd: string; id: number; result: Map<string, Uint8Array>; error: boolean } =>
        typeof m === "object" && m !== null && (m as { cmd: string }).cmd === "sendCTANFiles",
    );
    expect(reply).toBeDefined();
    expect(reply!.id).toBe(42);
    expect(reply!.error).toBe(false);
    expect(reply!.result instanceof Map).toBe(true);
    // The requested file must be the *last* key in the Map - the
    // worker overwrites its texlive200_cache entry each iteration
    // so the last-seen file determines what kpse returns.
    const keys = [...reply!.result.keys()];
    expect(keys[keys.length - 1]).toBe("article.cls");
    // Siblings still land in the Map (and on disk) for future
    // lookups in the same package.
    expect(reply!.result.has("size10.clo")).toBe(true);
  });

  it("returns an implicit .tex package file under the worker's requested name", async () => {
    const runtimeData = {
      filename: "lipsum.ltd.tex",
      content: new Uint8Array([4, 2]),
    };
    const fetcher = {
      fetchByFilename: vi.fn(async () => [runtimeData]),
      fetchPackage: vi.fn(),
    } as unknown as CtanFetcher;
    const engine = new SwiftLaTeXEngine({
      workerUrl: "/w.js",
      ctanFetcher: fetcher,
    });
    await engine.load();

    lastWorker!.emit({ cmd: "downloadFromCTAN", id: 43, filename: "lipsum.ltd" });
    await new Promise((r) => setTimeout(r, 0));

    const reply = lastWorker!.posted.find(
      (
        message,
      ): message is {
        cmd: string;
        id: number;
        result: Map<string, Uint8Array>;
        error: boolean;
      } =>
        typeof message === "object" &&
        message !== null &&
        (message as { cmd: string }).cmd === "sendCTANFiles",
    );
    expect(reply).toBeDefined();
    expect([...reply!.result.keys()].at(-1)).toBe("lipsum.ltd");
    expect(reply!.result.get("lipsum.ltd")).toEqual(runtimeData.content);
  });

  it("replies with result: undefined when no fetcher is wired up", async () => {
    const engine = new SwiftLaTeXEngine({ workerUrl: "/w.js" });
    await engine.load();
    lastWorker!.emit({ cmd: "downloadFromCTAN", id: 9, filename: "article.cls" });
    await new Promise((r) => setTimeout(r, 0));
    const reply = lastWorker!.posted.find(
      (m): m is { cmd: string; id: number; result: unknown; error: boolean } =>
        typeof m === "object" && m !== null && (m as { cmd: string }).cmd === "sendCTANFiles",
    );
    // We tell the worker "we didn't find that" (result undefined,
    // error false) - the worker maps that to kpse returning 0,
    // which pdfTeX surfaces as its own "file not found" log entry.
    expect(reply?.result).toBeUndefined();
    expect(reply?.error).toBe(false);
  });

  it("replies with result: undefined when the CTAN fetcher throws", async () => {
    const fetcher = {
      fetchByFilename: vi.fn(async () => {
        throw new Error("network down");
      }),
      fetchPackage: vi.fn(),
    } as unknown as CtanFetcher;
    const engine = new SwiftLaTeXEngine({ workerUrl: "/w.js", ctanFetcher: fetcher });
    await engine.load();

    lastWorker!.emit({ cmd: "downloadFromCTAN", id: 10, filename: "article.cls" });
    await new Promise((r) => setTimeout(r, 0));

    const reply = lastWorker!.posted.find(
      (m): m is { cmd: string; id: number; result: unknown; error: boolean } =>
        typeof m === "object" && m !== null && (m as { id: number }).id === 10,
    );
    expect(reply?.result).toBeUndefined();
    expect(reply?.error).toBe(false);
  });

  it("replies with result: undefined when local fmt or pdftex.map assets cannot load", async () => {
    const fetchImpl = vi.fn(async () => Promise.resolve(new Response("missing", { status: 404 })));
    const engine = new SwiftLaTeXEngine({
      workerUrl: "/w.js",
      pdftexMapUrl: "/pdftex.map",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await engine.load();

    lastWorker!.emit({ cmd: "downloadFromCTAN", id: 12, filename: "swiftlatexpdftex.fmt" });
    lastWorker!.emit({ cmd: "downloadFromCTAN", id: 13, filename: "pdftex.map" });
    await new Promise((r) => setTimeout(r, 0));

    const replies = lastWorker!.posted.filter(
      (m): m is { cmd: string; id: number; result: unknown; error: boolean } =>
        typeof m === "object" && m !== null && (m as { cmd: string }).cmd === "sendCTANFiles",
    );
    expect(replies.find((r) => r.id === 12)?.result).toBeUndefined();
    expect(replies.find((r) => r.id === 13)?.result).toBeUndefined();
  });

  it("resolves compileLaTeX when the worker emits a compile reply", async () => {
    const engine = new SwiftLaTeXEngine({ workerUrl: "/w.js" });
    await engine.load();
    const promise = engine.compileLaTeX();
    lastWorker!.emit({
      cmd: "compile",
      result: "ok",
      log: "",
      status: 0,
      pdf: new Uint8Array([1]),
    });
    const reply = await promise;
    expect(reply.result).toBe("ok");
  });

  it("rejects a second compile while one is already in flight", async () => {
    const engine = new SwiftLaTeXEngine({ workerUrl: "/w.js" });
    await engine.load();

    const first = engine.compileLaTeX();
    await expect(engine.compileLaTeX()).rejects.toThrow(/already in flight/);
    engine.close();
    await expect(first).rejects.toThrow(/closed mid-compile/);
  });

  it("closes the worker cleanly and rejects a pending compile", async () => {
    const engine = new SwiftLaTeXEngine({ workerUrl: "/w.js" });
    await engine.load();
    const terminate = vi.spyOn(lastWorker!, "terminate");
    const pending = engine.compileLaTeX();

    engine.close();

    expect(lastWorker!.posted).toContainEqual({ cmd: "grace" });
    expect(terminate).toHaveBeenCalled();
    expect(engine.isReady()).toBe(false);
    await expect(pending).rejects.toThrow(/closed mid-compile/);
    engine.close();
  });

  it("still terminates when grace postMessage throws during close()", async () => {
    const engine = new SwiftLaTeXEngine({ workerUrl: "/w.js" });
    await engine.load();
    const terminate = vi.spyOn(lastWorker!, "terminate");
    vi.spyOn(lastWorker!, "postMessage").mockImplementation(() => {
      throw new Error("worker already gone");
    });

    engine.close();

    expect(terminate).toHaveBeenCalled();
  });

  it("rejects load() when the worker fires an error before ok", async () => {
    // Override the global to suppress the auto-ok so the test can
    // emit an error first.
    vi.stubGlobal("Worker", function CapturingWorker2(this: FakeWorker, url: string) {
      const w = new FakeWorker(url);
      lastWorker = w;
      return w;
    } as unknown as typeof Worker);
    // Build engine before any microtask fires the auto-ok.
    const engine = new SwiftLaTeXEngine({ workerUrl: "/w.js" });
    // Race: queue an error microtask *before* the FakeWorker's ok
    // microtask. We schedule via Promise.resolve so it runs first.
    void Promise.resolve().then(() => {
      lastWorker?.emitError("boom");
    });
    await expect(engine.load()).rejects.toThrow(/boom/);
  });

  it("rejects load() and terminates when the worker never handshakes", async () => {
    // A worker that loads but never posts `{ result: "ok" }` would
    // otherwise wedge the first compile forever.
    let terminated: FakeWorker | null = null;
    vi.stubGlobal("Worker", function SilentWorker(this: FakeWorker, url: string) {
      const w = Object.create(FakeWorker.prototype) as FakeWorker;
      // Bypass FakeWorker's auto-ok constructor: no handshake ever.
      Object.assign(w, {
        url,
        posted: [],
        msgListeners: new Set(),
        errListeners: new Set(),
      });
      w.terminate = () => {
        terminated = w;
      };
      lastWorker = w;
      return w;
    } as unknown as typeof Worker);

    const engine = new SwiftLaTeXEngine({ workerUrl: "/w.js", loadTimeoutMs: 10 });
    await expect(engine.load()).rejects.toThrow(/did not hand shake/);
    expect(terminated).not.toBeNull();
    expect(engine.isReady()).toBe(false);
  });

  it("rejects an inflight compile when the worker errors mid-compile", async () => {
    const engine = new SwiftLaTeXEngine({ workerUrl: "/w.js" });
    await engine.load();
    const pending = engine.compileLaTeX();
    // Worker crashes (Emscripten abort) instead of posting a
    // `cmd: "compile"` result.
    lastWorker!.emitError("aborted(). Build with -sASSERTIONS");
    await expect(pending).rejects.toThrow(/aborted/);
    // The engine should accept a new compile after the rejection,
    // i.e. inflight state was cleared.
    expect(() => engine.compileLaTeX()).not.toThrow();
  });
});
