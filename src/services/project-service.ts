import type { Project, ProjectSummary } from "@/domain";

/** Persistence-independent contract for project catalogue and file operations. */
export interface ProjectService {
  /** List summaries for the projects available to open. */
  list(): Promise<ProjectSummary[]>;

  /**
   * Load a full Project (files + folders) by id. Rejects with
   * ProjectNotFoundError when the id is unknown or deleted.
   */
  open(id: string): Promise<Project>;

  /**
   * Persist `project` (overwriting any existing record under the
   * same id) and return the saved version. Used by Cmd+S and by
   * file-level mutations below (they save through this method).
   */
  save(project: Project): Promise<Project>;

  /** Atomically apply file-content changes to the latest persisted project.
   *  Implementations should serialize this with structural file operations so
   *  autosave cannot overwrite a concurrently-created or renamed file. */
  saveFiles?(
    projectId: string,
    contents: Readonly<Record<string, string | Uint8Array>>,
  ): Promise<Project>;

  /**
   * Create a new persisted project from a name. Returns the new
   * Project with a generated id and seed files. When `template`
   * is provided, the seed comes from the matching project
   * template (amsart, beamer, ...); otherwise a minimal article
   * scaffold is used.
   */
  create(input: { name: string; template?: string }): Promise<Project>;

  /** Move a persisted project to the trash. */
  remove(id: string): Promise<void>;

  /** Restore a soft-deleted project. */
  restore?(id: string): Promise<void>;

  /** Hard delete a soft-deleted project permanently. */
  hardDelete?(id: string): Promise<void>;

  /** Write a new file at `path` with optional initial content.
   *  Rejects if the path is invalid or already exists. Pass a
   *  Uint8Array for binary assets (images, PDFs); strings are
   *  treated as text. */
  createFile(projectId: string, path: string, content?: string | Uint8Array): Promise<Project>;

  /** Rename a file. Updates the entry file path if it matched.
   *  Rejects if the new path is invalid or already exists. */
  renameFile(projectId: string, oldPath: string, newPath: string): Promise<Project>;

  /** Soft-delete a file. No-op when the path doesn't exist. */
  removeFile(projectId: string, path: string): Promise<Project>;

  /** Restore a soft-deleted file. No-op when the path doesn't exist or isn't deleted. */
  restoreFile?(projectId: string, path: string): Promise<Project>;

  /** Create an empty folder. Rejects if the path is invalid or
   *  already exists. */
  createFolder(projectId: string, path: string): Promise<Project>;

  /** Delete a folder and every file/folder nested beneath it. */
  removeFolder(projectId: string, path: string): Promise<Project>;
}
