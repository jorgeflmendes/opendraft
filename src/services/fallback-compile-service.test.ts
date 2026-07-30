import { describe, expect, it, vi } from "vitest";
import type { CompileResult, Project } from "@/domain";
import type { CompileService } from "./compile-service";
import {
  FallbackCompileService,
  shouldFallbackForMissingRuntimeFile,
} from "./fallback-compile-service";

const project: Project = {
  id: "fallback-test",
  name: "Fallback",
  entry: "main.tex",
  files: {
    "main.tex": {
      id: "main",
      path: "main.tex",
      name: "main.tex",
      kind: "tex",
      content: "\\documentclass{article}",
    },
  },
  folders: {},
  createdAt: "2026-06-12T00:00:00Z",
};

function service(result: CompileResult): CompileService & { compile: ReturnType<typeof vi.fn> } {
  return { compile: vi.fn(async () => result) };
}

describe("FallbackCompileService", () => {
  it("retries when the primary engine cannot load a LaTeX runtime file", async () => {
    const primary = service({
      status: "error",
      engine: "BusyTeX",
      log: [{ level: "error", message: "LaTeX Error: File `mathtools.sty' not found." }],
    });
    const fallback = service({
      status: "success",
      engine: "SwiftLaTeX",
      log: [{ level: "info", message: "Compiled" }],
      pdf: new Uint8Array([1]),
    });
    const compiler = new FallbackCompileService(
      primary,
      fallback,
      shouldFallbackForMissingRuntimeFile,
    );

    const result = await compiler.compile({ project });

    expect(fallback.compile).toHaveBeenCalledOnce();
    expect(result.status).toBe("success");
    expect(result.log[0]?.message).toMatch(/retried with swiftlatex/i);
    expect(result.log.some((entry) => /mathtools/.test(entry.message))).toBe(false);
  });

  it("does not retry syntax errors or missing project source files", async () => {
    for (const message of [
      "Undefined control sequence.",
      "LaTeX Error: File `chapter.tex' not found.",
    ]) {
      const primary = service({
        status: "error",
        log: [{ level: "error", message }],
      });
      const fallback = service({ status: "success", log: [] });
      const compiler = new FallbackCompileService(
        primary,
        fallback,
        shouldFallbackForMissingRuntimeFile,
      );

      const result = await compiler.compile({ project });

      expect(result).toBe(await primary.compile.mock.results[0]?.value);
      expect(fallback.compile).not.toHaveBeenCalled();
    }
  });

  it("surfaces the fallback error first when the fallback engine also fails", async () => {
    const primary = service({
      status: "error",
      engine: "BusyTeX",
      log: [{ level: "error", message: "File 'physics.sty' not found." }],
    });
    const fallback = service({
      status: "error",
      engine: "SwiftLaTeX",
      log: [{ level: "error", message: "Cannot run piped system commands." }],
    });
    const compiler = new FallbackCompileService(
      primary,
      fallback,
      shouldFallbackForMissingRuntimeFile,
    );

    const result = await compiler.compile({ project });
    const messages = result.log.map((entry) => entry.message);

    expect(messages[0]).toBe(
      "Retried with SwiftLaTeX after the primary engine could not load a runtime file.",
    );
    expect(messages[1]).toBe("Cannot run piped system commands.");
    expect(messages.join("\n")).toMatch(/primary engine \(BusyTeX\) failed before fallback/);
    expect(messages.join("\n")).toMatch(/physics\.sty/);
  });
});
