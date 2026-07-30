import { describe, it, expect, beforeEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { citeCompletionSource, parseCiteContext } from "./cite-completion";
import { useBibStore } from "./useBibStore";
import type { Project } from "@/domain";

function mkProject(bib: string): Project {
  return {
    id: "p-cite",
    name: "Cite",
    entry: "main.tex",
    files: {
      "refs.bib": {
        id: "f-bib",
        path: "refs.bib",
        name: "refs.bib",
        kind: "bib",
        content: bib,
      },
    },
    folders: {},
    createdAt: "2026-05-22T12:00:00Z",
  };
}

function makeContext(doc: string, pos: number, explicit = true): CompletionContext {
  const state = EditorState.create({ doc });
  return new CompletionContext(state, pos, explicit);
}

beforeEach(() => {
  useBibStore.getState().reset();
});

describe("parseCiteContext", () => {
  it("returns null outside any cite command", () => {
    expect(parseCiteContext("Just some text")).toBeNull();
  });

  it("recognises the classic \\cite{ family", () => {
    expect(parseCiteContext("\\cite{")).not.toBeNull();
    expect(parseCiteContext("\\citep{a")).not.toBeNull();
    expect(parseCiteContext("\\citet{")).not.toBeNull();
    expect(parseCiteContext("\\citeauthor{ab")).not.toBeNull();
  });

  it("recognises the biblatex variants", () => {
    expect(parseCiteContext("\\parencite{x")).not.toBeNull();
    expect(parseCiteContext("\\textcite{")).not.toBeNull();
    expect(parseCiteContext("\\autocite*{")).not.toBeNull();
  });

  it("returns null once the closing brace is reached", () => {
    expect(parseCiteContext("\\cite{key}")).toBeNull();
  });

  it("captures the inside text up to the cursor", () => {
    const ctx = parseCiteContext("\\cite{alpha,bet");
    expect(ctx?.inside).toBe("alpha,bet");
  });
});

describe("citeCompletionSource", () => {
  it("returns null when bib store is empty", () => {
    const ctx = makeContext("\\cite{", 6);
    expect(citeCompletionSource(ctx)).toBeNull();
  });

  it("returns null when the cursor isn't inside a cite command", () => {
    useBibStore.getState().rebuild(mkProject("@article{x, title={X}}"));
    const ctx = makeContext("Hello world", 5);
    expect(citeCompletionSource(ctx)).toBeNull();
  });

  it("suggests every bib key for an empty prefix", () => {
    useBibStore
      .getState()
      .rebuild(mkProject("@article{alpha, title={A}}\n@article{beta, title={B}}"));
    const ctx = makeContext("\\cite{", 6);
    const result = citeCompletionSource(ctx)!;
    expect(result.options.map((o) => o.label)).toEqual(["alpha", "beta"]);
    expect(result.from).toBe(6);
    expect(result.to).toBe(6);
  });

  it("filters by substring match (case-insensitive)", () => {
    useBibStore
      .getState()
      .rebuild(mkProject("@article{alpha2024, title={A}}\n@article{omega2025, title={O}}"));
    const doc = "\\cite{omeg";
    const ctx = makeContext(doc, doc.length);
    const result = citeCompletionSource(ctx)!;
    expect(result.options.map((o) => o.label)).toEqual(["omega2025"]);
    expect(result.from).toBe(6);
    expect(result.to).toBe(10);
  });

  it("completes the last comma-separated chunk only", () => {
    useBibStore
      .getState()
      .rebuild(mkProject("@article{alpha, title={A}}\n@article{beta, title={B}}"));
    const doc = "\\cite{alpha, be";
    const ctx = makeContext(doc, doc.length);
    const result = citeCompletionSource(ctx)!;
    expect(result.options.map((o) => o.label)).toEqual(["beta"]);
    expect(doc.slice(result.from, result.to)).toBe("be");
  });

  it("works inside the biblatex \\parencite as well", () => {
    useBibStore.getState().rebuild(mkProject("@article{alpha, title={A}}"));
    const doc = "\\parencite{alp";
    const ctx = makeContext(doc, doc.length);
    const result = citeCompletionSource(ctx)!;
    expect(result.options[0]!.label).toBe("alpha");
  });

  it("attaches the entry summary as the info field", () => {
    useBibStore
      .getState()
      .rebuild(mkProject("@article{x, title={A title}, author={Smith, Alice}, year={2024}}"));
    const ctx = makeContext("\\cite{", 6);
    const result = citeCompletionSource(ctx)!;
    expect(result.options[0]!.info).toContain("A title");
  });
});
