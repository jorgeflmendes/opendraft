import { describe, it, expect, beforeEach } from "vitest";
import { useProjectsStore } from "./useProjectsStore";
import { useTabsStore } from "@/features/editor/useTabsStore";
import { setProjectService } from "@/services";

describe("useProjectsStore", () => {
  beforeEach(() => {
    useProjectsStore.setState({
      summaries: [],
      active: null,
      loading: false,
      error: null,
    });
    useTabsStore.setState({ openTabs: [], activeTab: null, edits: {} });
  });

  it("starts empty", () => {
    const s = useProjectsStore.getState();
    expect(s.summaries).toEqual([]);
    expect(s.active).toBeNull();
    expect(s.error).toBeNull();
    expect(s.loading).toBe(false);
  });

  it("loadSummaries() populates the catalogue", async () => {
    await useProjectsStore.getState().loadSummaries();
    const s = useProjectsStore.getState();
    expect(s.summaries.length).toBeGreaterThan(0);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("openProject() materialises the project and seeds tabs with the entry file", async () => {
    await useProjectsStore.getState().openProject("p-stokes-notes-v3");
    const s = useProjectsStore.getState();
    expect(s.active?.id).toBe("p-stokes-notes-v3");
    const t = useTabsStore.getState();
    expect(t.openTabs).toEqual(["main.tex"]);
    expect(t.activeTab).toBe("main.tex");
  });

  it("openProject() resets tabs when switching projects", async () => {
    await useProjectsStore.getState().openProject("p-stokes-notes-v3");
    useTabsStore.getState().open("chapters/proof.tex");
    expect(useTabsStore.getState().openTabs).toContain("chapters/proof.tex");

    await useProjectsStore.getState().openProject("p-cv-v2");
    const t = useTabsStore.getState();
    expect(t.openTabs).toEqual(["cv.tex"]);
    expect(t.activeTab).toBe("cv.tex");
  });

  it("openProject() captures errors for unknown ids", async () => {
    await useProjectsStore.getState().openProject("p-does-not-exist");
    const s = useProjectsStore.getState();
    expect(s.active).toBeNull();
    expect(s.error).toMatch(/Project not found/);
    expect(s.loading).toBe(false);
  });

  it("closeProject() clears active and resets tabs", async () => {
    await useProjectsStore.getState().openProject("p-stokes-notes-v3");
    useProjectsStore.getState().closeProject();
    const s = useProjectsStore.getState();
    expect(s.active).toBeNull();
    const t = useTabsStore.getState();
    expect(t.openTabs).toEqual([]);
    expect(t.activeTab).toBeNull();
  });

  describe("createProject", () => {
    it("creates a new project and adds it to summaries", async () => {
      const project = await useProjectsStore.getState().createProject("Brand new");
      expect(project?.name).toBe("Brand new");
      // Summaries are refetched after create - the new id appears,
      // fixtures still appear, persisted-shadowed fixtures don't
      // duplicate. The count exact value isn't asserted because
      // it depends on fixture count.
      expect(useProjectsStore.getState().summaries.some((s) => s.id === project!.id)).toBe(true);
    });

    it("captures errors from the service (blank name)", async () => {
      const result = await useProjectsStore.getState().createProject("   ");
      expect(result).toBeNull();
      expect(useProjectsStore.getState().error).toMatch(/name is required/i);
    });
  });

  describe("removeProject", () => {
    it("soft-deletes a user-created project from active summaries", async () => {
      const project = await useProjectsStore.getState().createProject("Tmp");
      expect(project).not.toBeNull();
      await useProjectsStore.getState().removeProject(project!.id);
      expect(useProjectsStore.getState().summaries.find((s) => s.id === project!.id)?.deleted).toBe(
        true,
      );
    });

    it("clears active state when the removed project was open", async () => {
      const project = await useProjectsStore.getState().createProject("Open me");
      await useProjectsStore.getState().openProject(project!.id);
      expect(useProjectsStore.getState().active?.id).toBe(project!.id);
      await useProjectsStore.getState().removeProject(project!.id);
      expect(useProjectsStore.getState().active).toBeNull();
      expect(useTabsStore.getState().openTabs).toEqual([]);
    });

    it("leaves active state alone when removing an unrelated project", async () => {
      await useProjectsStore.getState().openProject("p-stokes-notes-v3");
      const other = await useProjectsStore.getState().createProject("Other");
      await useProjectsStore.getState().removeProject(other!.id);
      expect(useProjectsStore.getState().active?.id).toBe("p-stokes-notes-v3");
    });

    it("captures remove errors from the service", async () => {
      setProjectService({
        async remove() {
          throw new Error("remove down");
        },
      } as never);

      await useProjectsStore.getState().removeProject("p-does-not-exist");

      expect(useProjectsStore.getState().error).toBe("remove down");
      expect(useProjectsStore.getState().loading).toBe(false);
    });
  });

  describe("adoptProject", () => {
    it("persists the given Project verbatim, makes it active, and seeds tabs", async () => {
      const project = {
        id: "p-gh-test",
        name: "alice/proj",
        entry: "main.tex",
        files: {
          "main.tex": {
            id: "f-1",
            path: "main.tex",
            name: "main.tex",
            kind: "tex" as const,
            content: "% imported",
          },
          "refs.bib": {
            id: "f-2",
            path: "refs.bib",
            name: "refs.bib",
            kind: "bib" as const,
            content: "@book{x}",
          },
        },
        folders: {},
        createdAt: "2026-05-22T12:00:00Z",
      };
      const adopted = await useProjectsStore.getState().adoptProject(project);
      expect(adopted?.id).toBe("p-gh-test");
      const s = useProjectsStore.getState();
      expect(s.active?.id).toBe("p-gh-test");
      expect(s.summaries.some((sm) => sm.id === "p-gh-test")).toBe(true);
      const t = useTabsStore.getState();
      expect(t.openTabs).toEqual(["main.tex"]);
      expect(t.activeTab).toBe("main.tex");
    });

    it("returns null and captures the error when persistence fails", async () => {
      setProjectService({
        async save() {
          throw new Error("disk full");
        },
      } as never);
      const result = await useProjectsStore.getState().adoptProject({
        id: "p-x",
        name: "x",
        entry: "a.tex",
        files: {},
        folders: {},
        createdAt: "2026-01-01T00:00:00Z",
      });
      expect(result).toBeNull();
      expect(useProjectsStore.getState().error).toBe("disk full");
    });
  });

  describe("file-level actions", () => {
    beforeEach(async () => {
      await useProjectsStore.getState().openProject("p-stokes-notes-v3");
    });

    it("createFile returns the path on success and adds it to the active project", async () => {
      const path = await useProjectsStore.getState().createFile("notes.tex", "% hi");
      expect(path).toBe("notes.tex");
      expect(useProjectsStore.getState().active?.files["notes.tex"]?.content).toBe("% hi");
    });

    it("createFile returns null and surfaces the error on invalid paths", async () => {
      const result = await useProjectsStore.getState().createFile("/bad.tex");
      expect(result).toBeNull();
      expect(useProjectsStore.getState().error).toMatch(/relative/i);
    });

    it("file actions return falsey results when no project is active", async () => {
      useProjectsStore.getState().closeProject();

      await expect(useProjectsStore.getState().createFile("notes.tex")).resolves.toBeNull();
      await expect(useProjectsStore.getState().renameFile("main.tex", "entry.tex")).resolves.toBe(
        false,
      );
      await expect(useProjectsStore.getState().removeFile("main.tex")).resolves.toBe(false);
      await expect(useProjectsStore.getState().createFolder("notes")).resolves.toBe(false);
      await expect(useProjectsStore.getState().removeFolder("notes")).resolves.toBe(false);
    });

    it("renameFile migrates open tabs + edits", async () => {
      useTabsStore.getState().open("main.tex");
      useTabsStore.getState().updateContent("main.tex", "edited body");
      const ok = await useProjectsStore.getState().renameFile("main.tex", "entry.tex");
      expect(ok).toBe(true);
      const tabs = useTabsStore.getState();
      expect(tabs.openTabs).toContain("entry.tex");
      expect(tabs.openTabs).not.toContain("main.tex");
      expect(tabs.activeTab).toBe("entry.tex");
      expect(tabs.edits["entry.tex"]).toBe("edited body");
    });

    it("renameFile leaves tab state untouched when the renamed file is not open", async () => {
      const before = useTabsStore.getState();
      const ok = await useProjectsStore
        .getState()
        .renameFile("references.bib", "renamed-references.bib");

      expect(ok).toBe(true);
      expect(useTabsStore.getState().openTabs).toEqual(before.openTabs);
      expect(useTabsStore.getState().activeTab).toBe(before.activeTab);
      expect(useProjectsStore.getState().active?.files["renamed-references.bib"]).toBeDefined();
    });

    it("renameFile migrates a preserved draft even when its tab is closed", async () => {
      useTabsStore.getState().updateContent("references.bib", "closed draft");

      const ok = await useProjectsStore
        .getState()
        .renameFile("references.bib", "renamed-references.bib");

      expect(ok).toBe(true);
      expect(useTabsStore.getState().edits).not.toHaveProperty("references.bib");
      expect(useTabsStore.getState().edits["renamed-references.bib"]).toBe("closed draft");
    });

    it("renameFile returns false and records the validation error", async () => {
      const ok = await useProjectsStore.getState().renameFile("main.tex", "/bad.tex");
      expect(ok).toBe(false);
      expect(useProjectsStore.getState().error).toMatch(/relative/i);
    });

    it("removeFile closes the open tab + drops its edit", async () => {
      useTabsStore.getState().open("main.tex");
      useTabsStore.getState().updateContent("main.tex", "dirty");
      await useProjectsStore.getState().removeFile("main.tex");
      const tabs = useTabsStore.getState();
      expect(tabs.openTabs).not.toContain("main.tex");
      expect(tabs.edits).not.toHaveProperty("main.tex");
      expect(tabs.activeTab).toBe(useProjectsStore.getState().active?.entry);
      expect(useProjectsStore.getState().active?.files[tabs.activeTab!]).toBeDefined();
    });

    it("removeFile discards edits even when the file has no open tab", async () => {
      useTabsStore.getState().updateContent("references.bib", "dirty bib");
      const ok = await useProjectsStore.getState().removeFile("references.bib");

      expect(ok).toBe(true);
      expect(useTabsStore.getState().edits).not.toHaveProperty("references.bib");
    });

    it("removeFile discards an empty-string draft instead of leaving an orphan", async () => {
      useTabsStore.getState().updateContent("references.bib", "");

      const ok = await useProjectsStore.getState().removeFile("references.bib");

      expect(ok).toBe(true);
      expect(useTabsStore.getState().edits).not.toHaveProperty("references.bib");
    });

    it("removeFile returns false and records service errors", async () => {
      setProjectService({
        async removeFile() {
          throw new Error("file removal down");
        },
      } as never);

      const ok = await useProjectsStore.getState().removeFile("missing.tex");

      expect(ok).toBe(false);
      expect(useProjectsStore.getState().error).toBe("file removal down");
    });

    it("createFolder returns true on success and false on invalid paths", async () => {
      await expect(useProjectsStore.getState().createFolder("appendix")).resolves.toBe(true);
      expect(useProjectsStore.getState().active?.folders.appendix).toBeDefined();

      await expect(useProjectsStore.getState().createFolder("/bad")).resolves.toBe(false);
      expect(useProjectsStore.getState().error).toMatch(/relative/i);
    });

    it("createFolder stores non-Error service failures", async () => {
      setProjectService({
        async createFolder() {
          throw "folder create down";
        },
      } as never);

      await expect(useProjectsStore.getState().createFolder("appendix")).resolves.toBe(false);
      expect(useProjectsStore.getState().error).toBe("folder create down");
    });

    it("removeFolder closes every tab under the deleted folder", async () => {
      await useProjectsStore.getState().createFolder("chapters");
      await useProjectsStore.getState().createFile("chapters/intro.tex");
      await useProjectsStore.getState().createFile("chapters/body.tex");
      useTabsStore.getState().open("chapters/intro.tex");
      useTabsStore.getState().open("chapters/body.tex");
      await useProjectsStore.getState().removeFolder("chapters");
      const tabs = useTabsStore.getState();
      expect(tabs.openTabs).not.toContain("chapters/intro.tex");
      expect(tabs.openTabs).not.toContain("chapters/body.tex");
    });

    it("removeFolder also closes a tab whose path exactly matches the folder", async () => {
      await useProjectsStore.getState().createFolder("notes");
      useTabsStore.getState().open("notes");

      await expect(useProjectsStore.getState().removeFolder("notes")).resolves.toBe(true);
      expect(useTabsStore.getState().openTabs).not.toContain("notes");
    });

    it("removeFolder returns false and records service errors", async () => {
      setProjectService({
        async removeFolder() {
          throw new Error("folder removal down");
        },
      } as never);

      const ok = await useProjectsStore.getState().removeFolder("missing");

      expect(ok).toBe(false);
      expect(useProjectsStore.getState().error).toBe("folder removal down");
    });

    it("removeFolder stores non-Error service failures", async () => {
      setProjectService({
        async removeFolder() {
          throw "folder remove down";
        },
      } as never);

      const ok = await useProjectsStore.getState().removeFolder("missing");

      expect(ok).toBe(false);
      expect(useProjectsStore.getState().error).toBe("folder remove down");
    });
  });

  describe("export / import", () => {
    it("exportActive serialises the active project to a JSON envelope", async () => {
      await useProjectsStore.getState().openProject("p-stokes-notes-v3");
      const json = await useProjectsStore.getState().exportActive();
      expect(json).not.toBeNull();
      const parsed = JSON.parse(json!);
      expect(parsed.format).toBe("opendraft.project");
      expect(parsed.project.id).toBe("p-stokes-notes-v3");
    });

    it("exportActive returns null when no project is active", async () => {
      expect(await useProjectsStore.getState().exportActive()).toBeNull();
    });

    it("importProject parses, persists, and assigns a fresh id", async () => {
      await useProjectsStore.getState().openProject("p-stokes-notes-v3");
      const json = (await useProjectsStore.getState().exportActive())!;

      const imported = await useProjectsStore.getState().importProject(json);
      expect(imported).not.toBeNull();
      expect(imported!.id).not.toBe("p-stokes-notes-v3");
      expect(imported!.id).toMatch(/^p-import-/);
      // Imported project appears in summaries.
      expect(useProjectsStore.getState().summaries.some((s) => s.id === imported!.id)).toBe(true);
    });

    it("importProject captures parse errors", async () => {
      const result = await useProjectsStore.getState().importProject("not json at all");
      expect(result).toBeNull();
      expect(useProjectsStore.getState().error).toMatch(/import failed/i);
    });

    it("importProject captures persistence errors after a valid parse", async () => {
      await useProjectsStore.getState().openProject("p-stokes-notes-v3");
      const json = (await useProjectsStore.getState().exportActive())!;
      setProjectService({
        async save() {
          throw "persistence down";
        },
      } as never);

      const result = await useProjectsStore.getState().importProject(json);

      expect(result).toBeNull();
      expect(useProjectsStore.getState().error).toBe("persistence down");
    });

    it("importProject captures Error persistence failures after a valid parse", async () => {
      await useProjectsStore.getState().openProject("p-stokes-notes-v3");
      const json = (await useProjectsStore.getState().exportActive())!;
      setProjectService({
        async save() {
          throw new Error("save exploded");
        },
      } as never);

      const result = await useProjectsStore.getState().importProject(json);

      expect(result).toBeNull();
      expect(useProjectsStore.getState().error).toBe("save exploded");
    });

    it("imported projects survive a re-open round-trip (content preserved)", async () => {
      await useProjectsStore.getState().openProject("p-stokes-notes-v3");
      const json = (await useProjectsStore.getState().exportActive())!;
      const imported = await useProjectsStore.getState().importProject(json);
      const reopened = await (await import("@/services")).getProjectService().open(imported!.id);
      expect(reopened.files["main.tex"]?.content).toContain("\\documentclass");
    });
  });

  describe("saveActive", () => {
    beforeEach(async () => {
      await useProjectsStore.getState().openProject("p-stokes-notes-v3");
    });

    it("commits the named path's edit into the project and persists it", async () => {
      useTabsStore.getState().updateContent("main.tex", "saved body");
      const saved = await useProjectsStore.getState().saveActive(["main.tex"]);
      expect(saved).toEqual(["main.tex"]);
      expect(useTabsStore.getState().edits).not.toHaveProperty("main.tex");
      expect(useProjectsStore.getState().active?.files["main.tex"]?.content).toBe("saved body");
    });

    it("saves every dirty file when no paths are passed", async () => {
      useTabsStore.getState().updateContent("main.tex", "a");
      useTabsStore.getState().updateContent("references.bib", "b");
      const saved = await useProjectsStore.getState().saveActive();
      expect(saved.sort()).toEqual(["main.tex", "references.bib"]);
      expect(useTabsStore.getState().edits).toEqual({});
    });

    it("returns an empty array when there's nothing to save", async () => {
      const saved = await useProjectsStore.getState().saveActive();
      expect(saved).toEqual([]);
    });

    it("returns an empty array when no project is active", async () => {
      useProjectsStore.getState().closeProject();
      const saved = await useProjectsStore.getState().saveActive();
      expect(saved).toEqual([]);
    });

    it("does not claim or discard an orphaned edit path", async () => {
      useTabsStore.getState().updateContent("ghost.tex", "orphaned edit");
      const saved = await useProjectsStore.getState().saveActive(["ghost.tex"]);

      expect(saved).toEqual([]);
      expect(useTabsStore.getState().edits["ghost.tex"]).toBe("orphaned edit");
      expect(useProjectsStore.getState().active?.files["ghost.tex"]).toBeUndefined();
    });

    it("returns an empty array and stores non-Error save failures", async () => {
      useTabsStore.getState().updateContent("main.tex", "will not save");
      setProjectService({
        async save() {
          throw "save down";
        },
      } as never);

      const saved = await useProjectsStore.getState().saveActive(["main.tex"]);

      expect(saved).toEqual([]);
      expect(useProjectsStore.getState().error).toBe("save down");
      expect(useTabsStore.getState().edits).toHaveProperty("main.tex");
    });

    it("returns an empty array and stores Error save failures", async () => {
      useTabsStore.getState().updateContent("main.tex", "will not save");
      setProjectService({
        async save() {
          throw new Error("save exploded");
        },
      } as never);

      const saved = await useProjectsStore.getState().saveActive(["main.tex"]);

      expect(saved).toEqual([]);
      expect(useProjectsStore.getState().error).toBe("save exploded");
      expect(useTabsStore.getState().edits).toHaveProperty("main.tex");
    });

    it("persists the saved content across openProject() round-trips", async () => {
      useTabsStore.getState().updateContent("main.tex", "round-tripped");
      await useProjectsStore.getState().saveActive(["main.tex"]);
      await useProjectsStore.getState().openProject("p-stokes-notes-v3");
      expect(useProjectsStore.getState().active?.files["main.tex"]?.content).toBe("round-tripped");
    });

    it("keeps a newer edit dirty while saving an earlier snapshot", async () => {
      const active = useProjectsStore.getState().active!;
      let finishSave: ((project: typeof active) => void) | undefined;
      setProjectService({
        save: () =>
          new Promise((resolve) => {
            finishSave = resolve;
          }),
        list: async () => [],
      } as never);
      useTabsStore.getState().updateContent("main.tex", "pushed snapshot");

      const saving = useProjectsStore
        .getState()
        .saveActive(["main.tex"], { "main.tex": "pushed snapshot" });
      useTabsStore.getState().updateContent("main.tex", "newer local edit");
      finishSave?.({
        ...active,
        files: {
          ...active.files,
          "main.tex": { ...active.files["main.tex"]!, content: "pushed snapshot" },
        },
      });

      expect(await saving).toEqual(["main.tex"]);
      expect(useProjectsStore.getState().active?.files["main.tex"]?.content).toBe(
        "pushed snapshot",
      );
      expect(useTabsStore.getState().edits["main.tex"]).toBe("newer local edit");
    });

    it("does not resurrect a project when an autosave finishes after close", async () => {
      const active = useProjectsStore.getState().active!;
      let finishSave: ((project: typeof active) => void) | undefined;
      setProjectService({
        save: () =>
          new Promise((resolve) => {
            finishSave = resolve;
          }),
      } as never);
      useTabsStore.getState().updateContent("main.tex", "autosave snapshot");

      const saving = useProjectsStore.getState().saveActive(["main.tex"]);
      useProjectsStore.getState().closeProject();
      finishSave?.({
        ...active,
        files: {
          ...active.files,
          "main.tex": { ...active.files["main.tex"]!, content: "autosave snapshot" },
        },
      });

      expect(await saving).toEqual(["main.tex"]);
      expect(useProjectsStore.getState().active).toBeNull();
      expect(useProjectsStore.getState().loading).toBe(false);
    });
  });

  describe("service binding failures", () => {
    it("loadSummaries stores unknown thrown values as strings", async () => {
      setProjectService({
        async list() {
          throw "catalogue offline";
        },
      } as never);

      await useProjectsStore.getState().loadSummaries();

      expect(useProjectsStore.getState().error).toBe("catalogue offline");
      expect(useProjectsStore.getState().loading).toBe(false);
    });

    it("openProject stores non-ProjectNotFound service errors", async () => {
      setProjectService({
        async open() {
          throw "open down";
        },
      } as never);

      await useProjectsStore.getState().openProject("p-any");

      expect(useProjectsStore.getState().error).toBe("open down");
      expect(useProjectsStore.getState().active).toBeNull();
    });

    it("openProject stores Error service failures", async () => {
      setProjectService({
        async open() {
          throw new Error("open exploded");
        },
      } as never);

      await useProjectsStore.getState().openProject("p-any");

      expect(useProjectsStore.getState().error).toBe("open exploded");
      expect(useProjectsStore.getState().active).toBeNull();
    });

    it("createProject stores unknown thrown values as strings", async () => {
      setProjectService({
        async create() {
          throw "create down";
        },
      } as never);

      const result = await useProjectsStore.getState().createProject("Broken");

      expect(result).toBeNull();
      expect(useProjectsStore.getState().error).toBe("create down");
    });
  });
});
