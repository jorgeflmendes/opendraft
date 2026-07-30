import type { FileNode, Project, ProjectFolder, ProjectSummary } from "@/domain";
import type { MockProjectEntry } from "@/lib/mock/projects";
import {
  type ProjectTemplateId,
  PROJECT_TEMPLATES,
  seedForTemplate,
} from "@/lib/templates/project-templates";
import { ProjectNotFoundError } from "./errors";
import type { PersistenceProjectStore } from "./persistence";
import { InvalidPathError, basename, inferFileKind, validatePath } from "./path-utils";
import type { ProjectService } from "./project-service";

export interface CompositeProjectServiceOptions {
  /**
   * Project IDs removed from the product catalogue. Any persisted copies are
   * deleted once before reads so legacy seeds do not survive an upgrade.
   */
  retiredProjectIds?: readonly string[];
}

/**
 * Unifies optional read-only fixtures and persisted projects. Persisted records
 * shadow matching fixture IDs; per-project queues serialize structural and
 * content updates so concurrent autosaves cannot overwrite newer state.
 */
export class CompositeProjectService implements ProjectService {
  private readonly retiredProjectIds: ReadonlySet<string>;
  private retiredProjectsCleanup: Promise<void> | null = null;

  constructor(
    private readonly fixtures: ReadonlyArray<MockProjectEntry>,
    private readonly store: PersistenceProjectStore,
    options: CompositeProjectServiceOptions = {},
  ) {
    this.retiredProjectIds = new Set(options.retiredProjectIds ?? []);
  }

  private queues = new Map<string, Promise<unknown>>();

  private ensureRetiredProjectsRemoved(): Promise<void> {
    if (this.retiredProjectIds.size === 0) return Promise.resolve();
    if (!this.retiredProjectsCleanup) {
      this.retiredProjectsCleanup = Promise.all(
        [...this.retiredProjectIds].map((id) => this.store.hardDelete(id)),
      ).then(() => undefined);
    }
    return this.retiredProjectsCleanup;
  }

  private enqueueUpdate<T>(projectId: string, task: () => Promise<T>): Promise<T> {
    const current = this.queues.get(projectId) ?? Promise.resolve();
    const result = current.then(task, task);
    this.queues.set(projectId, result);
    const cleanup = () => {
      if (this.queues.get(projectId) === result) this.queues.delete(projectId);
    };
    void result.then(cleanup, cleanup);
    return result;
  }

  private async persist(project: Project): Promise<Project> {
    await this.store.put(project);
    return project;
  }

  // -- Project-level --------------------------------------------

  async list(): Promise<ProjectSummary[]> {
    await this.ensureRetiredProjectsRemoved();
    const persisted = await this.store.listSummaries({ includeDeleted: true });
    const persistedIds = new Set(persisted.map((s) => s.id));
    const fixtureSummaries = this.fixtures
      .map((f) => f.summary)
      .filter((s) => !persistedIds.has(s.id));
    return [...persisted, ...fixtureSummaries];
  }

  async open(id: string): Promise<Project> {
    await this.ensureRetiredProjectsRemoved();
    if (this.retiredProjectIds.has(id)) throw new ProjectNotFoundError(id);
    const persisted = await this.store.get(id);
    if (persisted) return persisted;
    const fixture = this.fixtures.find((f) => f.summary.id === id);
    if (fixture) return fixture.factory();
    throw new ProjectNotFoundError(id);
  }

  async save(project: Project): Promise<Project> {
    await this.ensureRetiredProjectsRemoved();
    if (this.retiredProjectIds.has(project.id)) {
      throw new ProjectNotFoundError(project.id);
    }
    return this.enqueueUpdate(project.id, () => this.persist(project));
  }

  async saveFiles(
    projectId: string,
    contents: Readonly<Record<string, string | Uint8Array>>,
  ): Promise<Project> {
    return this.enqueueUpdate(projectId, async () => {
      const project = await this.open(projectId);
      const files = { ...project.files };
      for (const [path, content] of Object.entries(contents)) {
        const file = files[path];
        if (!file) throw new InvalidPathError(`File no longer exists: ${path}`);
        files[path] = { ...file, content };
      }
      const updated = { ...project, files };
      await this.store.patchFiles(updated, Object.keys(contents));
      return updated;
    });
  }

