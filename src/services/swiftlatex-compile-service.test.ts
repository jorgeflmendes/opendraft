import { describe, it, expect, vi } from "vitest";
import type { Project } from "@/domain";
import { SwiftLaTeXCompileService, parseEngineLog } from "./swiftlatex-compile-service";
import type { SwiftLaTeXEngine } from "./swiftlatex-engine";

// Tests use a stub SwiftLaTeXEngine; jsdom can't run the real
// Worker + WASM, and we want deterministic behaviour anyway.

const mkProject = (entryContent: string): Project => ({
  id: "p-x",
  name: "X",
  entry: "main.tex",
  files: {
    "main.tex": {
      id: "p-x-main",
      path: "main.tex",
      name: "main.tex",
      kind: "tex",
      content: entryContent,
    },
  },
  folders: {},
  createdAt: "2026-05-22T12:00:00Z",
});

interface StubBag {
  loadCalls: number;
  writes: Array<{ path: string; src: string | Uint8Array }>;
  folders: string[];
  mainFile: string | null;
  compileCalls: number;
  closeCalls: number;
}

const makeStub = (
  response:
    | { result: "ok"; pdf: Uint8Array; log: string; status: number }
    | { result: "failed"; log: string; status: number },
  bag: StubBag = {
    loadCalls: 0,
    writes: [],
    folders: [],
    mainFile: null,
    compileCalls: 0,
    closeCalls: 0,
  },
) => {
  let ready = false;
  const engine = {
    async load(): Promise<void> {
      bag.loadCalls++;
      ready = true;
    },
    isReady: (): boolean => ready,
    writeMemFSFile(path: string, src: string | Uint8Array): void {
      bag.writes.push({ path, src });
    },
    makeMemFSFolder(path: string): void {
      bag.folders.push(path);
    },
    setEngineMainFile(path: string): void {
      bag.mainFile = path;
    },
    flushCache(): void {},
    setTexliveEndpoint(): void {},
    async compileLaTeX() {
      bag.compileCalls++;
      return { cmd: "compile", ...response };
    },
    close(): void {
      bag.closeCalls++;
      ready = false;
    },
  } as unknown as SwiftLaTeXEngine;
  return { engine, bag };
};

