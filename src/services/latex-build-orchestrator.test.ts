import { describe, it, expect, vi } from "vitest";
import { runLatexBuild, latexLogRequestsRerun, combineLatexLogs } from "./latex-build-orchestrator";

describe("latexLogRequestsRerun", () => {
  it("detects rerun patterns", () => {
    expect(latexLogRequestsRerun("Rerun to get cross-references right.")).toBe(true);
    expect(latexLogRequestsRerun("No file main.aux")).toBe(true);
    expect(latexLogRequestsRerun("All good here")).toBe(false);
  });
});

describe("combineLatexLogs", () => {
  it("combines logs with double newlines", () => {
    expect(combineLatexLogs(["a", "b"])).toBe("a\n\nb");
    expect(combineLatexLogs(["a", "", "b"])).toBe("a\n\nb");
  });
});

describe("runLatexBuild", () => {
  it("runs until stable", async () => {
    const runPass = vi
      .fn()
      .mockResolvedValueOnce({
        result: "ok",
        log: "Rerun to get cross-references right",
        status: 0,
        pdf: new ArrayBuffer(0),
      })
      .mockResolvedValueOnce({ result: "ok", log: "All good", status: 0, pdf: new ArrayBuffer(0) });

    const result = await runLatexBuild({ runPass });
    expect(result.stopReason).toBe("stable");
    expect(result.passCount).toBe(2);
    expect(runPass).toHaveBeenCalledTimes(2);
  });

  it("stops on failure", async () => {
    const runPass = vi.fn().mockResolvedValue({ result: "failed", log: "Error", status: 1 });
    const result = await runLatexBuild({ runPass });
    expect(result.stopReason).toBe("failed");
    expect(result.passCount).toBe(1);
  });

  it("stops at max passes", async () => {
    const runPass = vi.fn().mockResolvedValue({
      result: "ok",
      log: "Rerun to get cross-references right",
      status: 0,
      pdf: new ArrayBuffer(0),
    });
    const result = await runLatexBuild({ runPass, maxPasses: 2 });
    expect(result.stopReason).toBe("max-passes");
    expect(result.passCount).toBe(2);
  });

  it("aborts when signal is aborted initially", async () => {
    const abortController = new AbortController();
    abortController.abort();
    const runPass = vi.fn();
    const result = await runLatexBuild({ runPass, signal: abortController.signal });
    expect(result.stopReason).toBe("aborted");
    expect(runPass).not.toHaveBeenCalled();
  });

  it("aborts via abort controller and Promise.race", async () => {
    const abortController = new AbortController();
    const runPass = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(
          () => resolve({ result: "ok", log: "Slow", status: 0, pdf: new ArrayBuffer(0) }),
          100,
        );
      });
    });

    const buildPromise = runLatexBuild({ runPass, signal: abortController.signal });
    setTimeout(() => abortController.abort(), 10);
    await expect(buildPromise).rejects.toThrow("Compile cancelled");
  });

  it("stops and returns aborted if signal aborted after pass finishes", async () => {
    const abortController = new AbortController();
    const runPass = vi.fn().mockImplementation(() => {
      // Abort after resolving via microtask
      queueMicrotask(() => abortController.abort());
      return Promise.resolve({
        result: "ok",
        log: "Rerun to get cross-references right",
        status: 0,
        pdf: new ArrayBuffer(0),
      });
    });

    const result = await runLatexBuild({ runPass, signal: abortController.signal });
    expect(result.stopReason).toBe("aborted");
  });

  it("calls onProgress with pass number", async () => {
    const onProgress = vi.fn();
    const runPass = vi.fn().mockResolvedValue({
      result: "ok",
      log: "Done",
      status: 0,
      pdf: new ArrayBuffer(0),
    });

    await runLatexBuild({ runPass, onProgress });
    expect(onProgress).toHaveBeenCalledWith({
      label: "Running pdfTeX (pass 1/5)",
      index: 0,
      total: 5,
    });
  });
});
