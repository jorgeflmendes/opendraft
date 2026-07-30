import { describe, expect, it } from "vitest";
import {
  basename,
  dirname,
  inferFileKind,
  joinPath,
  resolveProjectPath,
  validatePath,
} from "./path-utils";

describe("validatePath", () => {
  it.each([
    "main.tex",
    "chapters/intro.tex",
    "figures/diagrams/a.svg",
    "a/b/c/d/file.txt",
    ".gitignore",
  ])("accepts %s", (path) => {
    expect(() => validatePath(path)).not.toThrow();
  });

  it.each([
    ["", /required/i],
    [" ", /required/i],
    ["/leading.tex", /relative/i],
    ["trailing/", /end with/i],
    ["double//slash.tex", /segment/i],
    ["../escape.tex", /traversal/i],
    ["a/./b.tex", /segment/i],
    ["a/../b.tex", /traversal/i],
    ["bad\\slash.tex", /forward slashes/i],
    [`null${String.fromCharCode(0)}.tex`, /control/i],
  ])("rejects %s", (path, pattern) => {
    expect(() => validatePath(path)).toThrow(pattern as RegExp);
  });

  it("rejects segments longer than 255 chars", () => {
    const long = "x".repeat(256) + ".tex";
    expect(() => validatePath(long)).toThrow(/too long/i);
  });
});

describe("resolveProjectPath", () => {
  const projectPaths = ["main.tex", "chapters/intro.tex", "references.bib"];

  it("maps BusyTeX virtual absolute paths back to project-relative files", () => {
    expect(resolveProjectPath("/home/web_user/project_dir/./main.tex", projectPaths)).toBe(
      "main.tex",
    );
    expect(resolveProjectPath("/home/web_user/project_dir/chapters/intro.tex", projectPaths)).toBe(
      "chapters/intro.tex",
    );
  });

  it("normalises separators and harmless dot segments", () => {
    expect(resolveProjectPath(".\\chapters\\intro.tex", projectPaths)).toBe("chapters/intro.tex");
  });

  it("rejects traversal, unknown files, and unrelated absolute paths", () => {
    expect(resolveProjectPath("../main.tex", projectPaths)).toBeNull();
    expect(resolveProjectPath("missing.tex", projectPaths)).toBeNull();
    expect(resolveProjectPath("/tmp/main.tex", projectPaths)).toBeNull();
    expect(resolveProjectPath("C:/tmp/main.tex", projectPaths)).toBeNull();
  });
});

describe("basename / dirname / joinPath", () => {
  it.each([
    ["main.tex", "main.tex", ""],
    ["chapters/intro.tex", "intro.tex", "chapters"],
    ["a/b/c/d.tex", "d.tex", "a/b/c"],
  ])("basename and dirname of %s", (path, base, dir) => {
    expect(basename(path)).toBe(base);
    expect(dirname(path)).toBe(dir);
  });

  it("joinPath assembles a clean path", () => {
    expect(joinPath("chapters", "intro.tex")).toBe("chapters/intro.tex");
    expect(joinPath("", "main.tex")).toBe("main.tex");
  });
});

describe("inferFileKind", () => {
  it.each([
    ["main.tex", "tex"],
    ["references.bib", "bib"],
    ["preamble.sty", "sty"],
    ["opendraft.yml", "yml"],
    ["config.yaml", "yml"],
    ["README.md", "md"],
    ["figure.png", "img"],
    ["photo.JPG", "img"],
    ["notes.txt", "txt"],
    ["Makefile", "txt"],
    ["LICENSE", "txt"],
    ["Dockerfile", "txt"],
    [".gitignore", "txt"],
    [".editorconfig", "txt"],
    [".env", "txt"],
    ["dotfile", "other"],
    ["archive.zip", "other"],
  ] as const)("infers %s as %s", (path, kind) => {
    expect(inferFileKind(path)).toBe(kind);
  });
});
