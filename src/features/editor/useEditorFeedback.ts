import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useAutoSave } from "./useAutoSave";

const FEEDBACK_DURATION_MS = 1_400;

export interface EditorFeedback {
  flashError: string | null;
  flashNotice: string | null;
  savedAt: number | null;
  autoSavedAt: number | null;
}

export function useEditorFeedback() {
  const [feedback, setFeedback] = useState<EditorFeedback>({
    flashError: null,
    flashNotice: null,
    savedAt: null,
    autoSavedAt: null,
  });
  const manualTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleManualClear = useCallback(() => {
    if (manualTimer.current) clearTimeout(manualTimer.current);
    manualTimer.current = setTimeout(() => {
      setFeedback((current) => ({
        ...current,
        flashNotice: null,
        savedAt: null,
      }));
    }, FEEDBACK_DURATION_MS);
  }, []);

  const flashSaved = useCallback(() => {
    setFeedback((current) => ({
      ...current,
      flashError: null,
      flashNotice: null,
      savedAt: Date.now(),
    }));
    scheduleManualClear();
  }, [scheduleManualClear]);

  const flashMessage = useCallback(
    (message: string) => {
      setFeedback((current) => ({
        ...current,
        flashError: null,
        flashNotice: message,
        savedAt: null,
      }));
      scheduleManualClear();
    },
    [scheduleManualClear],
  );

  const showError = useCallback((cause: unknown) => {
    setFeedback((current) => ({ ...current, flashError: errorMessage(cause) }));
  }, []);

  const flashAutoSaved = useCallback(() => {
    setFeedback((current) => ({ ...current, autoSavedAt: Date.now() }));
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setFeedback((current) => ({ ...current, autoSavedAt: null }));
    }, FEEDBACK_DURATION_MS);
  }, []);

  useAutoSave({ onSaved: flashAutoSaved });

  useEffect(
    () => () => {
      if (manualTimer.current) clearTimeout(manualTimer.current);
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    },
    [],
  );

  return { feedback, flashMessage, flashSaved, showError };
}