  async create({ name, template }: { name: string; template?: string }): Promise<Project> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Project name is required");
    const id = newProjectId();
    const project = newSeededProject(id, trimmed, resolveTemplate(template));
    await this.store.put(project);
    return project;
  }

  async remove(id: string): Promise<void> {
    await this.store.delete(id);
  }

  async restore(id: string): Promise<void> {
    if ("restore" in this.store && typeof this.store.restore === "function") {
      await this.store.restore(id);
    }
  }

  async hardDelete(id: string): Promise<void> {
    if ("hardDelete" in this.store && typeof this.store.hardDelete === "function") {
      await this.store.hardDelete(id);
    }
  }

  // -- File-level ------------------------------------------------

  async createFile(
    projectId: string,
    path: string,
    content: string | Uint8Array = "",
  ): Promise<Project> {
    return this.enqueueUpdate(projectId, async () => {
      validatePath(path);
      const project = await this.open(projectId);
      if (project.files[path]) {
        throw new InvalidPathError(`File already exists: ${path}`);
      }
      if (project.folders[path]) {
        throw new InvalidPathError(`A folder already exists at: ${path}`);
      }
      const file: FileNode = {
        id: `${projectId}-${slug(path)}`,
        path,
        name: basename(path),
        kind: inferFileKind(path),
        content,
      };
      const next: Project = {
        ...project,
        files: { ...project.files, [path]: file },
      };
      return this.persist(next);
    });
  }

  async renameFile(projectId: string, oldPath: string, newPath: string): Promise<Project> {
    return this.enqueueUpdate(projectId, async () => {
      validatePath(newPath);
      if (oldPath === newPath) return this.open(projectId);
      const project = await this.open(projectId);
      const file = project.files[oldPath];
      if (!file) throw new InvalidPathError(`File not found: ${oldPath}`);
      if (project.files[newPath]) {
        throw new InvalidPathError(`Target already exists: ${newPath}`);
      }
      if (project.folders[newPath]) {
        throw new InvalidPathError(`A folder already exists at: ${newPath}`);
      }
      const moved: FileNode = {
        ...file,
        path: newPath,
        name: basename(newPath),
        kind: inferFileKind(newPath),
      };
      const files: Record<string, FileNode> = {};
      for (const [k, v] of Object.entries(project.files)) {
        if (k === oldPath) continue;
        files[k] = v;
      }
      files[newPath] = moved;
      const next: Project = {
        ...project,
        files,
        entry: project.entry === oldPath ? newPath : project.entry,
      };
      return this.persist(next);
    });
  }

  async removeFile(projectId: string, path: string): Promise<Project> {
    return this.enqueueUpdate(projectId, async () => {
      const project = await this.open(projectId);
      const file = project.files[path];
      if (!file || file.deletedAt) return project;

      const files = {
        ...project.files,
        [path]: { ...file, deletedAt: new Date().toISOString() },
      };

      if (Object.values(files).filter((f) => !f.deletedAt).length === 0) {
        throw new InvalidPathError("A project must contain at least one file");
      }

      const next: Project = {
        ...project,
        files,
        entry: project.entry === path ? chooseEntry(files, undefined) : project.entry,
      };
      return this.persist(next);
    });
  }

  async restoreFile(projectId: string, path: string): Promise<Project> {
    return this.enqueueUpdate(projectId, async () => {
      const project = await this.open(projectId);
      const file = project.files[path];
      if (!file || !file.deletedAt) return project;

      const { deletedAt: _deletedAt, ...restFile } = file;
      const files = {
        ...project.files,
        [path]: restFile,
      };

      const next: Project = {
        ...project,
        files,
      };
      return this.persist(next);
    });
  }

  async createFolder(projectId: string, path: string): Promise<Project> {
    return this.enqueueUpdate(projectId, async () => {
      validatePath(path);
      const project = await this.open(projectId);
      if (project.folders[path]) {
        throw new InvalidPathError(`Folder already exists: ${path}`);
      }
      if (project.files[path]) {
        throw new InvalidPathError(`A file already exists at: ${path}`);
      }
      const folder: ProjectFolder = {
        path,
        name: basename(path),
        expanded: true,
      };
      const next: Project = {
        ...project,
        folders: { ...project.folders, [path]: folder },
      };
      return this.persist(next);
    });
  }

  async removeFolder(projectId: string, path: string): Promise<Project> {
    return this.enqueueUpdate(projectId, async () => {
      const project = await this.open(projectId);
      const prefix = `${path}/`;
      const files: Record<string, FileNode> = { ...project.files };
      const now = new Date().toISOString();
      for (const [k, v] of Object.entries(project.files)) {
        if ((k === path || k.startsWith(prefix)) && !v.deletedAt) {
          files[k] = { ...v, deletedAt: now };
        }
      }
      const folders: Record<string, ProjectFolder> = {};
      for (const [k, v] of Object.entries(project.folders)) {
        if (k === path || k.startsWith(prefix)) continue;
        folders[k] = v;
      }

      if (Object.values(files).filter((f) => !f.deletedAt).length === 0) {
        throw new InvalidPathError("A project must contain at least one file");
      }

      const next: Project = {
        ...project,
        files,
        folders,
        entry:
          !files[project.entry] || files[project.entry]?.deletedAt
            ? chooseEntry(files)
            : project.entry,
      };
      return this.persist(next);
    });
  }
}

