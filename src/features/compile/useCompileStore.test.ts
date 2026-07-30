/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Project } from "@/domain";
import { useCompileStore } from "./useCompileStore";
import {
  MockCompileService,
  setCompileService,
  type CompileInput,
  type CompileProgress,
} from "@/services";

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

describe("useCompileStore", () => {
  beforeEach(() => {
    setCompileService(new MockCompileService({ stepDelayMs: 0 }));
    useCompileStore.getState().reset();
  });
  afterEach(() => {
    setCompileService(null);
  });

  it("starts idle with no result", () => {
    const s = useCompileStore.getState();
    expect(s.status).toBe("idle");
    expect(s.result).toBeNull();
    expect(s.progress).toBeNull();
    expect(s.compiledInput).toBeNull();
  });

  it("transitions to compiling then to success for a clean project", async () => {
    const project = mkProject("\\begin{document}\nhi\n\\end{document}\n");
    await useCompileStore.getState().compile({ project });
    const s = useCompileStore.getState();
    expect(s.status).toBe("success");
    expect(s.result?.status).toBe("success");
    expect(s.progress).toBeNull();
    expect(s.compiledInput?.project).toBe(project);
  });

  it("captures warning + error outcomes from the service", async () => {
    await useCompileStore.getState().compile({
      project: mkProject("\\begin{document}\n\\todo{later}\n\\end{document}\n"),
    });
    expect(useCompileStore.getState().status).toBe("warning");

    await useCompileStore.getState().compile({
      project: mkProject("\\end{document}\n"),
    });
    expect(useCompileStore.getState().status).toBe("error");
  });

  it("emits progress updates while compiling", async () => {
    const slow = new MockCompileService({ stepDelayMs: 5 });
    setCompileService(slow);
    const project = mkProject("\\begin{document}\nhi\n\\end{document}\n");

    let sawCompiling = false;
    const unsub = useCompileStore.subscribe((state) => {
      if (state.status === "compiling") sawCompiling = true;
    });
    await useCompileStore.getState().compile({ project });
    unsub();
    expect(sawCompiling).toBe(true);
  });

  it("cancel() drops an in-flight compile and goes back to idle", async () => {
    const slow = new MockCompileService({ stepDelayMs: 50 });
    setCompileService(slow);
    const project = mkProject("\\begin{document}\nhi\n\\end{document}\n");
    const promise = useCompileStore.getState().compile({ project });
    useCompileStore.getState().cancel();
    await promise;
    expect(useCompileStore.getState().status).toBe("idle");
  });

  it("a second compile cancels the first one's progress", async () => {
    const slow = new MockCompileService({ stepDelayMs: 30 });
    setCompileService(slow);
    const project = mkProject("\\begin{document}\nhi\n\\end{document}\n");
    const first = useCompileStore.getState().compile({ project });
    const second = useCompileStore.getState().compile({ project });
    await Promise.all([first, second]);
    expect(useCompileStore.getState().status).toBe("success");
  });

  it("reset() clears every field", async () => {
    await useCompileStore.getState().compile({
      project: mkProject("\\begin{document}\nhi\n\\end{document}\n"),
    });
    useCompileStore.getState().reset();
    const s = useCompileStore.getState();
    expect(s.status).toBe("idle");
    expect(s.result).toBeNull();
    expect(s.progress).toBeNull();
  });

  it("cancel() and reset() are harmless when nothing is running", () => {
    useCompileStore.getState().cancel();
    useCompileStore.getState().reset();

    expect(useCompileStore.getState()).toMatchObject({
      status: "idle",
      result: null,
      progress: null,
    });
  });

  it("surfaces service throws as an error result", async () => {
    setCompileService({
      compile: () => Promise.reject(new Error("engine offline")),
    });
    await useCompileStore.getState().compile({
      project: mkProject("\\begin{document}\nhi\n\\end{document}\n"),
    });
    expect(useCompileStore.getState().status).toBe("error");
    expect(useCompileStore.getState().result?.log[0]?.message).toBe("engine offline");
  });

  it("surfaces non-Error service throws as strings", async () => {
    setCompileService({
      compile: () => Promise.reject("engine string failure"),
    });

    await useCompileStore.getState().compile({
      project: mkProject("\\begin{document}\nhi\n\\end{document}\n"),
    });

    expect(useCompileStore.getState().status).toBe("error");
    expect(useCompileStore.getState().result?.log[0]?.message).toBe("engine string failure");
  });

  it("keeps the previous engine label when a later service call throws", async () => {
    await useCompileStore.getState().compile({
      project: mkProject("\\begin{document}\nhi\n\\end{document}\n"),
    });
    const previousEngine = useCompileStore.getState().result?.engine;
    setCompileService({
      compile: () => Promise.reject(new Error("next compile failed")),
    });

    await useCompileStore.getState().compile({
      project: mkProject("\\begin{document}\nbye\n\\end{document}\n"),
    });

    expect(useCompileStore.getState().result?.engine).toBe(previousEngine);
  });

  it("drops progress and errors from a compile cancelled before rejection", async () => {
    let onProgress: ((progress: CompileProgress) => void) | undefined;
    let rejectCompile: ((reason?: unknown) => void) | undefined;
    setCompileService({
      compile: (_input: CompileInput, options?: { onProgress?: (p: CompileProgress) => void }) =>
        new Promise((_, reject) => {
          onProgress = options?.onProgress;
          rejectCompile = reject;
          onProgress?.({ label: "first", index: 0, total: 2 });
        }),
    } as never);

    const compile = useCompileStore.getState().compile({
      project: mkProject("\\begin{document}\nhi\n\\end{document}\n"),
    });
    await Promise.resolve();
    expect(useCompileStore.getState().progress?.label).toBe("first");

    useCompileStore.getState().cancel();
    onProgress?.({ label: "late", index: 1, total: 2 });
    rejectCompile?.(new Error("late failure"));
    await compile;

    expect(useCompileStore.getState()).toMatchObject({ status: "idle", progress: null });
    expect(useCompileStore.getState().result).toBeNull();
  });

  it("reset() aborts a running compile and ignores its eventual result", async () => {
    let resolveCompile: (() => void) | undefined;
    setCompileService({
      compile: () =>
        new Promise((resolve) => {
          resolveCompile = () =>
            resolve({
              status: "success",
              engine: "late engine",
              log: [],
            });
        }),
    } as never);

    const compile = useCompileStore.getState().compile({
      project: mkProject("\\begin{document}\nhi\n\\end{document}\n"),
    });
    await Promise.resolve();
    useCompileStore.getState().reset();
    resolveCompile?.();
    await compile;

    expect(useCompileStore.getState()).toMatchObject({
      status: "idle",
      result: null,
      progress: null,
    });
  });
});

