import { describe, it, expect, beforeEach } from "vitest";
import { useLabelStore } from "./useLabelStore";
import type { Project } from "@/domain";

function mkProject(files: Record<string, string>): Project {
  return {
    id: "p-lab",
    name: "Lab",
    entry: "main.tex",
    files: Object.fromEntries(
      Object.entries(files).map(([p, content]) => [
        p,
        {
          id: `f-${p}`,
          path: p,
          name: p.split("/").pop()!,
          kind: p.endsWith(".bib") ? ("bib" as const) : ("tex" as const),
          content,
        },
      ]),
    ),
    folders: {},
    createdAt: "2026-05-22T12:00:00Z",
  };
}

beforeEach(() => useLabelStore.getState().reset());

describe("useLabelStore", () => {
  it("starts empty", () => {
    expect(useLabelStore.getState().labels).toEqual([]);
  });

  it("indexes labels with 1-based line numbers per file in path order", () => {
    useLabelStore.getState().rebuild(
      mkProject({
        "main.tex": "\\label{intro}\n\\label{thm:main}",
        "chapters/m.tex": "\n\\label{lem:1}",
      }),
    );
    const labels = useLabelStore.getState().labels;
    expect(labels.map((l) => [l.path, l.key, l.line])).toEqual([
      ["chapters/m.tex", "lem:1", 2],
      ["main.tex", "intro", 1],
      ["main.tex", "thm:main", 2],
    ]);
  });

  it("ignores labels inside comment-only lines", () => {
    useLabelStore.getState().rebuild(
      mkProject({
        "main.tex": "% \\label{ignored}\n\\label{real}",
      }),
    );
    expect(useLabelStore.getState().labels.map((l) => l.key)).toEqual(["real"]);
  });

  it("skips .bib files", () => {
    useLabelStore.getState().rebuild(mkProject({ "refs.bib": "% \\label{should-not-appear}" }));
    expect(useLabelStore.getState().labels).toEqual([]);
  });

  it("keeps the existing index when only bibliography sources change", () => {
    const project = mkProject({ "main.tex": "\\label{stable}", "refs.bib": "before" });
    useLabelStore.getState().rebuild(project);
    const labels = useLabelStore.getState().labels;

    useLabelStore.getState().rebuild(project, { "refs.bib": "after" });

    expect(useLabelStore.getState().labels).toBe(labels);
  });

  it("honours the edits overlay so unsaved buffers contribute", () => {
    const project = mkProject({ "main.tex": "\\label{old}" });
    useLabelStore.getState().rebuild(project, { "main.tex": "\\label{fresh}" });
    expect(useLabelStore.getState().labels.map((l) => l.key)).toEqual(["fresh"]);
  });

  it("captures multiple labels on a single line", () => {
    useLabelStore.getState().rebuild(mkProject({ "main.tex": "\\label{a} text \\label{b}" }));
    expect(useLabelStore.getState().labels.map((l) => l.key)).toEqual(["a", "b"]);
  });
});
