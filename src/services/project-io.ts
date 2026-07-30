import { activeFileEntries, type Project } from "@/domain";
import { basename, inferFileKind, validatePath } from "./path-utils";
import { isTextProjectPath } from "./file-classification";
import JSZip from "jszip";

// Schema 2 adds base64-encoded binary content. Missing encoding remains UTF-8
// for backwards compatibility with schema 1 exports.
export const EXPORT_SCHEMA_VERSION = 2;
const FILE_KINDS = new Set(["tex", "bib", "sty", "yml", "md", "txt", "img", "other"]);
const MAX_PROJECT_FILES = 2_000;
const MAX_PROJECT_FOLDERS = 5_000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

export class InvalidImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImportError";
  }
}

/** Serialise a Project into a stable JSON envelope. Binary file
 *  contents (Uint8Array) are base64-encoded with a sentinel
 *  `contentEncoding` field so the importer can round-trip them
 *  back to bytes. Text files round-trip identically to schema 1. */
export async function serializeProject(project: Project): Promise<string> {
  const files: Record<string, unknown> = {};
  for (const [path, file] of activeFileEntries(project)) {
    if (ArrayBuffer.isView(file.content)) {
      files[path] = {
        ...file,
        content: uint8ToBase64(file.content as Uint8Array),
        contentEncoding: "base64",
      };
    } else if (typeof Blob !== "undefined" && file.content instanceof Blob) {
      const buffer = await file.content.arrayBuffer();
      files[path] = {
        ...file,
        content: uint8ToBase64(new Uint8Array(buffer)),
        contentEncoding: "base64",
      };
    } else {
      files[path] = file;
    }
  }
  const envelope = {
    format: "opendraft.project" as const,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    project: { ...project, files },
  };
  return JSON.stringify(envelope, null, 2);
}

/** Serialise a Project into a standard ZIP file. Useful for
 *  porting to Overleaf or other LaTeX environments. */
export async function serializeProjectToZip(project: Project): Promise<Blob> {
  const zip = new JSZip();

  for (const [path, file] of activeFileEntries(project)) {
    if (ArrayBuffer.isView(file.content)) {
      zip.file(path, file.content as Uint8Array);
    } else if (typeof Blob !== "undefined" && file.content instanceof Blob) {
      zip.file(path, file.content);
    } else {
      zip.file(path, file.content);
    }
  }

  return zip.generateAsync({ type: "blob" });
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, "");
  if (clean.length > Math.ceil((MAX_FILE_BYTES * 4) / 3)) {
    throw new InvalidImportError("Base64 file exceeds the 64 MB import limit");
  }
  let binary: string;
  try {
    binary = atob(clean);
  } catch {
    throw new InvalidImportError("Malformed base64 file content");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Parse a JSON blob into a Project, rejecting anything that
 * doesn't structurally look like an export. Conservative on
 * purpose - we'd rather reject a plausible-but-wrong file than
 * silently load it as a project.
 */
export async function parseImportedZip(blob: Blob): Promise<Project> {
  const zip = new JSZip();
  await zip.loadAsync(blob);

  const files: Record<string, Project["files"][string]> = {};
  const folders: Record<string, Project["folders"][string]> = {};
  let entry = "main.tex";
  let hasMain = false;
  let totalBytes = 0;
  const archiveFiles = Object.values(zip.files).filter((file) => !file.dir);
  if (archiveFiles.length > MAX_PROJECT_FILES) {
    throw new InvalidImportError(`Zip exceeds the ${MAX_PROJECT_FILES} file import limit`);
  }

  for (const relativePath of Object.keys(zip.files)) {
    const zipObj = zip.files[relativePath]!;
    if (zipObj.dir) {
      const cleanPath = relativePath.endsWith("/") ? relativePath.slice(0, -1) : relativePath;
      try {
        validatePath(cleanPath);
        folders[cleanPath] = {
          name: basename(cleanPath),
          path: cleanPath,
          expanded: false,
        };
      } catch {
        // Invalid archive entries do not make otherwise valid files unimportable.
      }
      continue;
    }

    try {
      validatePath(relativePath);
      const bytes = await zipObj.async("uint8array");
      if (bytes.byteLength > MAX_FILE_BYTES) {
        throw new InvalidImportError(`${relativePath} exceeds the 64 MB per-file import limit`);
      }
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new InvalidImportError("Zip exceeds the 256 MB total import limit");
      }
      const content: string | Uint8Array = isTextProjectPath(relativePath)
        ? new TextDecoder().decode(bytes)
        : bytes;

      files[relativePath] = {
        id: "",
        name: basename(relativePath),
        path: relativePath,
        kind: inferFileKind(relativePath),
        content,
      };

      if (relativePath === "main.tex") hasMain = true;
    } catch (error) {
      if (error instanceof InvalidImportError) throw error;
      // Invalid archive paths are ignored; valid files remain importable.
    }
  }

  const fileKeys = Object.keys(files);
  if (fileKeys.length === 0) {
    throw new InvalidImportError("Zip file contains no valid project files");
  }

  if (!hasMain) {
    const firstTex = fileKeys.find((k) => k.endsWith(".tex"));
    entry = firstTex ?? fileKeys[0]!;
  }

  // ZIP archives do not have to include explicit directory entries.
  for (const path of fileKeys) {
    const parts = path.split("/");
    if (parts.length > 1) {
      const folderPath = parts.slice(0, -1).join("/");
      if (!folders[folderPath]) {
        folders[folderPath] = {
          name: basename(folderPath),
          path: folderPath,
          expanded: false,
        };
      }
    }
  }

  // Import assigns the final identity and timestamps after validation.
  return {
    id: "zip-import",
    name: "Imported ZIP",
    entry,
    createdAt: new Date().toISOString(),
    files,
    folders,
  };
}

