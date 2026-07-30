import { describe, it, expect, beforeEach } from "vitest";
import { CompositeProjectService } from "./composite-project-service";
import { ProjectNotFoundError } from "./errors";
import { MemoryKVStore, PersistenceProjectStore, type SavedProject } from "./persistence";
import { MOCK_PROJECT_ENTRIES } from "@/lib/mock/projects";

function makeService() {
  const kv = new MemoryKVStore<SavedProject>();
  const store = new PersistenceProjectStore(kv);
  const svc = new CompositeProjectService(MOCK_PROJECT_ENTRIES, store);
  return { svc, store };
}

describe("CompositeProjectService", () => {
  let svc: CompositeProjectService;
  let store: PersistenceProjectStore;
  beforeEach(() => {
    ({ svc, store } = makeService());
  });

  describe("list()", () => {
    it("returns every fixture when nothing is persisted", async () => {
      const list = await svc.list();
      expect(list.map((s) => s.id).sort()).toEqual(
        MOCK_PROJECT_ENTRIES.map((e) => e.summary.id).sort(),
      );
    });

    it("persisted projects appear before fixtures", async () => {
      const project = await svc.create({ name: "My Project" });
      const list = await svc.list();
      expect(list[0]?.id).toBe(project.id);
    });

    it("persisted versions shadow fixtures with the same id", async () => {
      const stokes = await svc.open("p-stokes-notes-v3");
      stokes.name = "Stokes Notes (custom)";
      await svc.save(stokes);

      const list = await svc.list();
      const occurrences = list.filter((s) => s.id === "p-stokes-notes-v3");
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0]?.name).toBe("Stokes Notes (custom)");
    });

    it("purges retired demo IDs without touching user-created projects", async () => {
      const legacyDemo = await svc.open("p-stokes-notes-v3");
      await store.put(legacyDemo);
      const userProject = await svc.create({ name: "Research Notes" });

      const productionService = new CompositeProjectService([], store, {
        retiredProjectIds: ["p-stokes-notes-v3"],
      });

      const list = await productionService.list();
      expect(list.map((summary) => summary.id)).toEqual([userProject.id]);
      expect(await store.get(legacyDemo.id)).toBeUndefined();
      await expect(productionService.open(legacyDemo.id)).rejects.toBeInstanceOf(
        ProjectNotFoundError,
      );
    });
  });

  describe("open()", () => {
    it("returns a persisted copy when one exists", async () => {
      const project = await svc.create({ name: "X" });
      const fresh = await svc.open(project.id);
      expect(fresh.id).toBe(project.id);
      expect(fresh.name).toBe("X");
    });

    it("falls back to a fixture factory when no persisted copy exists", async () => {
      const project = await svc.open("p-stokes-notes-v3");
      expect(project.id).toBe("p-stokes-notes-v3");
      expect(project.files["main.tex"]).toBeDefined();
    });

    it("prefers the persisted version over the fixture", async () => {
      const stokes = await svc.open("p-stokes-notes-v3");
      stokes.name = "shadowed";
      await svc.save(stokes);
      const reopened = await svc.open("p-stokes-notes-v3");
      expect(reopened.name).toBe("shadowed");
    });

    it("rejects with ProjectNotFoundError for unknown ids", async () => {
      await expect(svc.open("p-does-not-exist")).rejects.toBeInstanceOf(ProjectNotFoundError);
    });
  });

  describe("save()", () => {
    it("writes the project to the store and returns it", async () => {
      const project = await svc.create({ name: "A" });
      project.name = "A renamed";
      const saved = await svc.save(project);
      expect(saved.name).toBe("A renamed");
      const persisted = await store.get(project.id);
      expect(persisted?.name).toBe("A renamed");
    });
  });

  describe("create()", () => {
    it("creates a new project with a generated id and seeds main.tex", async () => {
      const project = await svc.create({ name: "Notes 1" });
      expect(project.id).toMatch(/^p-local-/);
      expect(project.name).toBe("Notes 1");
      expect(project.entry).toBe("main.tex");
      expect(project.files["main.tex"]?.content).toContain("\\title{Notes 1}");
    });

    it("rejects empty / whitespace-only names", async () => {
      await expect(svc.create({ name: "   " })).rejects.toThrow();
      await expect(svc.create({ name: "" })).rejects.toThrow();
    });

    it("persists the new project immediately", async () => {
      const project = await svc.create({ name: "Persisted" });
      expect(await store.get(project.id)).toBeDefined();
    });

    it("generates unique ids across rapid creations", async () => {
      const a = await svc.create({ name: "A" });
      const b = await svc.create({ name: "B" });
      expect(a.id).not.toBe(b.id);
    });

    it("seeds amsart files when template=amsart is supplied", async () => {
      const project = await svc.create({ name: "On Compactness", template: "amsart" });
      expect(project.files["main.tex"]?.content).toMatch(/\\documentclass\[[^\]]*\]\{amsart\}/);
      expect(project.files["main.tex"]?.content).toContain("\\title{On Compactness}");
    });

    it("seeds a multi-file thesis layout when template=thesis-memoir is supplied", async () => {
      const project = await svc.create({ name: "Thesis Draft", template: "thesis-memoir" });
      expect(project.files["main.tex"]?.content).toContain("memoir");
      expect(project.files["chapters/01-introduction.tex"]).toBeDefined();
      expect(project.files["refs.bib"]).toBeDefined();
      expect(project.folders["chapters"]?.path).toBe("chapters");
    });

    it("falls back to the blank template for unknown template ids", async () => {
      const project = await svc.create({ name: "Unknown", template: "nope-not-real" });
      expect(project.files["main.tex"]?.content).toContain("\\documentclass{article}");
    });
  });

  describe("remove()", () => {
    it("hides a soft-deleted project and removes it permanently on hard delete", async () => {
      const project = await svc.create({ name: "Tmp" });
      await svc.remove(project.id);

      await expect(svc.open(project.id)).rejects.toBeInstanceOf(ProjectNotFoundError);

      if (svc.hardDelete) await svc.hardDelete(project.id);
      await expect(svc.open(project.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
    });

    it("removing a shadowed fixture reveals the fixture again", async () => {
      const stokes = await svc.open("p-stokes-notes-v3");
      stokes.name = "shadow";
      await svc.save(stokes);
      expect((await svc.open("p-stokes-notes-v3")).name).toBe("shadow");

      await svc.remove("p-stokes-notes-v3");
      if (svc.hardDelete) await svc.hardDelete("p-stokes-notes-v3");
      const reopened = await svc.open("p-stokes-notes-v3");
      expect(reopened.name).toBe("Stokes Notes"); // original fixture
    });

    it("removing an unknown id is a no-op", async () => {
      await expect(svc.remove("p-does-not-exist")).resolves.toBeUndefined();
    });
  });

  // -- File-level ------------------------------------------------

  describe("createFile", () => {
    it("adds a new file and persists it", async () => {
      const before = await svc.create({ name: "Files" });
      const after = await svc.createFile(before.id, "chapters/intro.tex", "hello");
      expect(after.files["chapters/intro.tex"]?.content).toBe("hello");
      const reopened = await svc.open(before.id);
      expect(reopened.files["chapters/intro.tex"]?.content).toBe("hello");
    });

    it("rejects an invalid path", async () => {
      const p = await svc.create({ name: "X" });
      await expect(svc.createFile(p.id, "/leading.tex")).rejects.toThrow();
    });

    it("rejects a duplicate path", async () => {
      const p = await svc.create({ name: "X" });
      await expect(svc.createFile(p.id, "main.tex")).rejects.toThrow(/already exists/i);
    });

    it("rejects a path already occupied by a folder", async () => {
      const p = await svc.create({ name: "X" });
      await svc.createFolder(p.id, "figures");
      await expect(svc.createFile(p.id, "figures")).rejects.toThrow(/folder already exists/i);
    });
  });

  describe("renameFile", () => {
    it("moves a file to a new path", async () => {
      const p = await svc.create({ name: "R" });
      const next = await svc.renameFile(p.id, "main.tex", "entry.tex");
      expect(next.files["main.tex"]).toBeUndefined();
      expect(next.files["entry.tex"]).toBeDefined();
    });

    it("updates the project entry when it matched the old path", async () => {
      const p = await svc.create({ name: "R" });
      const next = await svc.renameFile(p.id, "main.tex", "entry.tex");
      expect(next.entry).toBe("entry.tex");
    });

    it("rejects when the new path already exists", async () => {
      const p = await svc.create({ name: "R" });
      await svc.createFile(p.id, "second.tex");
      await expect(svc.renameFile(p.id, "main.tex", "second.tex")).rejects.toThrow();
    });

    it("rejects when the old path doesn't exist", async () => {
      const p = await svc.create({ name: "R" });
      await expect(svc.renameFile(p.id, "ghost.tex", "real.tex")).rejects.toThrow();
    });
  });

  describe("removeFile", () => {
    it("deletes the file and persists the change", async () => {
      const p = await svc.create({ name: "D" });
      await svc.createFile(p.id, "extra.tex");
      const next = await svc.removeFile(p.id, "extra.tex");
      expect(next.files["extra.tex"]).toBeDefined(); // It exists but with deletedAt
    });

    it("is a no-op for an unknown path", async () => {
      const p = await svc.create({ name: "D" });
      const next = await svc.removeFile(p.id, "ghost.tex");
      expect(next.files).toEqual(p.files);
    });

    it("selects another TeX entry when the current entry is deleted", async () => {
      const p = await svc.create({ name: "D" });
      await svc.createFile(p.id, "replacement.tex", "\\documentclass{article}");

      const next = await svc.removeFile(p.id, "main.tex");

      expect(next.entry).toBe("replacement.tex");
      expect(next.files[next.entry]).toBeDefined();
    });

    it("refuses to delete the final file", async () => {
      const p = await svc.create({ name: "D" });
      await expect(svc.removeFile(p.id, "main.tex")).rejects.toThrow(/at least one file/i);
    });
  });

  describe("folders", () => {
    it("createFolder adds a folder entry", async () => {
      const p = await svc.create({ name: "F" });
      const next = await svc.createFolder(p.id, "figures");
      expect(next.folders["figures"]?.name).toBe("figures");
    });

    it("rejects a folder path already occupied by a file", async () => {
      const p = await svc.create({ name: "F" });
      await svc.createFile(p.id, "notes.tex");
      await expect(svc.createFolder(p.id, "notes.tex")).rejects.toThrow(/file already exists/i);
    });

    it("removeFolder drops the folder + every nested file/folder", async () => {
      const p = await svc.create({ name: "F" });
      await svc.createFolder(p.id, "chapters");
      await svc.createFile(p.id, "chapters/intro.tex");
      await svc.createFile(p.id, "chapters/body.tex");
      const next = await svc.removeFolder(p.id, "chapters");
      expect(next.folders["chapters"]).toBeUndefined();
      expect(next.files["chapters/intro.tex"]).toBeDefined(); // They exist with deletedAt
      expect(next.files["chapters/body.tex"]).toBeDefined();
    });

    it("refuses to remove a folder when it contains every project file", async () => {
      const p = await svc.create({ name: "F" });
      const nested = await svc.renameFile(p.id, "main.tex", "chapters/main.tex");
      expect(nested.entry).toBe("chapters/main.tex");

      await expect(svc.removeFolder(p.id, "chapters")).rejects.toThrow(/at least one file/i);
    });
  });

  it("serializes content saves with structural file operations", async () => {
    const p = await svc.create({ name: "Concurrent" });
    const create = svc.createFile(p.id, "chapter.tex", "chapter");
    const save = svc.saveFiles(p.id, { "main.tex": "updated" });

    await Promise.all([create, save]);

    const reopened = await svc.open(p.id);
    expect(reopened.files["chapter.tex"]?.content).toBe("chapter");
    expect(reopened.files["main.tex"]?.content).toBe("updated");
  });
});
