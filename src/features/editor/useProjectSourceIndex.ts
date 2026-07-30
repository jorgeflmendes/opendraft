import { useEffect, useRef } from "react";
import type { Project } from "@/domain";
import { useBibStore } from "./useBibStore";
import { useLabelStore } from "./useLabelStore";

const EDIT_REBUILD_DELAY_MS = 120;

/**
 * Keeps completion indexes current without rescanning a large project on every
 * keystroke. Project switches rebuild without delay; subsequent edits debounce.
 */
export function useProjectSourceIndex(
  project: Project | null,
  edits: Readonly<Record<string, string>>,
): void {
  const rebuildBibliography = useBibStore((state) => state.rebuild);
  const rebuildLabels = useLabelStore((state) => state.rebuild);
  const indexedProjectId = useRef<string | null>(null);

  useEffect(() => {
    if (!project) {
      indexedProjectId.current = null;
      return;
    }
    const rebuild = () => {
      rebuildBibliography(project, edits);
      rebuildLabels(project, edits);
    };

    if (indexedProjectId.current !== project.id) {
      indexedProjectId.current = project.id;
      rebuild();
      return;
    }

    const timer = window.setTimeout(rebuild, EDIT_REBUILD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [edits, project, rebuildBibliography, rebuildLabels]);
}
