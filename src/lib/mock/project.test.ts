import { describe, it, expect } from "vitest";
import { makeStokesNotes, MOCK_PROJECT } from "./project";
import type { FileKind, Project } from "@/domain";

describe("makeStokesNotes", () => {
  it("produces a Project with a stable shape", () => {
    const p: Project = makeStokesNotes();
    expect(p.id).toBe("p-stokes-notes-v3");
    expect(p.name).toBe("Stokes Notes");
    expect(p.entry).toBe("main.tex");
    expect(p.files["main.tex"]).toBeDefined();
    expect(p.folders["chapters"]).toBeDefined();
  });

  it("keys files by path", () => {
    const p = makeStokesNotes();
    for (const [key, file] of Object.entries(p.files)) {
      expect(file.path).toBe(key);
    }
  });

  it("infers file kinds from extensions", () => {
    const p = makeStokesNotes();
    const cases: Array<[string, FileKind]> = [
      ["main.tex", "tex"],
      ["references.bib", "bib"],
      ["preamble.sty", "sty"],
      ["README.md", "md"],
    ];
    for (const [path, kind] of cases) {
      expect(p.files[path]?.kind, `expected ${path} kind = ${kind}`).toBe(kind);
    }
  });

  it("flags chapters/proof.tex as modified", () => {
    const p = makeStokesNotes();
    expect(p.files["chapters/proof.tex"]?.modified).toBe(true);
  });

  it("includes the editable chapter files from the compile entry point", () => {
    const entry = makeStokesNotes().files["main.tex"]?.content;
    expect(entry).toContain("\\input{chapters/setup.tex}");
    expect(entry).toContain("\\input{chapters/intro.tex}");
    expect(entry).toContain("\\input{chapters/proof.tex}");
  });

  it("returns independent instances on each call", () => {
    const a = makeStokesNotes();
    const b = makeStokesNotes();
    expect(a).not.toBe(b);
    expect(a.files).not.toBe(b.files);
  });
});

describe("MOCK_PROJECT singleton", () => {
  it("is a valid Project", () => {
    expect(MOCK_PROJECT.id).toBe("p-stokes-notes-v3");
    expect(MOCK_PROJECT.files[MOCK_PROJECT.entry]).toBeDefined();
  });
});
