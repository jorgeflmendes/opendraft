import type { Project } from "@/domain";

const IMPORT_ID_PREFIX = "p-import-";

/**
 * Imported and duplicated projects are always re-keyed so external data cannot
 * overwrite an existing local record.
 */
export function createImportedProjectId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${IMPORT_ID_PREFIX}${crypto.randomUUID()}`;
  }
  const timestamp = Date.now().toString(36);
  const entropy = Math.random().toString(36).slice(2, 8);
  return `${IMPORT_ID_PREFIX}${timestamp}-${entropy}`;
}

export function cloneProject(project: Project): Project {
  return {
    ...project,
    files: Object.fromEntries(
      Object.entries(project.files).map(([path, file]) => [path, { ...file }]),
    ),
    folders: Object.fromEntries(
      Object.entries(project.folders).map(([path, folder]) => [path, { ...folder }]),
    ),
  };
}

export function rekeyProject(project: Project, id: string): Project {
  const clone = cloneProject(project);
  return {
    ...clone,
    id,
    files: Object.fromEntries(
      Object.entries(clone.files).map(([path, file]) => [
        path,
        { ...file, id: `${id}-${path.replace(/[^a-z0-9]+/gi, "-")}` },
      ]),
    ),
  };
}
