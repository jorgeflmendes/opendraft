import { activeFileEntries, type Project, type ProjectSummary, type FileNode } from "@/domain";
import type { KVStore } from "./kv-store";

const KEY_PREFIX = "project:";
const keyOf = (id: string) => `${KEY_PREFIX}${id}`;
const fileKeyOf = (projectId: string, path: string) => `file:${projectId}:${path}`;

export interface SavedProjectV1 {
  schemaVersion: 1;
  project: Project;
  savedAt: string;
}

export interface SavedProjectV2 {
  schemaVersion: 2;
  project: Omit<Project, "files">;
  savedAt: string;
  deletedAt?: string; // Optional field for soft delete
}

export interface SavedProjectV3 {
  schemaVersion: 3;
  project: Omit<Project, "files">;
  summary: Omit<ProjectSummary, "lastOpenedAt" | "persisted" | "deleted">;
  savedAt: string;
  deletedAt?: string;
}

export type SavedProject = SavedProjectV1 | SavedProjectV2 | SavedProjectV3;

export interface SavedFile {
  file: FileNode;
}

export class PersistenceProjectStore {
  constructor(private readonly kv: KVStore<unknown>) {}

  private getEntriesWithPrefix(prefix: string): Promise<Array<[string, unknown]>> {
    return this.kv.entries(prefix);
  }

  private async getProjectFiles(projectId: string): Promise<Record<string, FileNode>> {
    const entries = await this.getEntriesWithPrefix(`file:${projectId}:`);
    return Object.fromEntries(
      entries.map(([, value]) => {
        const saved = value as SavedFile;
        return [saved.file.path, saved.file];
      }),
    );
  }

  async put(project: Project): Promise<void> {
    const { files, ...projectWithoutFiles } = project;
    const summary = projectToSummary(project);
    const record: SavedProjectV3 = {
      schemaVersion: 3,
      project: projectWithoutFiles,
      summary: {
        id: summary.id,
        name: summary.name,
        description: summary.description,
        texFileCount: summary.texFileCount,
        fileCount: summary.fileCount,
      },
      savedAt: new Date().toISOString(),
    };

    const puts: Array<[string, unknown]> = [[keyOf(project.id), record]];
    for (const [path, file] of Object.entries(files)) {
      puts.push([fileKeyOf(project.id, path), { file }]);
    }

    const existingFileKeys = (await this.getEntriesWithPrefix(`file:${project.id}:`)).map(
      ([k]) => k,
    );
    const newFileKeys = new Set(puts.map(([k]) => k));
    const deletes = existingFileKeys.filter((k) => !newFileKeys.has(k));

    await this.kv.batch(puts, deletes);
  }

  async patchFiles(project: Project, paths: readonly string[]): Promise<void> {
    const uniquePaths = [...new Set(paths)];
    const existing = (await this.kv.get(keyOf(project.id))) as SavedProject | undefined;

    // Fixtures do not yet have a persisted metadata record. Persisting the
    // complete snapshot once creates a coherent local shadow.
    if (!existing || existing.schemaVersion !== 3) {
      await this.put(project);
      return;
    }

    const summary = projectToSummary(project);
    const record: SavedProjectV3 = {
      ...existing,
      project: (({ files: _files, ...metadata }) => metadata)(project),
      summary: {
        id: summary.id,
        name: summary.name,
        description: summary.description,
        texFileCount: summary.texFileCount,
        fileCount: summary.fileCount,
      },
      savedAt: new Date().toISOString(),
    };
    const puts: Array<[string, unknown]> = [[keyOf(project.id), record]];
    for (const path of uniquePaths) {
      const file = project.files[path];
      if (file) puts.push([fileKeyOf(project.id, path), { file }]);
    }
    await this.kv.batch(puts, []);
  }

  async get(id: string): Promise<Project | undefined> {
    const record = (await this.kv.get(keyOf(id))) as SavedProject | undefined;
    if (!record || ("deletedAt" in record && record.deletedAt)) return undefined;

    if (record.schemaVersion === 1) {
      return record.project;
    }

    return {
      ...record.project,
      files: await this.getProjectFiles(id),
    };
  }

