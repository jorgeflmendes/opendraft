import { create } from "zustand";
import type { Project } from "@/domain";
import {
  getProjectService,
  InvalidImportError,
  parseExportedProject,
  parseImportedZip,
  ProjectNotFoundError,
  serializeProject,
  serializeProjectToZip,
} from "@/services";
import { useTabsStore } from "@/features/editor/useTabsStore";
import { useCompileStore } from "@/features/compile/useCompileStore";
import { useSyncStore } from "@/features/preview/useSyncStore";
import { errorMessage } from "@/lib/errors";
import { cloneProject, createImportedProjectId, rekeyProject } from "./projects-store-helpers";
import { installProjectsStoreSync } from "./projects-store-sync";
import type { ProjectsState } from "./projects-store-types";

let currentOpenRequestId = 0;

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  summaries: [],
  active: null,
  loading: false,
  error: null,

  loadSummaries: async () => {
    set({ loading: true, error: null });
    try {
      const summaries = await getProjectService().list();
      set({ summaries, loading: false });
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
    }
  },

  openProject: async (id) => {
    const requestId = ++currentOpenRequestId;
    set({ loading: true, error: null });
    try {
      const project = await getProjectService().open(id);
      if (currentOpenRequestId !== requestId) return; // Stale request, user navigated away
      // Reset tab + compile state and seed tabs with the project's
      // entry file so the editor always has something to show on
      // first paint. Compile state is per-project - leaking it across
      // switches would show stale errors against the wrong source.
      useTabsStore.getState().reset([project.entry]);
      useCompileStore.getState().reset();
      useSyncStore.getState().reset();
      set({ active: project, loading: false });
    } catch (e) {
      if (currentOpenRequestId !== requestId) return;
      const msg =
        e instanceof ProjectNotFoundError ? `Project not found: ${e.id}` : errorMessage(e);
      set({ loading: false, error: msg });
    }
  },

  closeProject: () => {
    ++currentOpenRequestId; // Invalidate any pending opens
    useTabsStore.getState().reset();
    useCompileStore.getState().reset();
    useSyncStore.getState().reset();
    set({ active: null, loading: false, error: null });
  },

  createProject: async (name, template) => {
    set({ loading: true, error: null });
    try {
      const input: { name: string; template?: string } = { name };
      if (template) input.template = template;
      const project = await getProjectService().create(input);
      const summaries = await getProjectService().list();
      set({ summaries, loading: false });
      return project;
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
      return null;
    }
  },

  removeProject: async (id) => {
    set({ loading: true, error: null });
    try {
      await getProjectService().remove(id);
      const summaries = await getProjectService().list();
      const active = get().active;
      if (active?.id === id) {
        useTabsStore.getState().reset();
        set({ summaries, active: null, loading: false });
      } else {
        set({ summaries, loading: false });
      }
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
    }
  },

  restoreProject: async (id) => {
    set({ loading: true, error: null });
    try {
      const service = getProjectService();
      if ("restore" in service && typeof service.restore === "function") {
        await service.restore(id);
      }
      const summaries = await service.list();
      set({ summaries, loading: false });
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
    }
  },

  hardDeleteProject: async (id) => {
    set({ loading: true, error: null });
    try {
      const service = getProjectService();
      if ("hardDelete" in service && typeof service.hardDelete === "function") {
        await service.hardDelete(id);
      }
      const summaries = await service.list();
      set({ summaries, loading: false });
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
    }
  },

  duplicateProject: async (id) => {
    set({ loading: true, error: null });
    try {
      const sourceProject = await getProjectService().open(id);

      const clone = rekeyProject(sourceProject, createImportedProjectId());
      clone.name = `${clone.name} - Copy`;
      clone.createdAt = new Date().toISOString();

      const saved = await getProjectService().save(clone);
      const summaries = await getProjectService().list();
      set({ summaries, loading: false });
      return saved;
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
      return null;
    }
  },

  adoptProject: async (project) => {
    set({ loading: true, error: null });
    try {
      const saved = await getProjectService().save(project);
      const summaries = await getProjectService().list();
      // Seed tabs + compile state from the freshly adopted project,
      // mirroring openProject() - the caller will route to the
      // editor immediately so we can't leave stale tabs around.
      useTabsStore.getState().reset([saved.entry]);
      useCompileStore.getState().reset();
      useSyncStore.getState().reset();
      set({ summaries, active: saved, loading: false });
      return saved;
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
      return null;
    }
  },

  exportActive: async () => {
    const active = get().active;
    if (!active) return null;
    return await serializeProject(active);
  },

  exportActiveZip: async () => {
    const active = get().active;
    if (!active) return null;
    return await serializeProjectToZip(active);
  },

  importProject: async (input: string | Blob) => {
    set({ loading: true, error: null });
    try {
      const incoming =
        typeof input === "string" ? parseExportedProject(input) : await parseImportedZip(input);

      // Re-key with a fresh id + createdAt so an import can never
      // silently overwrite an existing record. The user can rename
      // afterwards if they prefer the original id semantics.
      const fresh: Project = {
        ...rekeyProject(incoming, createImportedProjectId()),
        createdAt: new Date().toISOString(),
      };
      const saved = await getProjectService().save(fresh);
      const summaries = await getProjectService().list();
      set({ summaries, loading: false });
      return saved;
    } catch (e) {
      const msg = e instanceof InvalidImportError ? `Import failed: ${e.message}` : errorMessage(e);
      set({ loading: false, error: msg });
      return null;
    }
  },

  createFile: async (path, content: string | Uint8Array = "") => {
    const active = get().active;
    if (!active) return null;
    set({ loading: true, error: null });
    try {
      const next = await getProjectService().createFile(active.id, path, content);
      set({ active: next, loading: false });
      return path;
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
      return null;
    }
  },

  renameFile: async (oldPath, newPath) => {
    const active = get().active;
    if (!active) return false;
    set({ loading: true, error: null });
    try {
      const next = await getProjectService().renameFile(active.id, oldPath, newPath);

      // Migrate tab state: replace oldPath everywhere it appears.
      const tabs = useTabsStore.getState();
      const editEntry = tabs.edits[oldPath];
      if (tabs.openTabs.includes(oldPath) || editEntry !== undefined) {
        const renamed = tabs.openTabs.map((p) => (p === oldPath ? newPath : p));
        const nextEdits: Record<string, string> = { ...tabs.edits };
        delete nextEdits[oldPath];
        if (editEntry !== undefined) nextEdits[newPath] = editEntry;
        useTabsStore.setState({
          openTabs: renamed,
          activeTab: tabs.activeTab === oldPath ? newPath : tabs.activeTab,
          edits: nextEdits,
        });
      }
      set({ active: next, loading: false });
      return true;
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
      return false;
    }
  },

  removeFile: async (path) => {
    const active = get().active;
    if (!active) return false;
    set({ loading: true, error: null });
    try {
      const next = await getProjectService().removeFile(active.id, path);

      const tabs = useTabsStore.getState();
      if (tabs.openTabs.includes(path)) tabs.close(path);
      // File deletion is the explicit destructive action; unlike merely
      // closing a tab, it must also remove any draft for the deleted path.
      if (path in tabs.edits) tabs.discardEdits(path);
      if (useTabsStore.getState().activeTab === null) {
        useTabsStore.getState().open(next.entry);
      }
      set({ active: next, loading: false });
      return true;
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
      return false;
    }
  },

  restoreFile: async (path) => {
    const active = get().active;
    if (!active) return false;
    set({ loading: true, error: null });
    try {
      if (!getProjectService().restoreFile) {
        set({ loading: false, error: "Not supported" });
        return false;
      }
      const next = await getProjectService().restoreFile!(active.id, path);
      set({ active: next, loading: false });
      return true;
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
      return false;
    }
  },

  createFolder: async (path) => {
    const active = get().active;
    if (!active) return false;
    set({ loading: true, error: null });
    try {
      const next = await getProjectService().createFolder(active.id, path);
      set({ active: next, loading: false });
      return true;
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
      return false;
    }
  },

  removeFolder: async (path) => {
    const active = get().active;
    if (!active) return false;
    set({ loading: true, error: null });
    try {
      const next = await getProjectService().removeFolder(active.id, path);

      // Close any open tab whose path lived under the deleted folder.
      const prefix = `${path}/`;
      const tabs = useTabsStore.getState();
      for (const p of [...tabs.openTabs]) {
        if (p === path || p.startsWith(prefix)) tabs.close(p);
      }
      // Also drop orphaned edits for closed files that lived under the deleted folder.
      for (const p of Object.keys(tabs.edits)) {
        if (p === path || p.startsWith(prefix)) tabs.discardEdits(p);
      }
      if (useTabsStore.getState().activeTab === null) {
        useTabsStore.getState().open(next.entry);
      }
      set({ active: next, loading: false });
      return true;
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
      return false;
    }
  },

  saveActive: async (paths, expectedEdits) => {
    const active = get().active;
    if (!active) return [];
    const edits = useTabsStore.getState().edits;
    const sourceEdits = expectedEdits ?? edits;
    // Default: save every edit. Otherwise, only the requested paths
    // that actually have edit entries.
    const targets = (paths ?? Object.keys(sourceEdits)).filter((p) => p in sourceEdits);
    if (targets.length === 0) return [];

    const contentPatch: Record<string, string | Uint8Array> = {};
    for (const path of targets) {
      const file = active.files[path];
      const content = sourceEdits[path];
      if (!file || content === undefined) continue;
      contentPatch[path] = content;
    }
    const savedTargets = Object.keys(contentPatch);
    if (savedTargets.length === 0) return [];
    set({ loading: true, error: null });
    try {
      const service = getProjectService();
      let saved: Project;
      if (service.saveFiles) {
        saved = await service.saveFiles(active.id, contentPatch);
      } else {
        const next = cloneProject(active);
        for (const [path, content] of Object.entries(contentPatch)) {
          const file = next.files[path];
          if (file) next.files[path] = { ...file, content };
        }
        saved = await service.save(next);
      }

      // Reflect the saved version as the new "original". The tabs
      // store only drops edits that still match this save snapshot.
      // Newer edits made while persistence was in flight remain dirty.
      const currentEdits = useTabsStore.getState().edits;
      const unchangedTargets = savedTargets.filter(
        (path) => currentEdits[path] === sourceEdits[path],
      );
      useTabsStore.getState().markCleanMany(unchangedTargets);
      // An autosave can finish after the user closes or switches projects.
      // Never resurrect or replace the project that is now on screen.
      if (get().active?.id === active.id) set({ active: saved, loading: false });
      return savedTargets;
    } catch (e) {
      const msg = errorMessage(e);
      if (get().active?.id === active.id) set({ loading: false, error: msg });
      return [];
    }
  },
}));

const uninstallProjectsStoreSync = installProjectsStoreSync(useProjectsStore);
if (import.meta.hot) import.meta.hot.dispose(uninstallProjectsStoreSync);
