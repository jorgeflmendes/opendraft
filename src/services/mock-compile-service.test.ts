import { describe, it, expect, vi } from "vitest";
import type { Project } from "@/domain";
import { MockCompileService, analyseSource } from "./mock-compile-service";

const mkProject = (entryContent: string, entry = "main.tex"): Project => ({
  id: "p-x",
  name: "X",
  entry,
  files: {
    [entry]: {
      id: `p-x-${entry}`,
      path: entry,
      name: entry,
      kind: "tex",
      content: entryContent,
    },
  },
  folders: {},
  createdAt: "2026-05-22T12:00:00Z",
});

describe("analyseSource", () => {
  it("clean source produces no issues", () => {
    const { errors, warnings } = analyseSource(
      "main.tex",
      "\\begin{document}\nHi\n\\end{document}\n",
    );
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("detects an unclosed environment", () => {
    const { errors } = analyseSource("main.tex", "\\begin{equation}\nx=1\n");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/Unclosed.*equation/);
    expect(errors[0]?.line).toBe(1);
  });

  it("detects a mismatched environment", () => {
    const { errors } = analyseSource("main.tex", "\\begin{equation}\nx=1\n\\end{align}\n");
    expect(errors.some((e) => /Mismatched/i.test(e.message))).toBe(true);
  });

  it("detects \\end without a matching \\begin", () => {
    const { errors } = analyseSource("main.tex", "\\end{document}\n");
    expect(errors.some((e) => /without matching/i.test(e.message))).toBe(true);
  });

  it("emits a warning for each \\todo marker", () => {
    const { warnings } = analyseSource(
      "main.tex",
      "\\begin{document}\n\\todo{fix me}\n\\todo{later}\n\\end{document}\n",
    );
    expect(warnings).toHaveLength(2);
    expect(warnings[0]?.message).toMatch(/fix me/);
    expect(warnings[0]?.line).toBe(2);
  });

  it("emits an error for each \\error marker", () => {
    const { errors } = analyseSource("main.tex", "\\error{boom}\n");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("boom");
  });
});

describe("MockCompileService", () => {
  const svc = new MockCompileService({ stepDelayMs: 0 });

  it("returns success for clean source", async () => {
    const result = await svc.compile({
      project: mkProject("\\begin{document}\nhi\n\\end{document}\n"),
    });
    expect(result.status).toBe("success");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.engine).toBe("Local preview engine");
  });

  it("returns warning when only TODOs are present", async () => {
    const result = await svc.compile({
      project: mkProject("\\begin{document}\n\\todo{later}\n\\end{document}\n"),
    });
    expect(result.status).toBe("warning");
    expect(result.log.some((l) => l.level === "warn")).toBe(true);
  });

  it("returns error when source has problems", async () => {
    const result = await svc.compile({
      project: mkProject("\\begin{document}\n\\end{align}\n"),
    });
    expect(result.status).toBe("error");
    expect(result.log.some((l) => l.level === "error")).toBe(true);
  });

  it("emits progress for every step", async () => {
    const onProgress = vi.fn();
    await svc.compile(
      { project: mkProject("\\begin{document}\nhi\n\\end{document}\n") },
      { onProgress },
    );
    expect(onProgress.mock.calls.length).toBeGreaterThan(1);
    const last = onProgress.mock.calls[onProgress.mock.calls.length - 1]?.[0];
    expect(last?.total).toBeGreaterThan(0);
  });

  it("compiles against an edits overlay when provided", async () => {
    const project = mkProject("\\begin{document}\nhi\n\\end{document}\n");
    const result = await svc.compile({
      project,
      edits: { "main.tex": "\\end{document}\n" },
    });
    // Overlay introduces an unmatched end -> error.
    expect(result.status).toBe("error");
  });

  it("resolves with idle status when aborted mid-flight", async () => {
    const slow = new MockCompileService({ stepDelayMs: 50 });
    const ctrl = new AbortController();
    const promise = slow.compile(
      { project: mkProject("\\begin{document}\nhi\n\\end{document}\n") },
      { signal: ctrl.signal },
    );
    setTimeout(() => ctrl.abort(), 10);
    const result = await promise;
    expect(result.status).toBe("idle");
    expect(result.log.some((l) => /cancelled/i.test(l.message))).toBe(true);
  });
});
