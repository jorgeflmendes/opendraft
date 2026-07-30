import { describe, it, expect } from "vitest";
import { insertAtCursor, offsetFromLineCol } from "./insert-at-cursor";

describe("offsetFromLineCol", () => {
  it("returns col-1 for line 1", () => {
    expect(offsetFromLineCol("hello", 1, 1)).toBe(0);
    expect(offsetFromLineCol("hello", 1, 3)).toBe(2);
  });

  it("walks past newlines to later lines", () => {
    const doc = "ab\ncd\nefg";
    expect(offsetFromLineCol(doc, 2, 1)).toBe(3);
    expect(offsetFromLineCol(doc, 3, 2)).toBe(7);
  });

  it("clamps to end of line when col overruns", () => {
    const doc = "ab\ncd\nefg";
    expect(offsetFromLineCol(doc, 1, 99)).toBe(2);
    expect(offsetFromLineCol(doc, 2, 99)).toBe(5);
  });

  it("clamps to end of content when line overruns", () => {
    const doc = "ab\ncd";
    expect(offsetFromLineCol(doc, 99, 1)).toBe(5);
  });
});

describe("insertAtCursor", () => {
  it("splices text at the requested position and reports the offset", () => {
    const result = insertAtCursor("hello world", 1, 7, "X");
    expect(result.next).toBe("hello Xworld");
    expect(result.insertedAt).toBe(6);
  });

  it("works at the very start of the document", () => {
    const result = insertAtCursor("rest", 1, 1, ">>");
    expect(result.next).toBe(">>rest");
    expect(result.insertedAt).toBe(0);
  });

  it("works at the end of a line", () => {
    const result = insertAtCursor("line1\nline2", 1, 99, "!");
    expect(result.next).toBe("line1!\nline2");
  });

  it("inserts a multi-line block correctly", () => {
    const result = insertAtCursor("ab\ncd", 2, 1, "X\nY\n");
    expect(result.next).toBe("ab\nX\nY\ncd");
  });
});
