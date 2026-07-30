import { describe, it, expect } from "vitest";
import { diffLines } from "./line-diff";

describe("diffLines", () => {
  it("returns no ops for two empty strings", () => {
    const { ops, stats } = diffLines("", "");
    expect(ops).toEqual([]);
    expect(stats).toEqual({ added: 0, removed: 0, context: 0 });
  });

  it("marks every line as 'equal' when both sides match", () => {
    const text = "alpha\nbeta\ngamma\n";
    const { ops, stats } = diffLines(text, text);
    expect(ops.map((o) => o.kind)).toEqual(["equal", "equal", "equal"]);
    expect(stats).toEqual({ added: 0, removed: 0, context: 3 });
  });

  it("captures pure insertion", () => {
    const { ops, stats } = diffLines("a\nc\n", "a\nb\nc\n");
    expect(ops.map((o) => `${o.kind}:${o.text}`)).toEqual(["equal:a", "insert:b", "equal:c"]);
    expect(stats).toEqual({ added: 1, removed: 0, context: 2 });
  });

  it("captures pure deletion", () => {
    const { ops, stats } = diffLines("a\nb\nc\n", "a\nc\n");
    expect(ops.map((o) => `${o.kind}:${o.text}`)).toEqual(["equal:a", "delete:b", "equal:c"]);
    expect(stats).toEqual({ added: 0, removed: 1, context: 2 });
  });

  it("captures a modification as a delete + insert pair", () => {
    const { ops, stats } = diffLines("hello\nworld\n", "hello\nthere\n");
    expect(ops.map((o) => `${o.kind}:${o.text}`)).toEqual([
      "equal:hello",
      "delete:world",
      "insert:there",
    ]);
    expect(stats).toEqual({ added: 1, removed: 1, context: 1 });
  });

  it("preserves correct line numbers on both sides", () => {
    const { ops } = diffLines("a\nb\nc\n", "a\nB\nC\nd\n");
    const summary = ops.map((o) => ({
      kind: o.kind,
      text: o.text,
      oldLine: o.oldLine,
      newLine: o.newLine,
    }));
    expect(summary).toEqual([
      { kind: "equal", text: "a", oldLine: 0, newLine: 0 },
      { kind: "delete", text: "b", oldLine: 1, newLine: undefined },
      { kind: "delete", text: "c", oldLine: 2, newLine: undefined },
      { kind: "insert", text: "B", oldLine: undefined, newLine: 1 },
      { kind: "insert", text: "C", oldLine: undefined, newLine: 2 },
      { kind: "insert", text: "d", oldLine: undefined, newLine: 3 },
    ]);
  });

  it("handles a wholly new file (no old content)", () => {
    const { ops, stats } = diffLines("", "one\ntwo\n");
    expect(ops.map((o) => `${o.kind}:${o.text}`)).toEqual(["insert:one", "insert:two"]);
    expect(stats).toEqual({ added: 2, removed: 0, context: 0 });
  });

  it("handles a wholly deleted file (no new content)", () => {
    const { ops, stats } = diffLines("one\ntwo\n", "");
    expect(ops.map((o) => `${o.kind}:${o.text}`)).toEqual(["delete:one", "delete:two"]);
    expect(stats).toEqual({ added: 0, removed: 2, context: 0 });
  });

  it("normalises CRLF so a Windows-edited file diffs cleanly against an LF original", () => {
    const lf = "a\nb\n";
    const crlf = "a\r\nb\r\n";
    const { ops, stats } = diffLines(lf, crlf);
    expect(ops.map((o) => o.kind)).toEqual(["equal", "equal"]);
    expect(stats.context).toBe(2);
  });

  it("treats trailing-newline presence vs. absence as equivalent", () => {
    const { stats } = diffLines("a\nb\n", "a\nb");
    expect(stats).toEqual({ added: 0, removed: 0, context: 2 });
  });

  it("rejects inputs that would allocate an excessive LCS table", () => {
    const large = Array.from({ length: 2_000 }, (_, index) => String(index)).join("\n");
    expect(() => diffLines(large, large)).toThrow("File too large for inline diff");
  });
});
