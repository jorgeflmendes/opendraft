import { afterEach, describe, expect, it, vi } from "vitest";
import { makeStokesNotes } from "@/lib/mock/project";
import { cloneProject, createImportedProjectId, rekeyProject } from "./projects-store-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("project store helpers", () => {
  it("creates collision-resistant IDs in the import namespace", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "3a86be65-9f6a-4180-a5af-0a1683210d03" });

    expect(createImportedProjectId()).toBe("p-import-3a86be65-9f6a-4180-a5af-0a1683210d03");
  });

  it("clones mutable file and folder records", () => {
    const source = makeStokesNotes();
    const clone = cloneProject(source);

    clone.files["main.tex"]!.name = "renamed.tex";
    clone.folders.chapters!.expanded = false;

    expect(source.files["main.tex"]!.name).toBe("main.tex");
    expect(source.folders.chapters!.expanded).toBe(true);
  });

  it("rekeys every file identity without mutating the imported project", () => {
    const source = makeStokesNotes();
    const originalMainId = source.files["main.tex"]!.id;

    const rekeyed = rekeyProject(source, "p-import-new");

    expect(rekeyed.id).toBe("p-import-new");
    expect(rekeyed.files["main.tex"]!.id).toBe("p-import-new-main-tex");
    expect(rekeyed.files["main.tex"]!.id).not.toBe(originalMainId);
    expect(source.files["main.tex"]!.id).toBe(originalMainId);
  });
});
