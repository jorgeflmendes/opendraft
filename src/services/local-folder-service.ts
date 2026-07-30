import { activeFileEntries, type FileNode, type Project, type ProjectFolder } from "@/domain";
import { basename, dirname, inferFileKind, validatePath } from "./path-utils";
import { isTextProjectPath } from "./file-classification";

const MAX_FILES = 2_000;
const MAX_DIRECTORIES = 5_000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);
const IGNORED_FILE_SUFFIXES = [
  ".aux",
  ".blg",
  ".fdb_latexmk",
  ".fls",
  ".log",
  ".out",
  ".synctex.gz",
  ".toc",
];
interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: "desktop" | "documents" | "downloads";
}

type DirectoryPicker = (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;

function directoryPicker(): DirectoryPicker | null {
  if (typeof window === "undefined") return null;
  return (
    (
      window as unknown as {
        showDirectoryPicker?: DirectoryPicker;
      }
    ).showDirectoryPicker ?? null
  );
}

export function supportsLocalFolderAccess(): boolean {
  return directoryPicker() !== null;
}

export function isFolderPickerCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function pickLocalLatexProject(): Promise<Project> {
  const picker = directoryPicker();
  if (!picker) {
    throw new Error("Local folder access is not supported by this browser");
  }
  const handle = await picker.call(window, {
    id: "opendraft-open-project",
    mode: "read",
    startIn: "documents",
  });
  return readProjectDirectory(handle);
}

export async function saveProjectToLocalFolder(
  project: Project,
  edits: Readonly<Record<string, string>> = {},
): Promise<number> {
  const picker = directoryPicker();
  if (!picker) {
    throw new Error("Local folder access is not supported by this browser");
  }
  const handle = await picker.call(window, {
    id: `opendraft-save-${project.id}`,
    mode: "readwrite",
    startIn: "documents",
  });
  return writeProjectDirectory(handle, project, edits);
}

export async function readProjectDirectory(handle: FileSystemDirectoryHandle): Promise<Project> {
  const id = newFolderProjectId();
  const files: Record<string, FileNode> = {};
  const folders: Record<string, ProjectFolder> = {};
  const budget = { files: 0, directories: 0, bytes: 0 };

  await readDirectory(handle, "", id, files, folders, budget);
  const entry = chooseEntry(files);
  if (!entry) {
    throw new Error("The selected folder does not contain a LaTeX .tex document");
  }

  return {
    id,
    name: handle.name || "Local LaTeX project",
    entry,
    files,
    folders,
    createdAt: new Date().toISOString(),
  };
}

export async function writeProjectDirectory(
  handle: FileSystemDirectoryHandle,
  project: Project,
  edits: Readonly<Record<string, string>> = {},
): Promise<number> {
  let written = 0;
  for (const [path, file] of activeFileEntries(project).sort(([a], [b]) => a.localeCompare(b))) {
    validatePath(path);
    const content = edits[path] ?? file.content;
    const parent = await ensureDirectory(handle, dirname(path));
    const fileHandle = await parent.getFileHandle(basename(path), { create: true });
    const writable = await fileHandle.createWritable();
    try {
      if (typeof content === "string") {
        await writable.write(content);
      } else if (ArrayBuffer.isView(content)) {
        const buffer = new ArrayBuffer(content.byteLength);
        new Uint8Array(buffer).set(content as Uint8Array);
        await writable.write(buffer);
      } else {
        await writable.write(content as Blob);
      }
      await writable.close();
      written += 1;
    } catch (error) {
      await writable.abort(error).catch(() => undefined);
      throw error;
    }
  }
  return written;
}

async function readDirectory(
  handle: FileSystemDirectoryHandle,
  parentPath: string,
  projectId: string,
  files: Record<string, FileNode>,
  folders: Record<string, ProjectFolder>,
  budget: { files: number; directories: number; bytes: number },
): Promise<void> {
  const entries: Array<[string, FileSystemHandle]> = [];
  for await (const entry of handle.entries()) entries.push(entry);
  entries.sort(([a], [b]) => a.localeCompare(b));

  for (const [name, child] of entries) {
    if (child.kind === "directory" && IGNORED_DIRECTORIES.has(name.toLowerCase())) continue;
    const path = parentPath ? `${parentPath}/${name}` : name;
    validatePath(path);
    if (child.kind === "directory") {
      budget.directories += 1;
      if (budget.directories > MAX_DIRECTORIES) {
        throw new Error(`Local folder exceeds the ${MAX_DIRECTORIES} directory safety limit`);
      }
      folders[path] = { path, name, expanded: parentPath === "" };
      await readDirectory(
        child as FileSystemDirectoryHandle,
        path,
        projectId,
        files,
        folders,
        budget,
      );
      continue;
    }
    if (shouldIgnoreFile(name)) continue;
    if (budget.files >= MAX_FILES) {
      throw new Error(`Local folder exceeds the ${MAX_FILES} file safety limit`);
    }
    const diskFile = await (child as FileSystemFileHandle).getFile();
    if (diskFile.size > MAX_FILE_BYTES) {
      throw new Error(`${path} exceeds the 64 MB per-file safety limit`);
    }
    if (budget.bytes + diskFile.size > MAX_TOTAL_BYTES) {
      throw new Error("Local folder exceeds the 256 MB total safety limit");
    }
    budget.files += 1;
    budget.bytes += diskFile.size;
    const kind = inferFileKind(path);
    const content = isTextProjectPath(path)
      ? await diskFile.text()
      : new Uint8Array(await diskFile.arrayBuffer());
    files[path] = {
      id: `${projectId}-${path.replace(/[^a-z0-9]+/gi, "-")}`,
      path,
      name,
      kind,
      content,
    };
  }
}

async function ensureDirectory(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of path.split("/")) {
    if (!segment) continue;
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

function chooseEntry(files: Record<string, FileNode>): string | null {
  if (files["main.tex"]) return "main.tex";
  const paths = Object.keys(files);
  return (
    paths.find((path) => /(^|\/)main\.tex$/i.test(path)) ??
    paths.find((path) => {
      const content = files[path]?.content;
      return (
        path.toLowerCase().endsWith(".tex") &&
        typeof content === "string" &&
        /\\documentclass\b/.test(content)
      );
    }) ??
    paths.find((path) => path.toLowerCase().endsWith(".tex")) ??
    null
  );
}

function shouldIgnoreFile(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === ".ds_store" ||
    lower === "thumbs.db" ||
    IGNORED_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix))
  );
}

function newFolderProjectId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `p-folder-${crypto.randomUUID()}`;
  }
  return `p-folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
