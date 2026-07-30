import { describe, it, expect, beforeEach } from "vitest";
import { useBibStore } from "./useBibStore";
import type { Project } from "@/domain";

function mkProject(files: Record<string, string>): Project {
  return {
    id: "p-bib",
    name: "Bib",
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

beforeEach(() => {
  useBibStore.getState().reset();
});

describe("useBibStore", () => {
  it("starts empty", () => {
    expect(useBibStore.getState().entries).toEqual([]);
    expect(useBibStore.getState().origins).toEqual([]);
  });

  it("rebuild() parses every .bib file in path order", () => {
    const project = mkProject({
      "z.bib": "@article{z1, title={Z}}",
      "a.bib": "@book{a1, title={A}}\n@article{a2, title={AA}}",
      "main.tex": "irrelevant",
    });
    useBibStore.getState().rebuild(project);
    const s = useBibStore.getState();
    expect(s.entries.map((e) => e.key)).toEqual(["a1", "a2", "z1"]);
    expect(s.origins).toEqual(["a.bib", "a.bib", "z.bib"]);
  });

  it("rebuild() honours the edits overlay so unsaved buffers contribute", () => {
    const project = mkProject({
      "refs.bib": "@article{old, title={Old}}",
    });
    useBibStore.getState().rebuild(project, {
      "refs.bib": "@article{fresh, title={Fresh from buffer}}",
    });
    const s = useBibStore.getState();
    expect(s.entries.map((e) => e.key)).toEqual(["fresh"]);
  });

  it("rebuild() skips files that aren't .bib", () => {
    const project = mkProject({ "main.tex": "@article{x, title={X}}" });
    useBibStore.getState().rebuild(project);
    expect(useBibStore.getState().entries).toEqual([]);
  });

  it("keeps the existing index when only unrelated sources change", () => {
    const project = mkProject({
      "refs.bib": "@article{stable, title={Stable}}",
      "main.tex": "before",
    });
    useBibStore.getState().rebuild(project);
    const entries = useBibStore.getState().entries;

    useBibStore.getState().rebuild(project, { "main.tex": "after" });

    expect(useBibStore.getState().entries).toBe(entries);
  });

  it("byKey() returns the entry or undefined", () => {
    const project = mkProject({ "refs.bib": "@article{hit, title={H}}" });
    useBibStore.getState().rebuild(project);
    expect(useBibStore.getState().byKey("hit")?.key).toBe("hit");
    expect(useBibStore.getState().byKey("miss")).toBeUndefined();
  });

  it("reset() drops everything", () => {
    const project = mkProject({ "refs.bib": "@article{x, title={X}}" });
    useBibStore.getState().rebuild(project);
    useBibStore.getState().reset();
    expect(useBibStore.getState().entries).toEqual([]);
    expect(useBibStore.getState().origins).toEqual([]);
  });
});
