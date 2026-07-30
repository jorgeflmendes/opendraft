import { Suspense, lazy, useEffect } from "react";
import { usePreferences } from "@/store/preferences";
import { installScreenNavigation, useScreen } from "@/store/screen";
import { LandingScreen } from "@/screens/Landing";
import { PreferencesEffect } from "@/components/system/PreferencesEffect";
import { ErrorBoundary } from "@/components/system/ErrorBoundary";
import {
  loadEditorScreen,
  loadProjectsScreen,
  scheduleNextScreenPreload,
} from "@/lib/screen-preload";

// Keep project management and the editor out of the landing bundle.
const LazyProjectsScreen = lazy(() =>
  loadProjectsScreen().then((m) => ({ default: m.ProjectsScreen })),
);
const LazyEditorScreen = lazy(() => loadEditorScreen().then((m) => ({ default: m.EditorScreen })));
const SCREENS = {
  landing: LandingScreen,
  projects: LazyProjectsScreen,
  editor: LazyEditorScreen,
} as const;

export default function App() {
  const screen = useScreen((s) => s.current);
  const projectId = useScreen((s) => s.projectId);
  const theme = usePreferences((s) => s.theme);
  const density = usePreferences((s) => s.density);
  const Screen = SCREENS[screen];

  useEffect(() => installScreenNavigation(), []);
  useEffect(() => scheduleNextScreenPreload(screen), [screen]);

  useEffect(() => {
    if (screen !== "editor" || !projectId) return;
    let cancelled = false;
    void import("@/features/projects/useProjectsStore").then(({ useProjectsStore }) => {
      if (cancelled) return;
      const store = useProjectsStore.getState();
      if (store.active?.id !== projectId) void store.openProject(projectId);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, screen]);

  return (
    <div className="od-root" data-theme={theme} data-density={density}>
      <PreferencesEffect />
      <ErrorBoundary key={screen} label={`the ${screen} screen`}>
        <Suspense fallback={<ScreenLoading />}>
          <Screen />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

function ScreenLoading() {
  return (
    <div className="od-sr-only" role="status" aria-live="polite">
      Loading...
    </div>
  );
}
