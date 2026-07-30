import { describe, it, expect } from "vitest";
import { findInProject } from "./find-in-files";
import type { Project } from "@/domain";

function mkProject(files: Record<string, string>): Project {
  return {
    id: "p-find",
    name: "Find",
    entry: "main.tex",
    files: Object.fromEntries(
      Object.entries(files).map(([p, content]) => [
        p,
        {
          id: `f-${p}`,
          path: p,
          name: p.split("/").pop()!,
          kind: p.endsWith(".tex")
            ? ("tex" as const)
            : p.endsWith(".bib")
              ? ("bib" as const)
              : ("other" as const),
          content,
        },
      ]),
    ),
    folders: {},
    createdAt: "2026-05-22T12:00:00Z",
  };
}

describe("findInProject", () => {
  it("returns an empty list when the query is empty", () => {
    const project = mkProject({ "main.tex": "anything" });
    expect(findInProject(project, "")).toEqual([]);
  });

  it("does not search soft-deleted files or their stale edits", () => {
    const project = mkProject({ "main.tex": "visible", "deleted.tex": "private needle" });
    project.files["deleted.tex"]!.deletedAt = "2026-07-30T00:00:00.000Z";

    expect(findInProject(project, "needle", { edits: { "deleted.tex": "edited needle" } })).toEqual(
      [],
    );
  });

  it("groups hits by file, reporting 1-based line numbers and column ranges", () => {
    const project = mkProject({
      "main.tex": "alpha\nbeta\nalpha again",
      "refs.bib": "@book{alpha}",
    });
    const results = findInProject(project, "alpha");
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ path: "main.tex" });
    expect(results[0]!.hits.map((h) => [h.line, h.columnStart, h.columnEnd])).toEqual([
      [1, 0, 5],
      [3, 0, 5],
    ]);
    expect(results[1]).toMatchObject({ path: "refs.bib" });
    expect(results[1]!.hits[0]).toMatchObject({
      line: 1,
      text: "@book{alpha}",
      columnStart: 6,
      columnEnd: 11,
    });
  });

  it("is case-insensitive by default", () => {
    const project = mkProject({ "main.tex": "Alpha and ALPHA on one line" });
    const results = findInProject(project, "alpha");
    expect(results[0]!.hits).toHaveLength(2);
  });

  it("honours caseInsensitive=false", () => {
    const project = mkProject({ "main.tex": "Alpha and ALPHA" });
    const results = findInProject(project, "Alpha", { caseInsensitive: false });
    expect(results[0]!.hits).toHaveLength(1);
    expect(results[0]!.hits[0]!.columnStart).toBe(0);
  });

  it("uses regex mode when requested", () => {
    const project = mkProject({ "main.tex": "alpha\nbeta\ngamma" });
    const results = findInProject(project, "^.eta", { regex: true });
    expect(results[0]!.hits).toHaveLength(1);
    expect(results[0]!.hits[0]!.line).toBe(2);
  });

  it("falls back to literal mode when the regex is invalid", () => {
    const project = mkProject({ "main.tex": "(unbalanced" });
    // A literal "(unbalanced" search must still hit; the broken
    // regex must not throw.
    const results = findInProject(project, "(unbalanced", { regex: true });
    expect(results[0]!.hits).toHaveLength(1);
  });

  it("does not loop on zero-width regex matches", () => {
    const project = mkProject({ "main.tex": "one\ntwo" });
    const results = findInProject(project, "^", { regex: true });
    // Two lines -> at most two zero-width matches; the implementation
    // must not hang.
    expect(results[0]!.hits.length).toBe(2);
  });

  it("uses edits overlay when provided so unsaved buffers are searched", () => {
    const project = mkProject({ "main.tex": "old content" });
    const results = findInProject(project, "fresh", {
      edits: { "main.tex": "fresh content from buffer" },
    });
    expect(results[0]!.hits).toHaveLength(1);
  });

  it("skips files with non-text kinds (e.g. images)", () => {
    const project = mkProject({ "diagram.png": "PNGDATA alpha" });
    const results = findInProject(project, "alpha");
    expect(results).toEqual([]);
  });

  it("skips files whose content is a Uint8Array even when the kind is text-like", () => {
    const project = mkProject({});
    project.files["weird.tex"] = {
      id: "f",
      path: "weird.tex",
      name: "weird.tex",
      kind: "tex",
      content: new Uint8Array([1, 2, 3]),
    };
    const results = findInProject(project, "anything");
    expect(results).toEqual([]);
  });

  it("caps total hits at maxHits", () => {
    const line = "alpha ".repeat(40); // 40 hits in one line
    const project = mkProject({ "main.tex": [line, line, line].join("\n") });
    const results = findInProject(project, "alpha", { maxHits: 10 });
    const total = results.reduce((sum, r) => sum + r.hits.length, 0);
    expect(total).toBe(10);
  });

  it("returns files in path order (alphabetical)", () => {
    const project = mkProject({
      "z.tex": "alpha",
      "a.tex": "alpha",
      "m.tex": "alpha",
    });
    const results = findInProject(project, "alpha");
    expect(results.map((r) => r.path)).toEqual(["a.tex", "m.tex", "z.tex"]);
  });
});
