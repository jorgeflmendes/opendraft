import { create } from "zustand";

export type ScreenName = "landing" | "projects" | "editor";

interface ScreenRoute {
  current: ScreenName;
  projectId: string | null;
}

interface ScreenState extends ScreenRoute {
  go: (name: ScreenName, projectId?: string) => void;
  syncFromLocation: () => void;
}

function routeFromHash(hash: string): ScreenRoute {
  const path = hash.replace(/^#\/?/, "");
  if (!path) return { current: "landing", projectId: null };
  if (path === "projects") return { current: "projects", projectId: null };
  if (path === "editor") return { current: "editor", projectId: null };
  if (path.startsWith("editor/")) {
    const encodedId = path.slice("editor/".length);
    if (encodedId) {
      try {
        return { current: "editor", projectId: decodeURIComponent(encodedId) };
      } catch {
        return { current: "projects", projectId: null };
      }
    }
  }
  return { current: "landing", projectId: null };
}

function hashForRoute(name: ScreenName, projectId?: string): string {
  if (name === "projects") return "#/projects";
  if (name === "editor") {
    return projectId ? `#/editor/${encodeURIComponent(projectId)}` : "#/editor";
  }
  return "#/";
}

function currentLocationRoute(): ScreenRoute {
  if (typeof window === "undefined") return { current: "landing", projectId: null };
  return routeFromHash(window.location.hash);
}

export const useScreen = create<ScreenState>((set) => ({
  ...currentLocationRoute(),
  go: (name, projectId) => {
    const next =
      name === "editor"
        ? { current: name, projectId: projectId ?? null }
        : { current: name, projectId: null };
    set(next);
    if (typeof window !== "undefined") {
      const hash = hashForRoute(name, projectId);
      if (window.location.hash !== hash) window.location.hash = hash;
    }
  },
  syncFromLocation: () => set(currentLocationRoute()),
}));

/** Keep browser Back/Forward and the app screen store in sync. */
export function installScreenNavigation(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const sync = () => useScreen.getState().syncFromLocation();
  window.addEventListener("hashchange", sync);
  sync();
  return () => window.removeEventListener("hashchange", sync);
}