  async restore(id: string): Promise<void> {
    const record = (await this.kv.get(keyOf(id))) as SavedProject | undefined;
    if (!record) return;

    if (record.schemaVersion !== 1 && record.deletedAt) {
      delete record.deletedAt;
      await this.kv.set(keyOf(id), record);
    }
  }

  async delete(id: string): Promise<void> {
    const record = (await this.kv.get(keyOf(id))) as SavedProject | undefined;
    if (!record) return;

    if (record.schemaVersion !== 1 && !record.deletedAt) {
      // Project deletion is recoverable until delete is requested a second time.
      record.deletedAt = new Date().toISOString();
      await this.kv.set(keyOf(id), record);
      return;
    }

    const fileEntries = await this.getEntriesWithPrefix(`file:${id}:`);
    const deletes = [keyOf(id), ...fileEntries.map(([k]) => k)];

    await this.kv.batch([], deletes);
  }

  async hardDelete(id: string): Promise<void> {
    const fileEntries = await this.getEntriesWithPrefix(`file:${id}:`);
    const deletes = [keyOf(id), ...fileEntries.map(([k]) => k)];

    await this.kv.batch([], deletes);
  }

  async list(options?: { includeDeleted?: boolean }): Promise<Project[]> {
    const records = await this.listRecords(options);
    return Promise.all(
      records.map(async (record) => {
        if (record.schemaVersion === 1) return record.project;

        return { ...record.project, files: await this.getProjectFiles(record.project.id) };
      }),
    );
  }

  private async listRecords(options?: { includeDeleted?: boolean }): Promise<SavedProject[]> {
    const entries = await this.getEntriesWithPrefix(KEY_PREFIX);
    return entries
      .map(([, v]) => v as SavedProject)
      .filter((record) => {
        if ("deletedAt" in record && record.deletedAt) {
          return options?.includeDeleted === true;
        }
        return true;
      })
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  }

  async listSummaries(options?: { includeDeleted?: boolean }): Promise<ProjectSummary[]> {
    const records = await this.listRecords(options);
    return Promise.all(
      records.map(async (record) => {
        if (record.schemaVersion === 1) {
          return projectToSummary(record.project, record.savedAt, undefined);
        }

        if (record.schemaVersion === 3) {
          return {
            ...record.summary,
            lastOpenedAt: record.savedAt,
            persisted: true,
            deleted: Boolean(record.deletedAt),
          };
        }

        const files = await this.getProjectFiles(record.project.id);
        const summary = projectToSummary(
          { ...record.project, files },
          record.savedAt,
          record.deletedAt,
        );
        const { files: _files, ...project } = { ...record.project, files };
        await this.kv.set(keyOf(project.id), {
          schemaVersion: 3,
          project,
          summary: {
            id: summary.id,
            name: summary.name,
            description: summary.description,
            texFileCount: summary.texFileCount,
            fileCount: summary.fileCount,
          },
          savedAt: record.savedAt,
          ...(record.deletedAt ? { deletedAt: record.deletedAt } : {}),
        } satisfies SavedProjectV3);
        return summary;
      }),
    );
  }

  async wipe(): Promise<void> {
    await this.kv.clear();
  }
}

export function projectToSummary(
  project: Project,
  lastOpenedAt = project.createdAt,
  deletedAt?: string,
): ProjectSummary {
  const files = activeFileEntries(project).map(([, file]) => file);
  const texFileCount = files.filter((f) => f.kind === "tex").length;
  return {
    id: project.id,
    name: project.name,
    description: deriveDescription(project),
    texFileCount,
    fileCount: files.length,
    lastOpenedAt,
    persisted: true,
    deleted: !!deletedAt,
  };
}

function deriveDescription(project: Project): string {
  const readme = project.files["README.md"];
  if (readme && !readme.deletedAt && typeof readme.content === "string" && readme.content.trim()) {
    const firstLine = readme.content
      .split("\n")
      .find((l: string) => l.trim() && !l.startsWith("#"));
    if (firstLine) return firstLine.trim().slice(0, 140);
  }
  const entry = project.files[project.entry];
  if (entry && !entry.deletedAt) {
    return `Local project / ${activeFileEntries(project).length} files`;
  }
  return "Local project";
}
