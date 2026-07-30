import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoSave } from "./useAutoSave";
import { useTabsStore } from "./useTabsStore";
import { useProjectsStore } from "@/features/projects";
import { usePreferences } from "@/store/preferences";
import type { Project } from "@/domain";

const PROJECT: Project = {
  id: "p-auto",
  name: "Auto",
  entry: "main.tex",
  files: {
    "main.tex": {
      id: "f1",
      path: "main.tex",
      name: "main.tex",
      kind: "tex",
      content: "old",
    },
  },
  folders: {},
  createdAt: "2026-05-22T12:00:00Z",
};

beforeEach(() => {
  vi.useFakeTimers();
  usePreferences.setState({ theme: "light", density: "comfortable", autoSave: "5s" });
  useTabsStore.setState({ openTabs: ["main.tex"], activeTab: "main.tex", edits: {} });
  useProjectsStore.setState({
    summaries: [],
    active: PROJECT,
    loading: false,
    error: null,
    saveActive: async () => ["main.tex"],
  } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutoSave", () => {
  it("does not fire when no dirty edits exist", async () => {
    const save = vi.fn(async () => ["main.tex"]);
    useProjectsStore.setState({ ...useProjectsStore.getState(), saveActive: save } as never);
    renderHook(() => useAutoSave());
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("fires saveActive() on the configured cadence", async () => {
    const save = vi.fn(async () => ["main.tex"]);
    useProjectsStore.setState({ ...useProjectsStore.getState(), saveActive: save } as never);
    renderHook(() => useAutoSave());
    // Now add an edit.
    act(() => {
      useTabsStore.setState({
        ...useTabsStore.getState(),
        edits: { "main.tex": "new content" },
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalled();
  });

  it("does not fire when autoSave is off", async () => {
    usePreferences.setState({ ...usePreferences.getState(), autoSave: "off" });
    const save = vi.fn(async () => ["main.tex"]);
    useProjectsStore.setState({ ...useProjectsStore.getState(), saveActive: save } as never);
    renderHook(() => useAutoSave());
    act(() => {
      useTabsStore.setState({
        ...useTabsStore.getState(),
        edits: { "main.tex": "new content" },
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("does not reset the timer when edits change again before it fires (interval behavior)", async () => {
    const save = vi.fn(async () => ["main.tex"]);
    useProjectsStore.setState({ ...useProjectsStore.getState(), saveActive: save } as never);
    renderHook(() => useAutoSave());
    act(() => {
      useTabsStore.setState({
        ...useTabsStore.getState(),
        edits: { "main.tex": "first" },
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(3_000); // 3s into the 5s interval
    });
    act(() => {
      useTabsStore.setState({
        ...useTabsStore.getState(),
        edits: { "main.tex": "second" },
      });
    });
    // Another 2s completes the original 5s interval.
    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalled();
  });

  it("calls onSaved with the saved paths when the timer fires", async () => {
    const onSaved = vi.fn();
    useProjectsStore.setState({
      ...useProjectsStore.getState(),
      saveActive: async () => ["main.tex"],
    } as never);
    renderHook(() => useAutoSave({ onSaved }));
    act(() => {
      useTabsStore.setState({
        ...useTabsStore.getState(),
        edits: { "main.tex": "x" },
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(onSaved).toHaveBeenCalledWith(["main.tex"]);
  });

  it("does not call onSaved when saveActive returns no saved paths", async () => {
    const onSaved = vi.fn();
    useProjectsStore.setState({
      ...useProjectsStore.getState(),
      saveActive: async () => [],
    } as never);
    renderHook(() => useAutoSave({ onSaved }));
    act(() => {
      useTabsStore.setState({
        ...useTabsStore.getState(),
        edits: { "main.tex": "x" },
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(onSaved).not.toHaveBeenCalled();
  });
});