describe("project switches reset compile state", () => {
  beforeEach(() => {
    setCompileService(new MockCompileService({ stepDelayMs: 0 }));
  });
  afterEach(() => setCompileService(null));

  it("openProject resets the compile store", async () => {
    const { useProjectsStore } = await import("@/features/projects/useProjectsStore");
    await useCompileStore.getState().compile({
      project: mkProject("\\begin{document}\nhi\n\\end{document}\n"),
    });
    expect(useCompileStore.getState().result).not.toBeNull();
    await useProjectsStore.getState().openProject("p-stokes-notes-v3");
    expect(useCompileStore.getState().result).toBeNull();
    expect(useCompileStore.getState().status).toBe("idle");
  });

  it("reset drops everything", () => {
    // Manually set some state first
    useCompileStore.setState({
      status: "success",
      result: { status: "success", log: [], engine: "test" } as unknown as any,
      progress: { label: "test", index: 1, total: 2 },
      synctex: { pageCount: 1, forward: () => [], reverse: () => null, pageRecords: () => [] },
      compiledInput: { project: {} as unknown as any },
    });

    useCompileStore.getState().reset();

    expect(useCompileStore.getState().status).toBe("idle");
    expect(useCompileStore.getState().result).toBeNull();
    expect(useCompileStore.getState().progress).toBeNull();
    expect(useCompileStore.getState().synctex).toBeNull();
    expect(useCompileStore.getState().compiledInput).toBeNull();
  });
});
