import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { findMathRangeAt } from "./math-hover";

const state = (s: string) => EditorState.create({ doc: s });

describe("findMathRangeAt", () => {
  it("returns null in plain prose", () => {
    expect(findMathRangeAt(state("hello world"), 3)).toBeNull();
  });

  it("finds a single $...$ run containing the cursor", () => {
    const doc = "let $\\omega$ be";
    const r = findMathRangeAt(state(doc), 6); // inside the math
    expect(r).not.toBeNull();
    expect(r!.latex).toBe("\\omega");
    // The range spans from the opening $ to the closing $.
    expect(doc.slice(r!.from, r!.to + 1)).toBe("$\\omega$");
  });

  it("ignores cursors that sit outside any math run", () => {
    const doc = "before $x$ after";
    expect(findMathRangeAt(state(doc), 2)).toBeNull();
    expect(findMathRangeAt(state(doc), 12)).toBeNull();
  });

  it("distinguishes between adjacent math runs", () => {
    const doc = "$a$ middle $b$";
    expect(findMathRangeAt(state(doc), 1)?.latex).toBe("a");
    expect(findMathRangeAt(state(doc), 12)?.latex).toBe("b");
  });

  it("returns document offsets while scanning only the active line", () => {
    const doc = "first line\nthen $x + y$ here";
    const result = findMathRangeAt(state(doc), doc.indexOf("x + y") + 2);
    expect(result?.latex).toBe("x + y");
    expect(doc.slice(result!.from, result!.to + 1)).toBe("$x + y$");
  });

  it("does not count escaped \\$ as a delimiter", () => {
    const doc = "price \\$10 and $x$";
    const r = findMathRangeAt(state(doc), 16);
    expect(r?.latex).toBe("x");
  });

  it("returns null for an unterminated math run", () => {
    expect(findMathRangeAt(state("oops $\\omega no close"), 8)).toBeNull();
  });
});