describe("SwiftLaTeXCompileService", () => {
  it("loads the engine on first compile only", async () => {
    const { engine, bag } = makeStub({
      result: "ok",
      pdf: new Uint8Array([1, 2, 3]),
      log: "",
      status: 0,
    });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });

    await svc.compile({ project: mkProject("hi") });
    await svc.compile({ project: mkProject("hi") });
    expect(bag.loadCalls).toBe(1);
    expect(bag.compileCalls).toBe(2);
  });

  it("creates a fresh engine for every compile when isolation is enabled", async () => {
    const bags: StubBag[] = [];
    const factory = vi.fn(() => {
      const created = makeStub({
        result: "ok",
        pdf: new Uint8Array([1]),
        log: "",
        status: 0,
      });
      bags.push(created.bag);
      return created.engine;
    });
    const svc = new SwiftLaTeXCompileService({
      createEngine: factory,
      freshEnginePerCompile: true,
    });

    await svc.compile({ project: mkProject("first") });
    await svc.compile({ project: mkProject("second") });

    expect(factory).toHaveBeenCalledTimes(2);
    expect(bags.map((bag) => bag.closeCalls)).toEqual([1, 1]);
  });

  it("writes every project file to the engine MemFS", async () => {
    const { engine, bag } = makeStub({
      result: "ok",
      pdf: new Uint8Array(),
      log: "",
      status: 0,
    });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });
    const project = mkProject("hi");
    project.files["chapters/intro.tex"] = {
      id: "p-x-intro",
      path: "chapters/intro.tex",
      name: "intro.tex",
      kind: "tex",
      content: "intro",
    };
    await svc.compile({ project });
    const paths = bag.writes.map((w) => w.path);
    expect(paths).toContain("main.tex");
    expect(paths).toContain("chapters/intro.tex");
    expect(bag.folders).toContain("chapters");
    expect(bag.mainFile).toBe("main.tex");
  });

  it("prefers the in-memory edit overlay over the project's content", async () => {
    const { engine, bag } = makeStub({
      result: "ok",
      pdf: new Uint8Array(),
      log: "",
      status: 0,
    });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });
    await svc.compile({
      project: mkProject("from project"),
      edits: { "main.tex": "from edit" },
    });
    const mainWrite = bag.writes.find((w) => w.path === "main.tex");
    expect(mainWrite?.src).toBe("from edit");
  });

  it("writes files that exist only in the edit overlay (newly created, unsaved)", async () => {
    const { engine, bag } = makeStub({
      result: "ok",
      pdf: new Uint8Array(),
      log: "",
      status: 0,
    });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });
    await svc.compile({
      project: mkProject("\\input{sections/new.tex}"),
      edits: { "sections/new.tex": "brand new content" },
    });
    const newWrite = bag.writes.find((w) => w.path === "sections/new.tex");
    expect(newWrite?.src).toBe("brand new content");
    expect(bag.folders).toContain("sections");
  });

  it("generates a serverless bbl for classic bibliography commands", async () => {
    const { engine, bag } = makeStub({
      result: "ok",
      pdf: new Uint8Array(),
      log: "",
      status: 0,
    });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });
    const project = mkProject("\\cite{paper}\\bibliography{refs}");
    project.files["refs.bib"] = {
      id: "refs",
      path: "refs.bib",
      name: "refs.bib",
      kind: "bib",
      content: "@article{paper, author={A. Author}, title={Serverless BibTeX}, year={2026}}",
    };

    const result = await svc.compile({ project });

    const bblWrite = bag.writes.find((write) => write.path === "main.bbl");
    expect(bblWrite?.src).toContain("\\bibitem{paper}");
    expect(result.status).toBe("success");
    expect(result.log.some((entry) => /Generated main\.bbl/.test(entry.message))).toBe(true);
  });

  it("surfaces missing bibliography databases as warnings without blocking pdfTeX", async () => {
    const { engine, bag } = makeStub({
      result: "ok",
      pdf: new Uint8Array(),
      log: "",
      status: 0,
    });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });

    const result = await svc.compile({ project: mkProject("\\bibliography{missing}") });

    expect(bag.writes.find((write) => write.path === "main.bbl")?.src).toContain(
      "\\begin{thebibliography}",
    );
    expect(result.status).toBe("warning");
    expect(result.log.some((entry) => /database 'missing' was not found/.test(entry.message))).toBe(
      true,
    );
  });

  it("returns success with PDF bytes for a clean compile", async () => {
    const pdfBytes = new Uint8Array([37, 80, 68, 70]); // "%PDF"
    const { engine } = makeStub({ result: "ok", pdf: pdfBytes, log: "", status: 0 });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });
    const result = await svc.compile({ project: mkProject("hi") });
    expect(result.status).toBe("success");
    expect(result.pdf).toStrictEqual(pdfBytes);
    expect(result.engine).toMatch(/pdfTeX/);
  });

  it("runs extra pdfTeX passes until cross-reference warnings settle", async () => {
    const responses = [
      {
        result: "ok" as const,
        pdf: new Uint8Array([1]).buffer,
        log: "LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.",
        status: 0,
      },
      {
        result: "ok" as const,
        pdf: new Uint8Array([2]).buffer,
        log: "",
        status: 0,
      },
    ];
    let ready = false;
    const engine = {
      async load(): Promise<void> {
        ready = true;
      },
      isReady: (): boolean => ready,
      writeMemFSFile(): void {},
      makeMemFSFolder(): void {},
      setEngineMainFile(): void {},
      async compileLaTeX() {
        return { cmd: "compile", ...responses.shift()! };
      },
      close(): void {},
    } as unknown as SwiftLaTeXEngine;
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });
    const progress = vi.fn();

    const result = await svc.compile({ project: mkProject("hi") }, { onProgress: progress });

    expect(result.status).toBe("success");
    expect(result.pdf).toStrictEqual(new Uint8Array([2]));
    expect(result.log.some((l) => /after 2 pdfTeX passes/.test(l.message))).toBe(true);
    expect(progress).toHaveBeenCalledWith({
      label: "Running pdfTeX (pass 2/5)",
      index: 3,
      total: 8,
    });
  });

  it("returns a serverless compatibility error before booting unsupported workflows", async () => {
    const factory = vi.fn(
      () => makeStub({ result: "ok", pdf: new Uint8Array(), log: "", status: 0 }).engine,
    );
    const svc = new SwiftLaTeXCompileService({ createEngine: factory });
    const result = await svc.compile({ project: mkProject("\\usepackage{fontspec}") });

    expect(result.status).toBe("error");
    expect(result.log[0]?.message).toMatch(/fontspec/);
    expect(factory).not.toHaveBeenCalled();
  });

  it("returns idle when aborted before the engine boots", async () => {
    const factory = vi.fn(
      () => makeStub({ result: "ok", pdf: new Uint8Array(), log: "", status: 0 }).engine,
    );
    const svc = new SwiftLaTeXCompileService({ createEngine: factory });
    const signal = AbortSignal.abort();

    const result = await svc.compile({ project: mkProject("hi") }, { signal });

    expect(result.status).toBe("idle");
    expect(result.log[0]?.message).toMatch(/cancelled/i);
    expect(factory).not.toHaveBeenCalled();
  });

  it("returns idle when aborted before the first pdfTeX pass", async () => {
    const abort = new AbortController();
    let ready = false;
    const engine = {
      async load(): Promise<void> {
        ready = true;
      },
      isReady: (): boolean => ready,
      writeMemFSFile(): void {},
      makeMemFSFolder(): void {},
      setEngineMainFile(): void {
        abort.abort();
      },
      async compileLaTeX() {
        throw new Error("should not compile");
      },
      close(): void {},
    } as unknown as SwiftLaTeXEngine;
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });

    const result = await svc.compile({ project: mkProject("hi") }, { signal: abort.signal });

    expect(result.status).toBe("idle");
    expect(result.log[0]?.message).toMatch(/cancelled/i);
  });

  it("adds a convergence warning when maxPasses is reached", async () => {
    const { engine, bag } = makeStub({
      result: "ok",
      pdf: new Uint8Array([1]),
      log: "LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.",
      status: 0,
    });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine, maxPasses: 2 });

    const result = await svc.compile({ project: mkProject("hi") });

    expect(bag.compileCalls).toBe(2);
    expect(result.status).toBe("warning");
    expect(result.log.some((l) => /Stopped after 2 pdfTeX passes/.test(l.message))).toBe(true);
  });

  it("flips status to warning when the log carries a LaTeX Warning", async () => {
    const { engine } = makeStub({
      result: "ok",
      pdf: new Uint8Array(),
      log: "LaTeX Warning: Reference `foo' undefined on input line 7.",
      status: 0,
    });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });
    const result = await svc.compile({ project: mkProject("hi") });
    expect(result.status).toBe("warning");
    expect(result.log.some((l) => l.level === "warn")).toBe(true);
  });

  it("returns error and parses the pdfTeX-style error", async () => {
    const log = "! Undefined control sequence.\nl.14 \\omegaa\n";
    const { engine } = makeStub({ result: "failed", log, status: 1 });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });
    const result = await svc.compile({ project: mkProject("hi") });
    expect(result.status).toBe("error");
    expect(result.log.some((l) => l.level === "error" && l.line === 14)).toBe(true);
    expect(result.pdf).toBeUndefined();
  });

  it("surfaces engine load failures as an error CompileResult", async () => {
    const factory = () =>
      ({
        async load() {
          throw new Error("worker missing");
        },
        isReady: () => false,
      }) as unknown as SwiftLaTeXEngine;
    const svc = new SwiftLaTeXCompileService({ createEngine: factory });
    const result = await svc.compile({ project: mkProject("hi") });
    expect(result.status).toBe("error");
    expect(result.log[0]?.message).toMatch(/worker missing/);
  });

  it("rebuilds the engine after a load failure", async () => {
    const healthy = makeStub({
      result: "ok",
      pdf: new Uint8Array([1]),
      log: "",
      status: 0,
    });
    const brokenClose = vi.fn();
    const factory = vi
      .fn()
      .mockReturnValueOnce({
        async load() {
          throw new Error("worker missing");
        },
        isReady: () => false,
        close: brokenClose,
      } as unknown as SwiftLaTeXEngine)
      .mockReturnValueOnce(healthy.engine);
    const svc = new SwiftLaTeXCompileService({ createEngine: factory });

    expect((await svc.compile({ project: mkProject("first") })).status).toBe("error");
    expect((await svc.compile({ project: mkProject("second") })).status).toBe("success");
    expect(factory).toHaveBeenCalledTimes(2);
    expect(brokenClose).toHaveBeenCalledOnce();
  });

  it("surfaces non-Error engine failures as strings", async () => {
    const factory = () =>
      ({
        async load() {
          throw "worker missing";
        },
        isReady: () => false,
      }) as unknown as SwiftLaTeXEngine;
    const svc = new SwiftLaTeXCompileService({ createEngine: factory });

    const result = await svc.compile({ project: mkProject("hi") });

    expect(result.status).toBe("error");
    expect(result.log[0]?.message).toBe("Engine failed to load: worker missing");
  });

  it("surfaces compile-pass exceptions through the engine error path", async () => {
    let ready = false;
    const engine = {
      async load(): Promise<void> {
        ready = true;
      },
      isReady: (): boolean => ready,
      writeMemFSFile(): void {},
      makeMemFSFolder(): void {},
      setEngineMainFile(): void {},
      async compileLaTeX() {
        throw new Error("pdfTeX crashed");
      },
      close(): void {},
    } as unknown as SwiftLaTeXEngine;
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });

    const result = await svc.compile({ project: mkProject("hi") });

    expect(result.status).toBe("error");
    expect(result.log[0]?.message).toMatch(/pdfTeX crashed/);
  });

  it("handles a missing worker compile response", async () => {
    const { engine } = makeStub({ result: "ok", pdf: new Uint8Array(), log: "", status: 0 });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine, maxPasses: 0 });

    const result = await svc.compile({ project: mkProject("hi") });

    expect(result.status).toBe("error");
    expect(result.log[0]?.message).toMatch(/No pdfTeX response/);
  });

  it("falls back to a generic message when a failed compile has no log", async () => {
    const { engine } = makeStub({ result: "failed", log: "", status: 1 });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });

    const result = await svc.compile({ project: mkProject("hi") });

    expect(result.status).toBe("error");
    expect(result.log[0]?.message).toBe("Compile failed (no log)");
  });

  it("falls back to the tail of unparsed failed logs", async () => {
    const longLog = `${"noise\n".repeat(260)}bare runtime failure`;
    const { engine } = makeStub({ result: "failed", log: longLog, status: 1 });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });

    const result = await svc.compile({ project: mkProject("hi") });

    expect(result.status).toBe("error");
    expect(result.log[0]?.message).not.toBe(longLog.trimEnd());
    expect(result.log[0]?.message).toContain("bare runtime failure");
  });

  it("emits progress events for every step", async () => {
    const { engine } = makeStub({
      result: "ok",
      pdf: new Uint8Array(),
      log: "",
      status: 0,
    });
    const svc = new SwiftLaTeXCompileService({ createEngine: () => engine });
    const onProgress = vi.fn();
    await svc.compile({ project: mkProject("hi") }, { onProgress });
    expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe("parseEngineLog", () => {
  it("returns an empty array for empty input", () => {
    expect(parseEngineLog("", "main.tex")).toEqual([]);
  });

  it("extracts pdfTeX errors with their line number", () => {
    const log = "! Undefined control sequence.\nl.14 \\omegaa\nrest";
    const out = parseEngineLog(log, "main.tex");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      level: "error",
      message: "Undefined control sequence.",
      filePath: "main.tex",
      line: 14,
    });
  });

  it("extracts LaTeX warnings with input-line numbers", () => {
    const log = "LaTeX Warning: Reference `foo' undefined on input line 7.";
    const out = parseEngineLog(log, "main.tex");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ level: "warn", line: 7 });
  });

  it("extracts package warnings too", () => {
    const log = "Package amsmath Warning: Using empty `\\\\' on input line 3.";
    const out = parseEngineLog(log, "main.tex");
    expect(out[0]?.level).toBe("warn");
  });

  it("extracts engine-level pdfTeX errors without a line marker", () => {
    const out = parseEngineLog("!pdfTeX error:  (file cmr10): Font not found", "main.tex");
    expect(out[0]).toMatchObject({
      level: "error",
      message: "(file cmr10): Font not found",
      filePath: "main.tex",
    });
    expect(out[0]).not.toHaveProperty("line");
  });

  it("extracts fatal and crash footers as errors", () => {
    const out = parseEngineLog(
      "==> Fatal error occurred, no output PDF file produced!\nEngine crashed: abort",
      "main.tex",
    );
    expect(out.map((entry) => entry.message)).toEqual([
      "Fatal error occurred, no output PDF file produced!",
      "Engine crashed: abort",
    ]);
  });

  it("extracts warnings without an input-line number", () => {
    const out = parseEngineLog("LaTeX Warning: There were undefined references.", "main.tex");
    expect(out[0]).toMatchObject({
      level: "warn",
      message: "LaTeX: There were undefined references",
      filePath: "main.tex",
    });
    expect(out[0]).not.toHaveProperty("line");
  });
});
