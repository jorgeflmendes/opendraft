import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project } from "@/domain";
import { MemoryKVStore } from "./memory-kv-store";
import {
  PersistenceProjectStore,
  projectToSummary,
  type SavedProject,
  type SavedProjectV3,
} from "./project-store";

const mkProject = (id: string, name: string, overrides: Partial<Project> = {}): Project => ({
  id,
  name,
  entry: "main.tex",
  files: {
    "main.tex": {
      id: `${id}-main`,
      path: "main.tex",
      name: "main.tex",
      kind: "tex",
      content: "% empty",
    },
  },
  folders: {},
  createdAt: "2026-05-22T12:00:00Z",
  ...overrides,
});

describe("PersistenceProjectStore", () => {
  let kv: MemoryKVStore<SavedProject>;
  let store: PersistenceProjectStore;
  beforeEach(() => {
    kv = new MemoryKVStore<SavedProject>();
    store = new PersistenceProjectStore(kv);
  });

  it("put() then get() round-trips a Project", async () => {
    const p = mkProject("p-a", "A");
    await store.put(p);
    const out = await store.get("p-a");
    expect(out?.id).toBe("p-a");
    expect(out?.name).toBe("A");
  });

  it("get() returns undefined for an unknown id", async () => {
    expect(await store.get("p-ghost")).toBeUndefined();
  });

  it("put() stamps a savedAt and a schemaVersion", async () => {
    await store.put(mkProject("p-a", "A"));
    const entries = await kv.entries();
    const projectEntry = entries.find(([k]) => !k.startsWith("file:"));
    if (!projectEntry) throw new Error("expected one project entry");
    const record = projectEntry[1] as SavedProjectV3;
    expect(record.schemaVersion).toBe(3);
    expect(record.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("delete() soft-deletes the entry", async () => {
    await store.put(mkProject("p-a", "A"));
    await store.delete("p-a");
    const out = await store.list({ includeDeleted: false });
    expect(out.length).toBe(0);
    const outInc = await store.list({ includeDeleted: true });
    expect(outInc.length).toBe(1);
    expect(await store.get("p-a")).toBeUndefined();

    // Test hard delete
    await store.hardDelete("p-a");
    const outHard = await store.list({ includeDeleted: true });
    expect(outHard.length).toBe(0);
  });

  it("list() returns persisted projects newest-savedAt first", async () => {
    await store.put(mkProject("p-a", "A"));
    await new Promise((r) => setTimeout(r, 5));
    await store.put(mkProject("p-b", "B"));
    const list = await store.list();
    expect(list.map((p) => p.id)).toEqual(["p-b", "p-a"]);
  });

  it("listSummaries() projects each entry", async () => {
    await store.put(mkProject("p-a", "Alpha"));
    const [summary] = await store.listSummaries();
    expect(summary?.name).toBe("Alpha");
    expect(summary?.fileCount).toBe(1);
    expect(summary?.lastOpenedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(summary?.lastOpenedAt).not.toBe("2026-05-22T12:00:00Z");
  });

  it("patchFiles writes only changed file shards and updates the returned project", async () => {
    const project = mkProject("p-a", "Alpha");
    project.files["chapter.tex"] = {
      id: "p-a-chapter",
      path: "chapter.tex",
      name: "chapter.tex",
      kind: "tex",
      content: "old",
    };
    await store.put(project);
    const updated = {
      ...project,
      files: {
        ...project.files,
        "chapter.tex": { ...project.files["chapter.tex"]!, content: "new" },
      },
    };
    const batch = vi.spyOn(kv, "batch");

    await store.patchFiles(updated, ["chapter.tex"]);

    expect(batch).toHaveBeenCalledOnce();
    const [puts, deletes] = batch.mock.calls[0]!;
    expect(puts.map(([key]) => key)).toEqual(["project:p-a", "file:p-a:chapter.tex"]);
    expect(deletes).toEqual([]);
    expect((await store.get("p-a"))?.files["chapter.tex"]?.content).toBe("new");
    expect((await store.get("p-a"))?.files["main.tex"]?.content).toBe("% empty");
  });

  it("listSummaries reads V3 metadata without loading file shards", async () => {
    await store.put(mkProject("p-a", "Alpha"));
    const entries = vi.spyOn(kv, "entries");

    const summaries = await store.listSummaries();

    expect(summaries).toHaveLength(1);
    expect(entries).toHaveBeenCalledOnce();
    expect(entries).toHaveBeenCalledWith("project:");
  });

  it("wipe() clears every project", async () => {
    await store.put(mkProject("p-a", "A"));
    await store.put(mkProject("p-b", "B"));
    await store.wipe();
    expect(await store.list()).toEqual([]);
  });
});

describe("projectToSummary", () => {
  it("counts .tex files separately from total files", () => {
    const p = mkProject("p-a", "A");
    p.files["refs.bib"] = {
      id: "p-a-refs",
      path: "refs.bib",
      name: "refs.bib",
      kind: "bib",
      content: "",
    };
    const s = projectToSummary(p);
    expect(s.fileCount).toBe(2);
    expect(s.texFileCount).toBe(1);
  });

  it("does not count or describe soft-deleted files", () => {
    const p = mkProject("p-a", "A");
    p.files["deleted.tex"] = {
      id: "deleted",
      path: "deleted.tex",
      name: "deleted.tex",
      kind: "tex",
      content: "",
      deletedAt: "2026-07-30T00:00:00.000Z",
    };
    p.files["README.md"] = {
      id: "readme",
      path: "README.md",
      name: "README.md",
      kind: "md",
      content: "This description must not leak",
      deletedAt: "2026-07-30T00:00:00.000Z",
    };

    const summary = projectToSummary(p);
    expect(summary.fileCount).toBe(1);
    expect(summary.texFileCount).toBe(1);
    expect(summary.description).not.toContain("must not leak");
  });

  it("uses the first non-heading README line as the description", () => {
    const p = mkProject("p-a", "A");
    p.files["README.md"] = {
      id: "p-a-readme",
      path: "README.md",
      name: "README.md",
      kind: "md",
      content: "# Title\n\nFirst body line here.\n",
    };
    expect(projectToSummary(p).description).toBe("First body line here.");
  });

  it("falls back to a generic description when README is absent", () => {
    const s = projectToSummary(mkProject("p-a", "A"));
    expect(s.description).toMatch(/local project/i);
  });
});
