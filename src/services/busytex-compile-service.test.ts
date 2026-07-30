import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/domain";
import {
  BusyTexCompileService,
  buildBusyTexOptions,
  busyTexDataPackageUrls,
  detectBusyTexEngine,
} from "./busytex-compile-service";

const mkProject = (entryContent: string): Project => ({
  id: "p-busy",
  name: "Busy",
  entry: "main.tex",
  files: {
    "main.tex": {
      id: "main",
      path: "main.tex",
      name: "main.tex",
      kind: "tex",
      content: entryContent,
    },
  },
  folders: {},
  createdAt: "2026-05-23T12:00:00Z",
});

function makeRunner() {
  let initialized = false;
  return {
    initialize: vi.fn(async () => {
      initialized = true;
    }),
    isInitialized: vi.fn(() => initialized),
    terminate: vi.fn(() => {
      initialized = false;
    }),
  };
}

function okResult(log = "") {
  return {
    success: true,
    pdf: new Uint8Array([37, 80, 68, 70]),
    log,
    exitCode: 0,
    logs: [],
  };
}

describe("BusyTexCompileService", () => {
  it("runs BusyTeX with real BibTeX, MakeIndex, reruns, and all project files", async () => {
    const runner = makeRunner();
    const compile = vi.fn(async (_options: unknown) => okResult());
    const toolFactory = vi.fn(() => ({ compile }));
    const svc = new BusyTexCompileService({
      createRunner: () => runner,
      createTool: toolFactory,
      remoteEndpoint: "/ctan",
    });
    const project = mkProject(
      "\\makeindex\\begin{document}\\cite{paper}\\printindex\\bibliographystyle{plain}\\bibliography{refs}\\end{document}",
    );
    project.files["refs.bib"] = {
      id: "refs",
      path: "refs.bib",
      name: "refs.bib",
      kind: "bib",
      content: "@article{paper,title={Real BibTeX},author={A. Author},year={2026}}",
    };

    const result = await svc.compile({ project });

    expect(runner.initialize).toHaveBeenCalledWith(true);
    expect(toolFactory).toHaveBeenCalledWith(runner, "xelatex");
    expect(compile).toHaveBeenCalledWith(
      expect.objectContaining({
        input: project.files["main.tex"]?.content,
        mainTexPath: "main.tex",
        bibtex: true,
        makeindex: true,
        rerun: true,
        remoteEndpoint: "/ctan",
        driver: "xetex_bibtex8_dvipdfmx",
      }),
    );
    const compileOptions = compile.mock.calls[0]![0] as { additionalFiles: unknown[] };
    expect(compileOptions.additionalFiles).toContainEqual({
      path: "refs.bib",
      content: project.files["refs.bib"]?.content,
    });
    expect(result.status).toBe("success");
    expect(result.pdf).toStrictEqual(new Uint8Array([37, 80, 68, 70]));
    expect(result.engine).toContain("BusyTeX");
  });

  it("never sends soft-deleted source files to the compiler", async () => {
    const runner = makeRunner();
    const compile = vi.fn(async (_options: unknown) => okResult());
    const svc = new BusyTexCompileService({
      createRunner: () => runner,
      createTool: () => ({ compile }),
    });
    const project = mkProject("\\begin{document}safe\\end{document}");
    project.files["deleted.tex"] = {
      id: "deleted",
      path: "deleted.tex",
      name: "deleted.tex",
      kind: "tex",
      content: "must not compile",
      deletedAt: "2026-07-30T00:00:00.000Z",
    };

    await svc.compile({
      project,
      edits: { "deleted.tex": "an unsaved deleted draft must not compile either" },
    });

    const options = compile.mock.calls[0]![0] as {
      additionalFiles: Array<{ path: string; content: unknown }>;
    };
    expect(options.additionalFiles.map((file) => file.path)).not.toContain("deleted.tex");
  });

  it("preloads declared CTAN package files into the BusyTeX remote filesystem", async () => {
    const runner = {
      ...makeRunner(),
      writeTexliveRemoteFiles: vi.fn(async () => undefined),
    };
    const remoteFiles = [
      { name: "algorithm.sty", format: 26, content: new Uint8Array([1]) },
      { name: "algorithmic.sty", format: 26, content: new Uint8Array([2]) },
    ];
    const runtimeFileResolver = {
      resolveDeclared: vi.fn(async () => remoteFiles),
      resolveMissing: vi.fn(async () => []),
    };
    const svc = new BusyTexCompileService({
      createRunner: () => runner,
      createTool: () => ({ compile: vi.fn(async () => okResult()) }),
      runtimeFileResolver,
    });
    const project = mkProject("\\usepackage{algorithm,algorithmic}");

    const result = await svc.compile({ project });

    expect(result.status).toBe("success");
    expect(runtimeFileResolver.resolveDeclared).toHaveBeenCalledWith(project, undefined);
    expect(runner.writeTexliveRemoteFiles).toHaveBeenCalledWith(remoteFiles);
  });

  it("loads a runtime file reported missing by TeX and retries in the same engine", async () => {
    const runner = {
      ...makeRunner(),
      writeTexliveRemoteFiles: vi.fn(async () => undefined),
    };
    const missingFiles = [{ name: "dependency.sty", format: 26, content: new Uint8Array([3]) }];
    const runtimeFileResolver = {
      resolveDeclared: vi.fn(async () => []),
      resolveMissing: vi.fn(async () => missingFiles),
    };
    const compile = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        log: "LaTeX Error: File `dependency.sty' not found.",
        exitCode: 1,
        logs: [],
      })
      .mockResolvedValueOnce(okResult());
    const svc = new BusyTexCompileService({
      createRunner: () => runner,
      createTool: () => ({ compile }),
      runtimeFileResolver,
    });

    const result = await svc.compile({ project: mkProject("\\usepackage{dependency}") });

    expect(result.status).toBe("success");
    expect(compile).toHaveBeenCalledTimes(2);
    expect(runtimeFileResolver.resolveMissing).toHaveBeenCalledWith(
      expect.stringMatching(/dependency\.sty/),
    );
    expect(runner.writeTexliveRemoteFiles).toHaveBeenCalledWith(missingFiles);
  });

  it("chooses XeLaTeX by default over pdfLaTeX to ensure proper font embedding", () => {
    expect(detectBusyTexEngine(mkProject("\\documentclass{article}"), undefined)).toBe("xelatex");
  });

  it("chooses LuaLaTeX for Lua program magic and Lua-only packages", () => {
    expect(detectBusyTexEngine(mkProject("% !TEX program = lualatex\nhi"), undefined)).toBe(
      "lualatex",
    );
    expect(detectBusyTexEngine(mkProject("\\RequirePackage{luacode}"), undefined)).toBe("lualatex");
  });

  it("only honours TeX program magic from the root document", () => {
    const project = mkProject("\\documentclass{article}\\input{chapter}");
    project.files["chapter.tex"] = {
      id: "chapter",
      path: "chapter.tex",
      name: "chapter.tex",
      kind: "tex",
      content: "% !TEX program = pdflatex\nChapter",
    };

    expect(detectBusyTexEngine(project, undefined)).toBe("xelatex");
  });

  it("passes edited entry content and new overlay files to BusyTeX", async () => {
    const project = mkProject("from project");
    const options = await buildBusyTexOptions(
      project,
      { "main.tex": "from edit", "chapters/intro.tex": "\\section{Intro}" },
      "xelatex",
      "/ctan",
    );

    expect(options.input).toBe("from edit");
    expect(options.additionalFiles).toContainEqual({
      path: "chapters/intro.tex",
      content: "\\section{Intro}",
    });
  });

  it("adds virtual .tex aliases for extensionless inputs that point at .sty files", async () => {
    const project = mkProject("\\input{preamble}");
    project.files["preamble.sty"] = {
      id: "preamble",
      path: "preamble.sty",
      name: "preamble.sty",
      kind: "sty",
      content: "\\newcommand{\\x}{x}",
    };

    const options = await buildBusyTexOptions(project, undefined, "xelatex", "/ctan");

    expect(options.additionalFiles).toContainEqual({
      path: "preamble.tex",
      content: "\\newcommand{\\x}{x}",
    });
  });

  it("adds a default BibTeX style in the virtual input when classic BibTeX omits one", async () => {
    const options = await buildBusyTexOptions(
      mkProject("\\cite{paper}\\bibliography{refs}"),
      undefined,
      "xelatex",
      "/ctan",
    );

    expect(options.input).toContain("\\bibliographystyle{plain}\n\\bibliography{refs}");
  });

  it("keeps explicit bibliography styles untouched", async () => {
    const input = "\\bibliographystyle{abbrv}\\bibliography{refs}";
    const options = await buildBusyTexOptions(mkProject(input), undefined, "xelatex", "/ctan");

    expect(options.input).toBe(input);
  });

  it("builds stable BusyTeX data package URLs from the asset base path", () => {
    expect(busyTexDataPackageUrls("/core/busytex/")).toEqual({
      basic: "/core/busytex/texlive-basic.js",
      recommended: "/core/busytex/texlive-recommended.js",
      extra: "/core/busytex/texlive-extra.js",
    });
  });

  it("blocks biber-dependent biblatex before booting the WASM engine", async () => {
    const runner = makeRunner();
    const svc = new BusyTexCompileService({ createRunner: () => runner });

    const result = await svc.compile({
      project: mkProject("\\usepackage{biblatex}\\addbibresource{refs.bib}"),
    });

    expect(result.status).toBe("error");
    expect(result.log[0]?.message).toMatch(/biber/);
    expect(runner.initialize).not.toHaveBeenCalled();
  });

  it("allows biblatex when the project explicitly selects a BibTeX backend", async () => {
    const runner = makeRunner();
    const compile = vi.fn(async (_options: unknown) => okResult());
    const svc = new BusyTexCompileService({
      createRunner: () => runner,
      createTool: () => ({ compile }),
    });

    const result = await svc.compile({
      project: mkProject("\\usepackage[backend=bibtex]{biblatex}\\addbibresource{refs.bib}"),
    });

    expect(result.status).toBe("success");
    const compileOptions = compile.mock.calls[0]![0] as { bibtex: boolean };
    expect(compileOptions.bibtex).toBe(true);
  });

  it("does not run BibTeX for biber-style biblatex inputs", async () => {
    const options = await buildBusyTexOptions(
      mkProject("\\usepackage{biblatex}\\addbibresource{refs.bib}\\printbibliography"),
      undefined,
      "xelatex",
      "/ctan",
    );

    expect(options.bibtex).toBe(false);
  });

  it("returns warning when BusyTeX succeeds with LaTeX warnings", async () => {
    const runner = makeRunner();
    const svc = new BusyTexCompileService({
      createRunner: () => runner,
      createTool: () => ({
        compile: vi.fn(async (_options: unknown) =>
          okResult("LaTeX Warning: Reference `foo' undefined on input line 7."),
        ),
      }),
    });

    const result = await svc.compile({ project: mkProject("hi") });

    expect(result.status).toBe("warning");
    expect(result.log.some((entry) => entry.level === "warn" && entry.line === 7)).toBe(true);
  });

  it("returns parsed errors when BusyTeX fails", async () => {
    const runner = makeRunner();
    const svc = new BusyTexCompileService({
      createRunner: () => runner,
      createTool: () => ({
        compile: vi.fn(async (_options: unknown) => ({
          success: false,
          log: "! Undefined control sequence.\nl.9 \\bad",
          exitCode: 1,
          logs: [],
        })),
      }),
    });

    const result = await svc.compile({ project: mkProject("\\bad") });

    expect(result.status).toBe("error");
    expect(result.log[0]).toMatchObject({ level: "error", line: 9 });
    expect(result.pdf).toBeUndefined();
  });

  it("disposes the runner after a failed compile so the next call gets a fresh one", async () => {
    const runner1 = makeRunner();
    const runner2 = makeRunner();
    const runners = [runner1, runner2];
    let made = 0;
    const compile = vi.fn(async (_options: unknown) => ({
      success: false,
      log: "! Undefined control sequence.\nl.1 \\bad",
      exitCode: 1,
      logs: [],
    }));
    const svc = new BusyTexCompileService({
      createRunner: () => runners[made++]!,
      createTool: () => ({ compile }),
    });

    await svc.compile({ project: mkProject("\\bad") });
    await svc.compile({ project: mkProject("\\bad") });

    expect(runner1.terminate).toHaveBeenCalled();
    expect(made).toBe(2);
  });

  it("disposes the runner after every compile when freshRunnerPerCompile is set", async () => {
    const runners = [makeRunner(), makeRunner()];
    let made = 0;
    const svc = new BusyTexCompileService({
      freshRunnerPerCompile: true,
      createRunner: () => runners[made++]!,
      createTool: () => ({ compile: vi.fn(async () => okResult()) }),
    });

    const r1 = await svc.compile({ project: mkProject("hi") });
    const r2 = await svc.compile({ project: mkProject("hi") });
    expect(r1.status).toBe("success");
    expect(r2.status).toBe("success");
    expect(runners[0]!.terminate).toHaveBeenCalled();
    expect(made).toBe(2);
  });

  it("serialises overlapping compile calls - the second waits for the first", async () => {
    const runner = makeRunner();
    const order: string[] = [];
    let resolveFirst: ((value: ReturnType<typeof okResult>) => void) | null = null;
    const compile = vi.fn(async (opts: unknown) => {
      const tag = (opts as { mainTexPath: string }).mainTexPath;
      order.push(`start:${tag}`);
      if (tag === "main.tex" && !resolveFirst) {
        // Block the first compile until we hand-resolve it. The
        // second compile must not start until then.
        return new Promise<ReturnType<typeof okResult>>((resolve) => {
          resolveFirst = resolve;
        }).then((value) => {
          order.push(`end:${tag}`);
          return value;
        });
      }
      order.push(`end:${tag}`);
      return okResult();
    });
    const svc = new BusyTexCompileService({
      createRunner: () => runner,
      createTool: () => ({ compile }),
    });

    const p1 = svc.compile({ project: mkProject("first") });
    const p2 = svc.compile({ project: mkProject("second") });

    // Yield a tick - if serialisation works, only the first compile
    // has started, the second is still queued.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(order).toEqual(["start:main.tex"]);

    resolveFirst!(okResult());
    await Promise.all([p1, p2]);
    expect(order[order.length - 1]).toBe("end:main.tex");
    expect(order).toContain("start:main.tex");
    // Both compiles finished; second one started AFTER first ended.
    const firstEnd = order.indexOf("end:main.tex");
    const secondStart = order.lastIndexOf("start:main.tex");
    expect(secondStart).toBeGreaterThan(firstEnd);
  });

  it("isolates a thrown error so the next queued compile still runs", async () => {
    const runners = [makeRunner(), makeRunner()];
    let made = 0;
    let call = 0;
    const compile = vi.fn(async () => {
      call++;
      if (call === 1) throw new Error("worker exploded");
      return okResult();
    });
    const svc = new BusyTexCompileService({
      createRunner: () => runners[made++]!,
      createTool: () => ({ compile }),
    });

    const first = await svc.compile({ project: mkProject("a") });
    const second = await svc.compile({ project: mkProject("b") });

    expect(first.status).toBe("error");
    expect(first.log[0]?.message).toMatch(/worker exploded/);
    expect(second.status).toBe("success");
    // The error path tore down runner #1 and the second compile
    // built a fresh runner #2.
    expect(runners[0]!.terminate).toHaveBeenCalled();
    expect(made).toBe(2);
  });

  it("swallows terminate() errors during disposal so a subsequent compile still works", async () => {
    const exploding = {
      initialize: vi.fn(async () => {}),
      isInitialized: vi.fn(() => true),
      terminate: vi.fn(() => {
        throw new Error("worker already gone");
      }),
    };
    const next = makeRunner();
    const runners = [exploding, next];
    let made = 0;
    let call = 0;
    const compile = vi.fn(async () => {
      call++;
      if (call === 1) throw new Error("bad");
      return okResult();
    });
    const svc = new BusyTexCompileService({
      createRunner: () => runners[made++]!,
      createTool: () => ({ compile }),
    });
    const r1 = await svc.compile({ project: mkProject("hi") });
    const r2 = await svc.compile({ project: mkProject("hi") });
    expect(r1.status).toBe("error");
    expect(r2.status).toBe("success");
    expect(exploding.terminate).toHaveBeenCalled();
  });

  it("reports an init failure with disposal so the next call rebuilds the runner", async () => {
    const failing = {
      initialize: vi.fn(async () => {
        throw new Error("wasm fetch died");
      }),
      isInitialized: vi.fn(() => false),
      terminate: vi.fn(),
    };
    const next = makeRunner();
    const runners = [failing, next];
    let made = 0;
    const svc = new BusyTexCompileService({
      createRunner: () => runners[made++]!,
      createTool: () => ({ compile: vi.fn(async () => okResult()) }),
    });
    const r1 = await svc.compile({ project: mkProject("hi") });
    expect(r1.status).toBe("error");
    expect(r1.log[0]?.message).toMatch(/wasm fetch died/);

    const r2 = await svc.compile({ project: mkProject("hi") });
    expect(r2.status).toBe("success");
    expect(made).toBe(2);
  });

  it("terminates the runner and returns idle when cancelled during compilation", async () => {
    const runner = makeRunner();
    const abort = new AbortController();
    const svc = new BusyTexCompileService({
      createRunner: () => runner,
      createTool: () => ({
        compile: vi.fn(
          (_options: unknown) =>
            new Promise<ReturnType<typeof okResult>>((resolve) => {
              abort.abort();
              setTimeout(() => resolve(okResult()), 20);
            }),
        ),
      }),
    });

    const result = await svc.compile({ project: mkProject("hi") }, { signal: abort.signal });

    expect(result.status).toBe("idle");
    expect(runner.terminate).toHaveBeenCalled();
  });
});
