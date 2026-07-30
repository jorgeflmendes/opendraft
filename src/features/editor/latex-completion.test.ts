import type { CompletionContext } from "@codemirror/autocomplete";
import { describe, it, expect } from "vitest";
import { buildCompletions, latexCompletionSource } from "./latex-completion";

describe("buildCompletions", () => {
  it("emits a Completion entry per matched command", () => {
    const out = buildCompletions("\\al");
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) {
      expect(c.label.startsWith("\\al")).toBe(true);
    }
  });

  it("non-snippet entries set apply to the literal insert", () => {
    const out = buildCompletions("\\alpha");
    const alpha = out.find((c) => c.label === "\\alpha");
    // CodeMirror's Completion shape: { apply: string } for plain inserts.
    expect(alpha?.apply).toBe("\\alpha");
  });

  it("snippet entries do not expose apply as a plain string", () => {
    const out = buildCompletions("\\frac");
    const frac = out.find((c) => c.label === "\\frac");
    // snippetCompletion installs an `apply` function under the hood -
    // the value is not the literal template string.
    expect(typeof frac?.apply).not.toBe("string");
  });

  it("respects the limit", () => {
    expect(buildCompletions("", 5)).toHaveLength(5);
  });

  it("includes a category detail per entry", () => {
    const out = buildCompletions("\\omega");
    const omega = out.find((c) => c.label === "\\omega");
    expect(omega?.detail).toBe("greek");
  });
});

describe("latexCompletionSource", () => {
  it("returns null when there's no backslash pattern before cursor", () => {
    const mockContext = {
      matchBefore: () => null,
      explicit: false,
    } as unknown as CompletionContext;
    expect(latexCompletionSource(mockContext)).toBeNull();
  });

  it("returns null for bare cursor unless explicitly triggered", () => {
    const mockContext = {
      matchBefore: () => ({ from: 10, to: 10, text: "" }),
      explicit: false,
    } as unknown as CompletionContext;
    expect(latexCompletionSource(mockContext)).toBeNull();

    const explicitContext = {
      matchBefore: () => ({ from: 10, to: 10, text: "" }),
      explicit: true,
    } as unknown as CompletionContext;
    expect(latexCompletionSource(explicitContext)).not.toBeNull();
  });

  it("returns null if no completions matched", () => {
    const mockContext = {
      matchBefore: () => ({ from: 10, to: 15, text: "\\zzzzzz" }),
      explicit: false,
    } as unknown as CompletionContext;
    expect(latexCompletionSource(mockContext)).toBeNull();
  });

  it("returns completions when there is a match", () => {
    const mockContext = {
      matchBefore: () => ({ from: 10, to: 13, text: "\\al" }),
      explicit: false,
    } as unknown as CompletionContext;
    const result = latexCompletionSource(mockContext);
    expect(result).not.toBeNull();
    expect(result!.from).toBe(10);
    expect(result!.to).toBe(13);
    expect(result!.options.length).toBeGreaterThan(0);
  });
});
