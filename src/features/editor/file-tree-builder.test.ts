import { describe, it, expect } from "vitest";
import type { Project } from "@/domain";
import { buildFileTree, type TreeNode } from "./file-tree-builder";

// Minimal Project factory for tree tests - avoids the heavier mock
// fixtures so each test states only what matters.
function mkProject(
  files: Array<{ path: string; modified?: boolean }>,
  folders: Array<{ path: string; expanded?: boolean }> = [],
): Project {
  return {
    id: "p-test",
    name: "Test",
    entry: files[0]?.path ?? "main.tex",
    files: Object.fromEntries(
      files.map((f) => {
        const name = f.path.split("/").pop() ?? f.path;
        return [
          f.path,
          {
            id: `id-${f.path}`,
            path: f.path,
            name,
            kind: "tex" as const,
            content: "",
            ...(f.modified ? { modified: true } : {}),
          },
        ];
      }),
    ),
    folders: Object.fromEntries(
      folders.map((f) => [
        f.path,
        { path: f.path, name: f.path.split("/").pop() ?? f.path, expanded: f.expanded ?? false },
      ]),
    ),
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const isFolder = (n: TreeNode): n is Extract<TreeNode, { type: "folder" }> => n.type === "folder";
const isFile = (n: TreeNode): n is Extract<TreeNode, { type: "file" }> => n.type === "file";

describe("buildFileTree", () => {
  it("returns root-level files for a flat project", () => {
    const tree = buildFileTree(mkProject([{ path: "main.tex" }, { path: "refs.bib" }]));
    expect(tree).toHaveLength(2);
    expect(tree.every(isFile)).toBe(true);
  });

  it("nests files under their parent folder", () => {
    const tree = buildFileTree(
      mkProject([
        { path: "main.tex" },
        { path: "chapters/intro.tex" },
        { path: "chapters/body.tex" },
      ]),
    );
    const chapters = tree.find((n) => isFolder(n) && n.path === "chapters");
    expect(chapters).toBeDefined();
    if (!chapters || !isFolder(chapters)) throw new Error("chapters folder missing");
    expect(chapters.children).toHaveLength(2);
    expect(chapters.children.every(isFile)).toBe(true);
  });

  it("renders pre-declared empty folders", () => {
    const tree = buildFileTree(
      mkProject([{ path: "main.tex" }], [{ path: "figures" }, { path: "data" }]),
    );
    const folderPaths = tree.filter(isFolder).map((n) => n.path);
    expect(folderPaths).toContain("figures");
    expect(folderPaths).toContain("data");
  });

  it("respects the expanded flag on pre-declared folders", () => {
    const tree = buildFileTree(
      mkProject(
        [{ path: "main.tex" }, { path: "chapters/intro.tex" }],
        [{ path: "chapters", expanded: true }],
      ),
    );
    const chapters = tree.find((n) => isFolder(n) && n.path === "chapters");
    expect(chapters && isFolder(chapters) && chapters.expanded).toBe(true);
  });

  it("upgrades an implicit parent folder when it is later declared expanded", () => {
    const tree = buildFileTree(
      mkProject(
        [{ path: "chapters/intro.tex" }],
        [{ path: "chapters/part-one" }, { path: "chapters", expanded: true }],
      ),
    );
    const chapters = tree.find((n) => isFolder(n) && n.path === "chapters");
    expect(chapters && isFolder(chapters) && chapters.expanded).toBe(true);
  });

  it("sorts folders before files, then alphabetically", () => {
    const tree = buildFileTree(
      mkProject([
        { path: "zeta.tex" },
        { path: "alpha.tex" },
        { path: "beta/x.tex" },
        { path: "aardvark/y.tex" },
      ]),
    );
    expect(tree.map((n) => n.name)).toEqual(["aardvark", "beta", "alpha.tex", "zeta.tex"]);
  });

  it("handles nested folders (chapters/part-one/intro.tex)", () => {
    const tree = buildFileTree(
      mkProject([{ path: "chapters/part-one/intro.tex" }, { path: "chapters/part-one/body.tex" }]),
    );
    const chapters = tree.find((n) => isFolder(n) && n.path === "chapters");
    if (!chapters || !isFolder(chapters)) throw new Error("chapters folder missing");
    const partOne = chapters.children.find((n) => isFolder(n) && n.path === "chapters/part-one");
    if (!partOne || !isFolder(partOne)) throw new Error("part-one folder missing");
    expect(partOne.children).toHaveLength(2);
  });

  it("preserves the file payload on file nodes", () => {
    const tree = buildFileTree(mkProject([{ path: "main.tex", modified: true }]));
    const main = tree[0];
    if (!main || !isFile(main)) throw new Error("main.tex missing");
    expect(main.file.modified).toBe(true);
    expect(main.file.path).toBe("main.tex");
  });
});
