import { describe, it, expect, beforeEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { parseRefContext, refCompletionSource } from "./ref-completion";
import { useLabelStore } from "./useLabelStore";
import type { Project } from "@/domain";

function makeContext(doc: string, pos: number, explicit = true): CompletionContext {
  return new CompletionContext(EditorState.create({ doc }), pos, explicit);
}

function mkProject(content: string): Project {
  return {
    id: "p-ref",
    name: "Ref",
    entry: "main.tex",
    files: {
      "main.tex": {
        id: "f-main",
        path: "main.tex",
        name: "main.tex",
        kind: "tex",
        content,
      },
    },
    folders: {},
    createdAt: "2026-05-22T12:00:00Z",
  };
}

beforeEach(() => useLabelStore.getState().reset());

describe("parseRefContext", () => {
  it("recognises \\ref and the cleveref family", () => {
    expect(parseRefContext("\\ref{")).not.toBeNull();
    expect(parseRefContext("\\eqref{e")).not.toBeNull();
    expect(parseRefContext("\\pageref{p")).not.toBeNull();
    expect(parseRefContext("\\autoref{")).not.toBeNull();
    expect(parseRefContext("\\cref{a,")).not.toBeNull();
    expect(parseRefContext("\\Cref{a")).not.toBeNull();
  });

  it("returns null after the closing brace", () => {
    expect(parseRefContext("\\ref{intro}")).toBeNull();
  });

  it("returns null when no ref command is in scope", () => {
    expect(parseRefContext("Plain text {with} braces")).toBeNull();
  });
});

describe("refCompletionSource", () => {
  it("returns null when the label store is empty", () => {
    const ctx = makeContext("\\ref{", 5);
    expect(refCompletionSource(ctx)).toBeNull();
  });

  it("returns null outside any ref command", () => {
    useLabelStore.getState().rebuild(mkProject("\\label{intro}"));
    const ctx = makeContext("plain text", 5);
    expect(refCompletionSource(ctx)).toBeNull();
  });

  it("suggests every label key for an empty prefix", () => {
    useLabelStore
      .getState()
      .rebuild(mkProject("\\label{intro}\n\\label{thm:main}\n\\label{conclusion}"));
    const ctx = makeContext("\\ref{", 5);
    const result = refCompletionSource(ctx)!;
    expect(result.options.map((o) => o.label)).toEqual(["intro", "thm:main", "conclusion"]);
  });

  it("filters by substring match (case-insensitive)", () => {
    useLabelStore.getState().rebuild(mkProject("\\label{thm:main}\n\\label{lem:helper}"));
    const doc = "\\ref{lem";
    const ctx = makeContext(doc, doc.length);
    const result = refCompletionSource(ctx)!;
    expect(result.options.map((o) => o.label)).toEqual(["lem:helper"]);
    expect(doc.slice(result.from, result.to)).toBe("lem");
  });

  it("completes the last comma-separated chunk for \\cref{a,b|}", () => {
    useLabelStore.getState().rebuild(mkProject("\\label{eq:a}\n\\label{eq:b}\n\\label{eq:c}"));
    const doc = "\\cref{eq:a, eq:c";
    const ctx = makeContext(doc, doc.length);
    const result = refCompletionSource(ctx)!;
    expect(result.options[0]!.label).toBe("eq:c");
  });

  it("deduplicates labels declared in multiple files", () => {
    const project: Project = {
      id: "p",
      name: "P",
      entry: "main.tex",
      files: {
        "a.tex": {
          id: "fa",
          path: "a.tex",
          name: "a.tex",
          kind: "tex",
          content: "\\label{dup}",
        },
        "b.tex": {
          id: "fb",
          path: "b.tex",
          name: "b.tex",
          kind: "tex",
          content: "\\label{dup}",
        },
      },
      folders: {},
      createdAt: "2026-05-22T12:00:00Z",
    };
    useLabelStore.getState().rebuild(project);
    const ctx = makeContext("\\ref{", 5);
    const result = refCompletionSource(ctx)!;
    expect(result.options.map((o) => o.label)).toEqual(["dup"]);
  });

  it("attaches the source path + line as the detail/info", () => {
    useLabelStore.getState().rebuild(mkProject("\n\n\\label{thm:1}"));
    const ctx = makeContext("\\ref{", 5);
    const result = refCompletionSource(ctx)!;
    expect(result.options[0]!.detail).toBe("main.tex");
    expect(result.options[0]!.info).toBe("main.tex:3");
  });
});
