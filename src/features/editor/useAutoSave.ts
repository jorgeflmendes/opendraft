import { useEffect, useRef } from "react";
import { useProjectsStore } from "@/features/projects/useProjectsStore";
import { autoSaveIntervalSeconds, usePreferences } from "@/store/preferences";
import { useTabsStore } from "./useTabsStore";

interface UseAutoSaveOptions {
  onSaved?: (paths: string[]) => void;
}

export function useAutoSave({ onSaved }: UseAutoSaveOptions = {}): void {
  const autoSave = usePreferences((s) => s.autoSave);
  const seconds = autoSaveIntervalSeconds(autoSave);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    if (seconds === 0) return;
    let isMounted = true;
    const timer = setInterval(() => {
      const { edits } = useTabsStore.getState();
      if (Object.keys(edits).length === 0) return;
      void (async () => {
        const saved = await useProjectsStore.getState().saveActive();
        if (isMounted && saved.length > 0 && onSavedRef.current) onSavedRef.current(saved);
      })();
    }, seconds * 1000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [seconds]);
}
