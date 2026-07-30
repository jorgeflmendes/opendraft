import { describe, it, expect, vi } from "vitest";
import { buildEditorState, selectLanguage } from "./codemirror-setup";

describe("selectLanguage", () => {
  it("returns a non-empty extension for tex / sty / bib", () => {
    for (const kind of ["tex", "sty", "bib"] as const) {
      const ext = selectLanguage(kind);
      expect(ext, `kind=${kind}`).toBeTruthy();
    }
  });

  it("returns an empty extension array for kinds without a language mode", () => {
    for (const kind of ["md", "txt", "img", "other", "yml", undefined] as const) {
      const ext = selectLanguage(kind);
      expect(Array.isArray(ext) ? ext.length : 1, `kind=${kind}`).toBe(0);
    }
  });
});

describe("buildEditorState", () => {
  it("produces a state whose doc matches the input content", () => {
    const state = buildEditorState({
      content: "hello world",
      kind: "tex",
      onChange: () => {},
    });
    expect(state.doc.toString()).toBe("hello world");
  });

  it("preserves multi-line content", () => {
    const content = "\\section{One}\nLine two\nLine three\n";
    const state = buildEditorState({ content, kind: "tex", onChange: () => {} });
    expect(state.doc.toString()).toBe(content);
    expect(state.doc.lines).toBe(4);
  });

  it("works with an empty initial document", () => {
    const state = buildEditorState({ content: "", kind: undefined, onChange: () => {} });
    expect(state.doc.toString()).toBe("");
  });

  it("ignores the onChange callback at build time (only dispatched on transactions)", () => {
    const onChange = vi.fn();
    buildEditorState({ content: "x", kind: "tex", onChange });
    expect(onChange).not.toHaveBeenCalled();
  });
});
