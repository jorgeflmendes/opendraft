import type { FileKind } from "@/domain";

// Canonical POSIX project-path policy shared across storage, import, and UI.

export class InvalidPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPathError";
  }
}

// Construct the range without embedding control bytes in source.
const CONTROL_CHARS = new RegExp(
  "[" +
    Array.from({ length: 32 }, (_, i) => "\\x" + i.toString(16).padStart(2, "0")).join("") +
    "]",
);

/**
 * Validate a path inside a Project. Rules:
 * - non-empty (after trim)
 * - relative (no leading slash)
 * - no trailing slash
 * - POSIX forward slashes only
 * - no empty segments, no '.', no '..'
 * - no segment longer than 255 chars
 * - no backslashes, NULs, or control chars
 */
export function validatePath(path: string): void {
  if (!path || path.trim() !== path) {
    throw new InvalidPathError("Path is required");
  }
  if (path.startsWith("/")) throw new InvalidPathError("Path must be relative");
  if (path.endsWith("/")) throw new InvalidPathError("Path must not end with /");
  if (path.includes("\\")) throw new InvalidPathError("Use forward slashes only");
  if (path.length > 4096) throw new InvalidPathError("Path is too long");
  if (path.includes("../") || path.includes("..\\"))
    throw new InvalidPathError("Path traversal is not allowed");
  if (CONTROL_CHARS.test(path)) {
    throw new InvalidPathError("Path contains control chars");
  }

  const segments = path.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      throw new InvalidPathError(`Invalid path segment: "${seg}"`);
    }
    if (seg.length > 255) throw new InvalidPathError("Path segment too long");
  }
}

export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function joinPath(root: string, name: string): string {
  return root === "" ? name : `${root}/${name}`;
}

export function resolveProjectPath(path: string, projectPaths: readonly string[]): string | null {
  let compilerPath = path.replaceAll("\\", "/");
  const buildRoot = "/project_dir/";
  const buildRootIndex = compilerPath.lastIndexOf(buildRoot);
  if (buildRootIndex !== -1) {
    compilerPath = compilerPath.slice(buildRootIndex + buildRoot.length);
  } else if (compilerPath.startsWith("/") || /^[A-Za-z]:\//.test(compilerPath)) {
    return null;
  }
  if (compilerPath.split("/").includes("..")) return null;
  const normalized = compilerPath
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");
  const exact = projectPaths.find((candidate) => candidate === normalized);
  if (exact) return exact;
  const suffixMatches = projectPaths
    .filter((candidate) => normalized.endsWith(`/${candidate}`))
    .sort((a, b) => b.length - a.length);
  return suffixMatches[0] ?? null;
}

export function inferFileKind(path: string): FileKind {
  const ext = getFileExtension(path);
  switch (ext) {
    case "tex":
      return "tex";
    case "bib":
      return "bib";
    case "sty":
      return "sty";
    case "yml":
    case "yaml":
      return "yml";
    case "md":
      return "md";
    case "png":
    case "jpg":
    case "jpeg":
    case "svg":
      return "img";
    case "txt":
    case "makefile":
    case "license":
    case "dockerfile":
    case "gitignore":
    case "editorconfig":
    case "env":
      return "txt";
    default:
      return "other";
  }
}

/**
 * Extract extension or filename for extensionless files / dotfiles.
 */
export function getFileExtension(path: string): string {
  const name = basename(path);
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex > 0) {
    return name.slice(dotIndex + 1).toLowerCase();
  }
  if (dotIndex === 0) {
    return name.slice(1).toLowerCase();
  }
  return name.toLowerCase();
}