/**
 * Parse a JSON blob into a Project, rejecting anything that
 * doesn't structurally look like an export. Conservative on
 * purpose - we'd rather reject a plausible-but-wrong file than
 * silently load it as a project.
 */
export function parseExportedProject(input: string | object): Project {
  let parsed: unknown;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      throw new InvalidImportError("Not valid JSON");
    }
  } else {
    parsed = input;
  }

  if (!parsed || typeof parsed !== "object") {
    throw new InvalidImportError("Expected a JSON object");
  }
  const rec = parsed as Record<string, unknown>;
  if (rec.format !== "opendraft.project") {
    throw new InvalidImportError("Missing or wrong format identifier");
  }
  if (rec.schemaVersion !== EXPORT_SCHEMA_VERSION && rec.schemaVersion !== 1) {
    throw new InvalidImportError(
      `Unsupported schemaVersion ${String(rec.schemaVersion)} (this build accepts 1 or ${EXPORT_SCHEMA_VERSION})`,
    );
  }
  if (!rec.project || typeof rec.project !== "object") {
    throw new InvalidImportError("Envelope missing `project`");
  }

  return validateProject(rec.project as Record<string, unknown>);
}

function validateProject(p: Record<string, unknown>): Project {
  const id = stringField(p, "id");
  const name = stringField(p, "name");
  const entry = stringField(p, "entry");
  const createdAt = stringField(p, "createdAt");
  if (!name.trim()) throw new InvalidImportError("Project name must not be empty");
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new InvalidImportError("project.createdAt must be a valid ISO date");
  }
  if (typeof p.files !== "object" || p.files === null || Array.isArray(p.files))
    throw new InvalidImportError("project.files must be an object");
  if (typeof p.folders !== "object" || p.folders === null || Array.isArray(p.folders))
    throw new InvalidImportError("project.folders must be an object");

  const fileEntries = Object.entries(p.files as Record<string, unknown>);
  if (fileEntries.length === 0)
    throw new InvalidImportError("Project must contain at least one file");
  if (fileEntries.length > MAX_PROJECT_FILES) {
    throw new InvalidImportError(`Project exceeds the ${MAX_PROJECT_FILES} file import limit`);
  }
  const files: Record<string, Project["files"][string]> = {};
  let totalBytes = 0;
  for (const [key, raw] of fileEntries) {
    assertImportPath(key, `File ${key}`);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      throw new InvalidImportError(`File ${key} is not an object`);
    const encoding =
      typeof (raw as Record<string, unknown>).contentEncoding === "string"
        ? (raw as Record<string, unknown>).contentEncoding
        : "utf8";
    const contentField = stringField(raw as Record<string, unknown>, "content");
    const utf8Bytes = encoding === "utf8" ? new TextEncoder().encode(contentField).byteLength : 0;
    if (utf8Bytes > MAX_FILE_BYTES) {
      throw new InvalidImportError(`File ${key} exceeds the 64 MB import limit`);
    }
    const content =
      encoding === "base64"
        ? base64ToUint8(contentField)
        : encoding === "utf8"
          ? contentField
          : (() => {
              throw new InvalidImportError(`Unknown contentEncoding "${encoding}" for ${key}`);
            })();
    totalBytes += typeof content === "string" ? utf8Bytes : content.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new InvalidImportError("Project exceeds the 256 MB total import limit");
    }
    const filePath = stringField(raw as Record<string, unknown>, "path");
    const fileName = stringField(raw as Record<string, unknown>, "name");
    const kind = stringField(raw as Record<string, unknown>, "kind");
    assertImportPath(filePath, `File ${key}`);
    if (!FILE_KINDS.has(kind)) {
      throw new InvalidImportError(`Unknown file kind "${kind}" for ${key}`);
    }
    if (fileName !== basename(filePath)) {
      throw new InvalidImportError(`File ${key} has an inconsistent name`);
    }
    files[key] = {
      id: stringField(raw as Record<string, unknown>, "id"),
      path: filePath,
      name: fileName,
      kind: kind as Project["files"][string]["kind"],
      content,
      ...((raw as Record<string, unknown>).modified === true ? { modified: true } : {}),
    };
    if (files[key]!.path !== key) {
      throw new InvalidImportError(`File key ${key} disagrees with its path ${files[key]!.path}`);
    }
  }

  const folderEntries = Object.entries(p.folders as Record<string, unknown>);
  if (folderEntries.length > MAX_PROJECT_FOLDERS) {
    throw new InvalidImportError(`Project exceeds the ${MAX_PROJECT_FOLDERS} folder import limit`);
  }
  const folders: Record<string, Project["folders"][string]> = {};
  for (const [key, raw] of folderEntries) {
    if (key !== "") assertImportPath(key, `Folder ${key}`);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      throw new InvalidImportError(`Folder ${key} is not an object`);
    const folderPath = stringField(raw as Record<string, unknown>, "path");
    const folderName = stringField(raw as Record<string, unknown>, "name");
    if (folderPath !== key) {
      throw new InvalidImportError(`Folder key ${key} disagrees with its path ${folderPath}`);
    }
    if (folderName !== (folderPath === "" ? "" : basename(folderPath))) {
      throw new InvalidImportError(`Folder ${key} has an inconsistent name`);
    }
    folders[key] = {
      path: folderPath,
      name: folderName,
      ...((raw as Record<string, unknown>).expanded === true ? { expanded: true } : {}),
    };
  }

  if (!(entry in files)) {
    throw new InvalidImportError(`Entry path ${entry} does not exist in files`);
  }
  return { id, name, entry, files, folders, createdAt };
}

function assertImportPath(path: string, label: string): void {
  try {
    validatePath(path);
  } catch (error) {
    throw new InvalidImportError(
      `${label} has an invalid path: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function stringField(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== "string") {
    throw new InvalidImportError(`Field "${key}" must be a string`);
  }
  return v;
}
