import type { ComponentType } from "react";
import type { ScreenName } from "@/store/screen";

interface ProjectsModule {
  ProjectsScreen: ComponentType;
}

interface EditorModule {
  EditorScreen: ComponentType;
}

let projectsModule: Promise<ProjectsModule> | undefined;
let editorModule: Promise<EditorModule> | undefined;

function cacheImport<T>(
  current: Promise<T> | undefined,
  load: () => Promise<T>,
  reset: () => void,
): Promise<T> {
  if (current) return current;

  const pending = load();
  pending.catch(reset);
  return pending;
}

export function loadProjectsScreen(): Promise<ProjectsModule> {
  projectsModule = cacheImport(
    projectsModule,
    () => import("@/screens/Projects"),
    () => {
      projectsModule = undefined;
    },
  );
  return projectsModule;
}

export function loadEditorScreen(): Promise<EditorModule> {
  editorModule = cacheImport(
    editorModule,
    () => import("@/screens/Editor"),
    () => {
      editorModule = undefined;
    },
  );
  return editorModule;
}

export function preloadProjectsScreen(): void {
  void loadProjectsScreen();
}

export function preloadEditorScreen(): void {
  void loadEditorScreen();
}

interface NetworkInformation {
  effectiveType?: string;
  saveData?: boolean;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
}

function canPreload(): boolean {
  if (typeof navigator === "undefined") return false;

  const connection = (navigator as NavigatorWithConnection).connection;
  return (
    !connection?.saveData &&
    connection?.effectiveType !== "slow-2g" &&
    connection?.effectiveType !== "2g"
  );
}

/**
 * Warms only the next likely screen after the current page has rendered.
 * Slow or data-saving connections keep the normal on-demand loading path.
 */
export function scheduleNextScreenPreload(screen: ScreenName): () => void {
  if (typeof window === "undefined" || !canPreload()) return () => undefined;

  const preload =
    screen === "landing"
      ? preloadProjectsScreen
      : screen === "projects"
        ? preloadEditorScreen
        : undefined;

  if (!preload) return () => undefined;

  if (window.requestIdleCallback) {
    const handle = window.requestIdleCallback(preload, { timeout: 1_500 });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(preload, 250);
  return () => window.clearTimeout(handle);
}
