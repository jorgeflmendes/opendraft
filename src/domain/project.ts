export type FileKind = "tex" | "bib" | "sty" | "yml" | "md" | "txt" | "img" | "other";

export interface FileNode {
  id: string;
  /** POSIX path relative to the project root. */
  path: string;
  name: string;
  kind: FileKind;
  /**
   * Text files carry strings. Binary content remains a byte array or a
   * lazily-backed Blob until a consumer explicitly reads it.
   */
  content: string | Uint8Array | Blob;
  modified?: boolean;
  /** ISO timestamp; its presence means the file is soft-deleted. */
  deletedAt?: string;
}

export function isTextContent(content: string | Uint8Array | Blob): content is string {
  return typeof content === "string";
}

export function isBinaryContent(content: string | Uint8Array | Blob): content is Uint8Array | Blob {
  return ArrayBuffer.isView(content) || (typeof Blob !== "undefined" && content instanceof Blob);
}

export interface ProjectFolder {
  /** POSIX path; "" for the root, never trailing-slash. */
  path: string;
  name: string;
  expanded?: boolean;
}

export interface Project {
  id: string;
  name: string;
  entry: string;
  files: Record<string, FileNode>;
  /** Explicit folder records preserve empty directories. */
  folders: Record<string, ProjectFolder>;
  createdAt: string;
}

/**
 * Metadata-only projection used to list projects without loading their files.
 */
export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  texFileCount: number;
  fileCount: number;
  lastOpenedLabel?: string;
  /** ISO timestamp used for deterministic recency ordering. */
  lastOpenedAt: string;
  persisted?: boolean;
  deleted?: boolean;
}

export function isActiveFile(file: FileNode): boolean {
  return file.deletedAt === undefined;
}

export function activeFileEntries(project: Project): Array<[string, FileNode]> {
  return Object.entries(project.files).filter(([, file]) => isActiveFile(file));
}

export function activeFilePaths(
  project: Project,
  overlay?: Readonly<Record<string, unknown>>,
): string[] {
  const paths = new Set(activeFileEntries(project).map(([path]) => path));
  for (const path of Object.keys(overlay ?? {})) {
    const file = project.files[path];
    if (!file || isActiveFile(file)) paths.add(path);
  }
  return [...paths];
}
