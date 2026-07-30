import { describe, expect, it } from "vitest";
import type { Project } from "@/domain";
import { readProjectDirectory, writeProjectDirectory } from "./local-folder-service";

function readableFile(name: string, content: string | Uint8Array): FileSystemFileHandle {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return {
    kind: "file",
    name,
    getFile: async () =>
      ({
        name,
        size: bytes.byteLength,
        text: async () => new TextDecoder().decode(bytes),
        arrayBuffer: async () => bytes.slice().buffer,
      }) as File,
  } as FileSystemFileHandle;
}

function readableDirectory(
  name: string,
  children: Record<string, FileSystemHandle>,
): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name,
    async *entries() {
      for (const entry of Object.entries(children)) yield entry;
    },
  } as FileSystemDirectoryHandle;
}

function writableDirectory(name = "output") {
  const written = new Map<string, string | Uint8Array>();
  const makeDirectory = (prefix: string): FileSystemDirectoryHandle =>
    ({
      kind: "directory",
      name: prefix.split("/").pop() || name,
      getDirectoryHandle: async (child: string) =>
        makeDirectory(prefix ? `${prefix}/${child}` : child),
      getFileHandle: async (fileName: string) =>
        ({
          kind: "file",
          name: fileName,
          createWritable: async () => {
            let value: string | Uint8Array = "";
            return {
              write: async (chunk: FileSystemWriteChunkType) => {
                if (typeof chunk === "string") value = chunk;
                else if (chunk instanceof ArrayBuffer) value = new Uint8Array(chunk);
                else throw new Error("Unexpected test chunk");
              },
              close: async () => {
                written.set(prefix ? `${prefix}/${fileName}` : fileName, value);
              },
              abort: async () => undefined,
            } as FileSystemWritableFileStream;
          },
        }) as FileSystemFileHandle,
    }) as FileSystemDirectoryHandle;
  return { handle: makeDirectory(""), written };
}

describe("local-folder-service", () => {
  it("imports a nested LaTeX folder and ignores generated/build files", async () => {
    const handle = readableDirectory("paper", {
      "main.tex": readableFile("main.tex", "\\documentclass{article}"),
      "main.aux": readableFile("main.aux", "generated"),
      "figure.png": readableFile("figure.png", new Uint8Array([1, 2, 3])),
      chapters: readableDirectory("chapters", {
        "intro.tex": readableFile("intro.tex", "\\section{Intro}"),
      }),
      ".git": readableDirectory(".git", {
        config: readableFile("config", "secret metadata"),
      }),
    });

    const project = await readProjectDirectory(handle);

    expect(project.name).toBe("paper");
    expect(project.entry).toBe("main.tex");
    expect(project.files["main.aux"]).toBeUndefined();
    expect(project.files[".git/config"]).toBeUndefined();
    expect(project.files["chapters/intro.tex"]?.content).toBe("\\section{Intro}");
    expect(project.files["figure.png"]?.content).toBeInstanceOf(Uint8Array);
    expect(project.folders.chapters).toMatchObject({ name: "chapters", expanded: true });
  });

  it("rejects folders without a TeX document", async () => {
    const handle = readableDirectory("notes", {
      "README.md": readableFile("README.md", "No TeX here"),
    });

    await expect(readProjectDirectory(handle)).rejects.toThrow(/does not contain.*\.tex/i);
  });

  it("writes nested files and applies unsaved text overlays", async () => {
    const { handle, written } = writableDirectory();
    const project: Project = {
      id: "p-folder",
      name: "Folder",
      entry: "main.tex",
      files: {
        "main.tex": {
          id: "main",
          path: "main.tex",
          name: "main.tex",
          kind: "tex",
          content: "old",
        },
        "figures/plot.png": {
          id: "plot",
          path: "figures/plot.png",
          name: "plot.png",
          kind: "img",
          content: new Uint8Array([4, 5, 6]),
        },
      },
      folders: {},
      createdAt: "2026-07-10T00:00:00Z",
    };

    const count = await writeProjectDirectory(handle, project, { "main.tex": "current edit" });

    expect(count).toBe(2);
    expect(written.get("main.tex")).toBe("current edit");
    expect(Array.from(written.get("figures/plot.png") as Uint8Array)).toEqual([4, 5, 6]);
  });
});
