import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoSave } from "./useAutoSave";
import { useEditorFeedback } from "./useEditorFeedback";

vi.mock("./useAutoSave", () => ({ useAutoSave: vi.fn() }));

describe("useEditorFeedback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("coordinates saved, notice, error, and autosave status", () => {
    const { result } = renderHook(() => useEditorFeedback());

    act(() => result.current.flashSaved());
    expect(result.current.feedback.savedAt).toBe(Date.now());

    act(() => result.current.flashMessage("3 files written to folder"));
    expect(result.current.feedback).toMatchObject({
      flashError: null,
      flashNotice: "3 files written to folder",
      savedAt: null,
    });

    act(() => result.current.showError(new Error("IndexedDB unavailable")));
    expect(result.current.feedback.flashError).toBe("IndexedDB unavailable");

    const autoSaveOptions = vi.mocked(useAutoSave).mock.calls[0]![0];
    expect(autoSaveOptions?.onSaved).toBeTypeOf("function");
    act(() => autoSaveOptions?.onSaved?.([]));
    expect(result.current.feedback.autoSavedAt).toBe(Date.now());

    act(() => vi.advanceTimersByTime(1_400));
    expect(result.current.feedback).toMatchObject({
      flashNotice: null,
      savedAt: null,
      autoSavedAt: null,
    });
  });
});
