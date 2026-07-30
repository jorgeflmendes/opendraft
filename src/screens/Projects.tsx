import { AppHeader, ThemeToggle } from "@/components/chrome";
import { useScreen } from "@/store/screen";
import { ProjectPicker, ProjectTemplates } from "@/features/projects";

/**
 * Projects screen - the local picker. Composes the picker
 * (main column) and the two right-rail panels (recent files +
 * templates). Navigation:
 *
 *   Back arrow         -> landing
 *   Pick a project     -> editor (handled by ProjectPicker via
 *                        the onOpened callback)
 */
export function ProjectsScreen() {
  const go = useScreen((s) => s.go);
  return (
    <div className="od-window od-projects-window">
      <AppHeader title="Projects" onHome={() => go("landing")} actions={<ThemeToggle />} />

      <div className="od-projects-layout">
        <ProjectPicker onOpened={(id) => go("editor", id)} />
        <aside className="od-projects-sidebar" aria-label="Sidebar">
          <ProjectTemplates />
        </aside>
      </div>
    </div>
  );
}
