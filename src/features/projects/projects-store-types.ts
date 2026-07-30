import type { Project, ProjectSummary } from "@/domain";

export interface ProjectsState {
  summaries: ProjectSummary[];
  active: Project | null;
  loading: boolean;
  error: string | null;

  loadSummaries: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  closeProject: () => void;
  createProject: (name: string, template?: string) => Promise<Project | null>;
  removeProject: (id: string) => Promise<void>;
  restoreProject: (id: string) => Promise<void>;
  hardDeleteProject: (id: string) => Promise<void>;
  adoptProject: (project: Project) => Promise<Project | null>;
  duplicateProject: (id: string) => Promise<Project | null>;

  /**
   * Persist either the requested edit snapshot or every current edit.
   * The returned paths are the files accepted by persistence.
   */
  saveActive: (
    paths?: readonly string[],
    expectedEdits?: Readonly<Record<string, string>>,
  ) => Promise<string[]>;

  createFile: (path: string, content?: string | Uint8Array) => Promise<string | null>;
  renameFile: (oldPath: string, newPath: string) => Promise<boolean>;
  removeFile: (path: string) => Promise<boolean>;
  restoreFile: (path: string) => Promise<boolean>;
  createFolder: (path: string) => Promise<boolean>;
  removeFolder: (path: string) => Promise<boolean>;

  exportActive: () => Promise<string | null>;
  exportActiveZip: () => Promise<Blob | null>;
  importProject: (input: string | Blob) => Promise<Project | null>;
}
