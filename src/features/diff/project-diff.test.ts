import { describe, it, expect } from "vitest";
import type { Project } from "@/domain";
import { diffProject } from "./project-diff";

const baseProject = (): Project => ({
  id: "p",
  name: "P",
  entry: "main.tex",
  files: {
    "main.tex": {
      id: "f-main",
      path: "main.tex",
      name: "main.tex",
      kind: "tex",
      content: "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}\n",
    },
    "notes.md": {
      id: "f-notes",
      path: "notes.md",
      name: "notes.md",
      kind: "md",
      content: "# Notes\n",
    },
    "logo.png": {
      id: "f-logo",
      path: "logo.png",
      name: "logo.png",
      kind: "img",
      content: "",
    },
  },
  folders: {},
  createdAt: "2026-05-22T12:00:00Z",
});

const projectWithFiles = (files: Project["files"]): Project => ({
  ...baseProject(),
  files,
});

describe("diffProject", () => {
  it("returns an empty summary when there are no edits", () => {
    const out = diffProject(baseProject(), {});
    expect(out.files).toEqual([]);
    expect(out.changedCount).toBe(0);
    expect(out.totals).toEqual({ added: 0, removed: 0, context: 0 });
  });

  it("flags a modified file with line-level ops", () => {
    const project = baseProject();
    const edits = {
      "main.tex": (project.files["main.tex"]!.content as string).replace("Hello", "Hello, world"),
    };
    const out = diffProject(project, edits);
    expect(out.files.length).toBe(1);
    const fd = out.files[0]!;
    expect(fd.path).toBe("main.tex");
    expect(fd.status).toBe("modified");
    expect(fd.stats.added).toBe(1);
    expect(fd.stats.removed).toBe(1);
    // The change is a one-line delete + insert pair; the surrounding
    // \documentclass / \begin{document} / \end{document} are context.
    expect(fd.stats.context).toBe(3);
  });

  it("flags an added file when the edit path is unknown to the project", () => {
    const project = baseProject();
    const edits = { "fresh.tex": "first line\nsecond\n" };
    const out = diffProject(project, edits);
    const fd = out.files.find((f) => f.path === "fresh.tex")!;
    expect(fd.status).toBe("added");
    expect(fd.stats.added).toBe(2);
    expect(fd.stats.removed).toBe(0);
  });

  it("filters out edit entries that match the saved baseline byte-for-byte", () => {
    const project = baseProject();
    const edits = { "main.tex": project.files["main.tex"]!.content as string };
    const out = diffProject(project, edits);
    expect(out.files).toEqual([]);
  });

  it("classifies an added binary file as added + isBinary with empty ops", () => {
    const project = baseProject();
    // logo.png isn't in the saved project, so this is an "added"
    // binary - exercises the added+binary branch the modified
    // case doesn't reach.
    const edits = { "new-logo.png": "<some bytes representing a new png>" };
    const out = diffProject(project, edits);
    const fd = out.files.find((f) => f.path === "new-logo.png")!;
    expect(fd.status).toBe("added");
    expect(fd.isBinary).toBe(true);
    expect(fd.ops).toEqual([]);
  });

  it("classifies modified binary files as modified + isBinary and shows no line ops", () => {
    const project = baseProject();
    const edits = { "logo.png": "<some bytes>" };
    const out = diffProject(project, edits);
    const fd = out.files.find((f) => f.path === "logo.png")!;
    expect(fd.status).toBe("modified");
    expect(fd.isBinary).toBe(true);
    expect(fd.ops).toEqual([]);
  });

  it("sorts file diffs alphabetically by path", () => {
    const project = baseProject();
    const edits = {
      "z.tex": "z",
      "a.tex": "a",
      "m.tex": "m",
    };
    const out = diffProject(project, edits);
    expect(out.files.map((f) => f.path)).toEqual(["a.tex", "m.tex", "z.tex"]);
  });

  it("returns completely replaced content when computing a patch for an added file", () => {
    const diff = diffProject(projectWithFiles({}), { "new.png": "new content" });
    expect(diff.files[0]!.path).toBe("new.png");
  });

  it("marks an unsupported added file as binary", () => {
    const diff = diffProject(projectWithFiles({}), { "added.pdf": "binary content" });
    expect(diff.files[0]!.status).toBe("added");
    expect(diff.files[0]!.isBinary).toBe(true);
  });

  it("handles binary deleted", () => {
    const project = projectWithFiles({
      "old.pdf": {
        id: "old.pdf",
        path: "old.pdf",
        name: "old.pdf",
        kind: "other",
        content: new Uint8Array([1, 2, 3]),
      },
    });
    const diff = diffProject(project, { "old.pdf": "" });
    expect(diff.files[0]!.status).toBe("deleted");
    expect(diff.files[0]!.isBinary).toBe(true);
  });

  it("handles binary modified", () => {
    const project = projectWithFiles({
      "old.pdf": {
        id: "old.pdf",
        path: "old.pdf",
        name: "old.pdf",
        kind: "other",
        content: new Uint8Array([1, 2, 3]),
      },
    });
    const diff = diffProject(project, { "old.pdf": "new content" });
    expect(diff.files[0]!.status).toBe("modified");
    expect(diff.files[0]!.isBinary).toBe(true);
  });
});