// -- Factories --------------------------------------------------

/** Stable prefix distinguishes user-created projects in IndexedDB. */
const USER_ID_PREFIX = "p-local-";

function newProjectId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${USER_ID_PREFIX}${crypto.randomUUID()}`;
  }
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${USER_ID_PREFIX}${t}-${r}`;
}

function chooseEntry(files: Record<string, FileNode>, preferred?: string): string {
  if (preferred && files[preferred] && !files[preferred].deletedAt) return preferred;
  if (files["main.tex"] && !files["main.tex"].deletedAt) return "main.tex";
  return (
    Object.entries(files).find(
      ([, file]) =>
        !file.deletedAt &&
        file.kind === "tex" &&
        typeof file.content === "string" &&
        /\documentclass\b/.test(file.content),
    )?.[0] ??
    Object.entries(files).find(([, file]) => !file.deletedAt && file.kind === "tex")?.[0] ??
    Object.entries(files).find(([, file]) => !file.deletedAt)?.[0] ??
    ""
  );
}

function slug(path: string): string {
  return path.replace(/[^a-z0-9]/gi, "-");
}

const DEFAULT_TEMPLATE: ProjectTemplateId = "blank";

function resolveTemplate(raw: string | undefined): ProjectTemplateId {
  if (!raw) return DEFAULT_TEMPLATE;
  return PROJECT_TEMPLATES.some((t) => t.id === raw)
    ? (raw as ProjectTemplateId)
    : DEFAULT_TEMPLATE;
}

function newSeededProject(id: string, name: string, template: ProjectTemplateId): Project {
  const seed = seedForTemplate(template, name);
  const files: Record<string, FileNode> = {};
  const folders: Record<string, ProjectFolder> = {};
  for (const [path, content] of Object.entries(seed.files)) {
    files[path] = {
      id: `${id}-${slug(path)}`,
      path,
      name: basename(path),
      kind: inferFileKind(path),
      content,
    };
    // File maps do not encode empty/explicit folders, so materialize ancestors.
    const segments = path.split("/");
    for (let i = 1; i < segments.length; i++) {
      const folderPath = segments.slice(0, i).join("/");
      if (!folders[folderPath]) {
        folders[folderPath] = {
          path: folderPath,
          name: segments[i - 1]!,
          expanded: i === 1,
        };
      }
    }
  }
  return {
    id,
    name,
    entry: seed.entry,
    files,
    folders,
    createdAt: new Date().toISOString(),
  };
}
