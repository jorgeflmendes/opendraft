import { describe, it, expect } from "vitest";
import type { Project } from "@/domain";
import {
  EXPORT_SCHEMA_VERSION,
  InvalidImportError,
  parseExportedProject,
  serializeProject,
  serializeProjectToZip,
  parseImportedZip,
} from "./project-io";
import JSZip from "jszip";

const sampleProject = (): Project => ({
  id: "p-x",
  name: "Demo",
  entry: "main.tex",
  files: {
    "main.tex": {
      id: "p-x-main",
      path: "main.tex",
      name: "main.tex",
      kind: "tex",
      content: "\\documentclass{article}\n",
    },
  },
  folders: { figures: { path: "figures", name: "figures", expanded: true } },
  createdAt: "2026-05-22T12:00:00Z",
});

describe("serializeProject", () => {
  it("wraps the project in a versioned envelope", async () => {
    const json = await serializeProject(sampleProject());
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe("opendraft.project");
    expect(parsed.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(parsed.project.id).toBe("p-x");
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("does not export soft-deleted files in JSON or ZIP", async () => {
    const project = sampleProject();
    project.files["secret.tex"] = {
      id: "secret",
      path: "secret.tex",
      name: "secret.tex",
      kind: "tex",
      content: "deleted content",
      deletedAt: "2026-07-30T00:00:00.000Z",
    };

    const json = JSON.parse(await serializeProject(project));
    expect(json.project.files["secret.tex"]).toBeUndefined();

    const zip = await JSZip.loadAsync(await serializeProjectToZip(project));
    expect(zip.file("secret.tex")).toBeNull();
    expect(zip.file("main.tex")).not.toBeNull();
  });

  it("handles Blob content when serializing to JSON", async () => {
    const proj = sampleProject();
    const bytes = new Uint8Array([1, 2, 3]);

    const mockBlob = new Blob([bytes]);
    if (!mockBlob.arrayBuffer) {
      (mockBlob as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () =>
        Promise.resolve(bytes.buffer);
    }

    proj.files["blob.bin"] = {
      id: "blob1",
      path: "blob.bin",
      name: "blob.bin",
      kind: "other",
      content: mockBlob,
    };
    const json = await serializeProject(proj);
    const parsed = JSON.parse(json);
    expect(parsed.project.files["blob.bin"].contentEncoding).toBe("base64");
    expect(parsed.project.files["blob.bin"].content).toBe("AQID"); // btoa("\x01\x02\x03")
  });

  it("handles Blob content when serializing to zip", async () => {
    const proj = sampleProject();
    const mockBlob = new Blob([new Uint8Array([1, 2, 3])]);

    proj.files["data.blob"] = {
      id: "data1",
      path: "data.blob",
      name: "data.blob",
      kind: "other",
      content: mockBlob,
    };

    const zipBlob = await serializeProjectToZip(proj);
    expect(zipBlob).toBeInstanceOf(Blob);
  });
});

describe("serializeProjectToZip", () => {
  it("generates a ZIP file containing text and binary files", async () => {
    const proj = sampleProject();
    proj.files["logo.png"] = {
      id: "logo1",
      path: "logo.png",
      name: "logo.png",
      kind: "img",
      content: new Uint8Array([137, 80, 78, 71]),
    };

    const zipBlob = await serializeProjectToZip(proj);
    expect(zipBlob).toBeInstanceOf(Blob);

    const zip = new JSZip();
    await zip.loadAsync(zipBlob);
    expect(zip.file("main.tex")).not.toBeNull();
    expect(await zip.file("main.tex")!.async("string")).toBe("\\documentclass{article}\n");
    expect(await zip.file("logo.png")!.async("uint8array")).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
  });
});

describe("parseImportedZip", () => {
  it("parses a ZIP file back into a Project", async () => {
    const zip = new JSZip();
    zip.file("main.tex", "\\documentclass{article}");
    zip.file("figures/logo.png", new Uint8Array([1, 2, 3]));
    zip.file("biblio.bib", "author");
    zip.file("styles.sty", "style");
    zip.file("data.yml", "yaml");
    zip.file("README.md", "readme");
    zip.file("notes.txt", "notes");
    zip.file("data.csv", "csv"); // other
    zip.file("fonts/research.ttf", new Uint8Array([0, 1, 255, 128]));
    zip.folder("empty-folder/");

    const blob = await zip.generateAsync({ type: "blob" });
    const project = await parseImportedZip(blob);

    expect(project.entry).toBe("main.tex");
    expect(project.files["main.tex"]!.kind).toBe("tex");
    expect(project.files["figures/logo.png"]!.kind).toBe("img");
    expect(project.files["biblio.bib"]!.kind).toBe("bib");
    expect(project.files["styles.sty"]!.kind).toBe("sty");
    expect(project.files["data.yml"]!.kind).toBe("yml");
    expect(project.files["README.md"]!.kind).toBe("md");
    expect(project.files["notes.txt"]!.kind).toBe("txt");
    expect(project.files["data.csv"]!.kind).toBe("other");
    expect(project.files["fonts/research.ttf"]!.content).toStrictEqual(
      new Uint8Array([0, 1, 255, 128]),
    );

    expect(project.folders["figures"]).toBeDefined();
    expect(project.folders["empty-folder"]).toBeDefined();
  });

  it("handles missing main.tex by picking another file", async () => {
    const zip = new JSZip();
    zip.file("other.tex", "\\documentclass{article}");
    zip.file("README.md", "readme");

    const project = await parseImportedZip(await zip.generateAsync({ type: "blob" }));
    expect(project.entry).toBe("other.tex");
  });

  it("handles absolutely no tex files", async () => {
    const zip = new JSZip();
    zip.file("README.md", "readme");

    const project = await parseImportedZip(await zip.generateAsync({ type: "blob" }));
    expect(project.entry).toBe("README.md");
  });

  it("throws when ZIP is empty of valid files", async () => {
    const zip = new JSZip();
    zip.folder("empty/");
    await expect(parseImportedZip(await zip.generateAsync({ type: "blob" }))).rejects.toThrow(
      /no valid project files/,
    );
  });

  it("ignores files and folders with invalid traversal paths", async () => {
    const zip = new JSZip();
    zip.file("main.tex", "tex");
    zip.file("../escape.tex", "escape");
    zip.folder("../escape-dir/");

    const project = await parseImportedZip(await zip.generateAsync({ type: "blob" }));
    expect(project.files["main.tex"]).toBeDefined();
    expect(project.files["../escape.tex"]).toBeUndefined();
    expect(project.folders["../escape-dir"]).toBeUndefined();
  });
});

describe("parseExportedProject", () => {
  it("round-trips a serialised project", async () => {
    const original = sampleProject();
    const restored = parseExportedProject(await serializeProject(original));
    expect(restored).toEqual(original);
  });

  it("accepts a parsed object as input", async () => {
    const original = sampleProject();
    const restored = parseExportedProject(JSON.parse(await serializeProject(original)));
    expect(restored.id).toBe(original.id);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseExportedProject("not json")).toThrow(InvalidImportError);
  });

  it("rejects a non-object payload", () => {
    expect(() => parseExportedProject("42")).toThrow(/object/i);
  });

  it("rejects a missing or wrong format identifier", () => {
    expect(() => parseExportedProject(JSON.stringify({ schemaVersion: 1 }))).toThrow(/format/i);
  });

  it("rejects an unsupported schemaVersion", () => {
    expect(() =>
      parseExportedProject(
        JSON.stringify({
          format: "opendraft.project",
          schemaVersion: 99,
          project: sampleProject(),
        }),
      ),
    ).toThrow(/schemaVersion/i);
  });

  it("rejects missing project object", () => {
    expect(() =>
      parseExportedProject(
        JSON.stringify({
          format: "opendraft.project",
          schemaVersion: 2,
        }),
      ),
    ).toThrow(/Envelope missing/i);
  });

  it("rejects non-object files or folders", async () => {
    const proj1 = sampleProject() as unknown as Record<string, unknown>;
    proj1.files = null;
    expect(() =>
      parseExportedProject(
        JSON.stringify({ format: "opendraft.project", schemaVersion: 2, project: proj1 }),
      ),
    ).toThrow(/files must be an object/i);

    const proj2 = sampleProject() as unknown as Record<string, unknown>;
    proj2.folders = [];
    expect(() =>
      parseExportedProject(
        JSON.stringify({ format: "opendraft.project", schemaVersion: 2, project: proj2 }),
      ),
    ).toThrow(/folders must be an object/i);
  });

  it("rejects when files key disagrees with its path", async () => {
    const original = sampleProject();
    original.files["mismatch.tex"] = { ...original.files["main.tex"]!, path: "main.tex" };
    const json = await serializeProject(original);
    expect(() => parseExportedProject(json)).toThrow(/disagrees/i);
  });

  it("rejects when entry doesn't exist in files", async () => {
    const original = sampleProject();
    original.entry = "ghost.tex";
    const json = await serializeProject(original);
    expect(() => parseExportedProject(json)).toThrow(/entry/i);
  });

  it("rejects missing or wrong types for string fields", async () => {
    const original = sampleProject() as unknown as Record<string, unknown>;
    original.name = 123;
    const json = await serializeProject(original as unknown as Project);
    expect(() => parseExportedProject(json)).toThrow(/must be a string/i);
  });

  it("rejects traversal paths and inconsistent folder records", async () => {
    const traversal = sampleProject();
    traversal.files["../escape.tex"] = {
      ...traversal.files["main.tex"]!,
      path: "../escape.tex",
      name: "escape.tex",
    };
    const json1 = await serializeProject(traversal);
    expect(() => parseExportedProject(json1)).toThrow(/invalid path/i);

    const folderMismatch = sampleProject();
    folderMismatch.folders.figures = { path: "other", name: "other", expanded: false };
    const json2 = await serializeProject(folderMismatch);
    expect(() => parseExportedProject(json2)).toThrow(/disagrees/i);
  });

  it("rejects invalid folder definitions", async () => {
    const original = sampleProject() as unknown as Record<string, unknown>;
    (original.folders as Record<string, unknown>)["new-dir"] = "not-an-object";
    const json = await serializeProject(original as unknown as Project);
    expect(() => parseExportedProject(json)).toThrow(/is not an object/i);
  });

  it("rejects invalid file definitions inside files object", async () => {
    const original = sampleProject() as unknown as Record<string, unknown>;
    (original.files as Record<string, unknown>)["test.tex"] = "not-an-object";
    const json = await serializeProject(original as unknown as Project);
    expect(() => parseExportedProject(json)).toThrow(/is not an object/i);
  });

  it("accepts 'modified: true' flag on file", async () => {
    const original = sampleProject();
    (original.files["main.tex"] as unknown as Record<string, unknown>).modified = true;
    const json = await serializeProject(original);
    const restored = parseExportedProject(json);
    expect((restored.files["main.tex"] as unknown as Record<string, unknown>).modified).toBe(true);
  });

  it("rejects base64 encoding errors or large files", async () => {
    const proj = sampleProject();
    const projJson = JSON.parse(await serializeProject(proj));
    projJson.project.files["main.tex"].contentEncoding = "unknown";
    expect(() => parseExportedProject(JSON.stringify(projJson))).toThrow(
      /Unknown contentEncoding/i,
    );

    projJson.project.files["main.tex"].contentEncoding = "base64";
    projJson.project.files["main.tex"].content = btoa("Hello");
    const parsed = parseExportedProject(JSON.stringify(projJson));
    expect(parsed.files["main.tex"]!.content).toBeInstanceOf(Uint8Array);

    projJson.project.name = "";
    expect(() => parseExportedProject(JSON.stringify(projJson))).toThrow(/empty/i);
  });

  it("rejects invalid files or folders arrays", async () => {
    const proj = sampleProject();
    const projJson = JSON.parse(await serializeProject(proj));
    projJson.project.files = [];
    expect(() => parseExportedProject(JSON.stringify(projJson))).toThrow(/must be an object/i);

    projJson.project.files = {};
    expect(() => parseExportedProject(JSON.stringify(projJson))).toThrow(/at least one file/i);
  });

  it("rejects projects beyond the file and folder count budgets", async () => {
    const manyFilesProj = sampleProject();
    for (let i = 0; i < 2001; i++) {
      manyFilesProj.files[`f${i}.tex`] = {
        id: `f${i}`,
        path: `f${i}.tex`,
        name: `f${i}.tex`,
        kind: "tex",
        content: "",
      };
    }
    await expect(
      serializeProject(manyFilesProj).then((j) => parseExportedProject(j)),
    ).rejects.toThrow(/file import limit/i);

    const manyFoldersProj = sampleProject();
    for (let i = 0; i < 5001; i++) {
      manyFoldersProj.folders[`d${i}`] = { path: `d${i}`, name: `d${i}` };
    }
    await expect(
      serializeProject(manyFoldersProj).then((j) => parseExportedProject(j)),
    ).rejects.toThrow(/folder import limit/i);
  });

  it("rejects unknown kinds", async () => {
    const proj = sampleProject();
    const projJson = JSON.parse(await serializeProject(proj));
    projJson.project.files["main.tex"].kind = "unknownkind";
    expect(() => parseExportedProject(JSON.stringify(projJson))).toThrow(/Unknown file kind/i);
  });

  it("rejects unknown file kinds and inconsistent file names", async () => {
    const badKind = JSON.parse(await serializeProject(sampleProject()));
    badKind.project.files["main.tex"].kind = "executable";
    expect(() => parseExportedProject(badKind)).toThrow(/unknown file kind/i);

    const badName = JSON.parse(await serializeProject(sampleProject()));
    badName.project.files["main.tex"].name = "other.tex";
    expect(() => parseExportedProject(badName)).toThrow(/inconsistent name/i);
  });

  it("rejects empty projects and invalid creation dates", async () => {
    const empty = JSON.parse(await serializeProject(sampleProject()));
    empty.project.files = {};
    expect(() => parseExportedProject(empty)).toThrow(/at least one file/i);

    const invalidDate = JSON.parse(await serializeProject(sampleProject()));
    invalidDate.project.createdAt = "not-a-date";
    expect(() => parseExportedProject(invalidDate)).toThrow(/valid ISO date/i);
  });

  it("rejects malformed file entries", () => {
    const broken = {
      format: "opendraft.project",
      schemaVersion: EXPORT_SCHEMA_VERSION,
      project: {
        id: "x",
        name: "x",
        entry: "main.tex",
        files: { "main.tex": "not-an-object" },
        folders: {},
        createdAt: "2026-01-01T00:00:00Z",
      },
    };
    expect(() => parseExportedProject(JSON.stringify(broken))).toThrow(/not an object/i);
  });

  describe("binary file content", () => {
    it("round-trips a Uint8Array file through base64", async () => {
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic
      const project = sampleProject();
      project.files["logo.png"] = {
        id: "p-x-logo",
        path: "logo.png",
        name: "logo.png",
        kind: "img",
        content: bytes,
      };
      const json = await serializeProject(project);
      const parsed = JSON.parse(json) as {
        project: { files: Record<string, { content: string; contentEncoding?: string }> };
      };
      const logoRaw = parsed.project.files["logo.png"]!;
      expect(logoRaw.contentEncoding).toBe("base64");
      expect(typeof logoRaw.content).toBe("string");

      const restored = parseExportedProject(json);
      const restoredContent = restored.files["logo.png"]!.content;
      expect(restoredContent).toBeInstanceOf(Uint8Array);
      expect(Array.from(restoredContent as Uint8Array)).toEqual(Array.from(bytes));
    });

    it("text files keep their plain shape - no contentEncoding emitted", async () => {
      const json = await serializeProject(sampleProject());
      const parsed = JSON.parse(json);
      expect(parsed.project.files["main.tex"].contentEncoding).toBeUndefined();
      expect(typeof parsed.project.files["main.tex"].content).toBe("string");
    });

    it("accepts a legacy schemaVersion=1 envelope (text-only)", () => {
      const legacy = {
        format: "opendraft.project",
        schemaVersion: 1,
        project: {
          id: "x",
          name: "x",
          entry: "main.tex",
          files: {
            "main.tex": {
              id: "f",
              path: "main.tex",
              name: "main.tex",
              kind: "tex",
              content: "legacy body",
            },
          },
          folders: {},
          createdAt: "2026-01-01T00:00:00Z",
        },
      };
      const restored = parseExportedProject(JSON.stringify(legacy));
      expect(restored.files["main.tex"]!.content).toBe("legacy body");
    });

    it("rejects an unknown contentEncoding", () => {
      const broken = {
        format: "opendraft.project",
        schemaVersion: EXPORT_SCHEMA_VERSION,
        project: {
          id: "x",
          name: "x",
          entry: "main.tex",
          files: {
            "main.tex": {
              id: "f",
              path: "main.tex",
              name: "main.tex",
              kind: "tex",
              content: "x",
              contentEncoding: "rot13",
            },
          },
          folders: {},
          createdAt: "2026-01-01T00:00:00Z",
        },
      };
      expect(() => parseExportedProject(JSON.stringify(broken))).toThrow(/contentEncoding/i);
    });

    it("normalises malformed base64 into a domain import error", async () => {
      const broken = JSON.parse(await serializeProject(sampleProject()));
      broken.project.files["main.tex"].contentEncoding = "base64";
      broken.project.files["main.tex"].content = "not%%%base64";
      expect(() => parseExportedProject(broken)).toThrow(InvalidImportError);
      expect(() => parseExportedProject(broken)).toThrow(/malformed base64/i);
    });
  });
});
