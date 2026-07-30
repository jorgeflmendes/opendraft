import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { useFileContent, useFileDirty, useDirtyPaths } from "./selectors";
import { useTabsStore } from "./useTabsStore";
import { useProjectsStore } from "@/features/projects/useProjectsStore";

describe("editor selectors", () => {
  beforeEach(async () => {
    useTabsStore.setState({ openTabs: [], activeTab: null, edits: {} });
    useProjectsStore.setState({ active: null, summaries: [], loading: false, error: null });
    await useProjectsStore.getState().openProject("p-stokes-notes-v3");
  });

  describe("useFileContent", () => {
    it("returns the project original when no edit exists", () => {
      const { result } = renderHook(() => useFileContent("main.tex"));
      expect(result.current).toContain("\\documentclass");
    });

    it("returns the edit when one exists, regardless of original", () => {
      act(() => useTabsStore.getState().updateContent("main.tex", "edited content"));
      const { result } = renderHook(() => useFileContent("main.tex"));
      expect(result.current).toBe("edited content");
    });

    it("returns undefined for an unknown path", () => {
      const { result } = renderHook(() => useFileContent("ghost.tex"));
      expect(result.current).toBeUndefined();
    });

    it("returns the edit overlay even when the original file is binary", () => {
      // A user shouldn't normally edit a binary file directly, but
      // the selector's contract is "edit ?? text(original)". If
      // someone calls updateContent against a binary path, the
      // edit string wins.
      act(() => {
        const state = useProjectsStore.getState();
        useProjectsStore.setState({
          ...state,
          active: {
            ...state.active!,
            files: {
              ...state.active!.files,
              "logo.png": {
                id: "f-logo-2",
                path: "logo.png",
                name: "logo.png",
                kind: "img",
                content: new Uint8Array([1, 2, 3]),
              },
            },
          },
        });
        useTabsStore.getState().updateContent("logo.png", "stringified override");
      });
      const { result } = renderHook(() => useFileContent("logo.png"));
      expect(result.current).toBe("stringified override");
    });

    it("returns undefined for binary files (Uint8Array content)", () => {
      // Inject a binary file into the active project directly.
      act(() => {
        const state = useProjectsStore.getState();
        useProjectsStore.setState({
          ...state,
          active: {
            ...state.active!,
            files: {
              ...state.active!.files,
              "logo.png": {
                id: "f-logo",
                path: "logo.png",
                name: "logo.png",
                kind: "img",
                content: new Uint8Array([1, 2, 3]),
              },
            },
          },
        });
      });
      const { result } = renderHook(() => useFileContent("logo.png"));
      expect(result.current).toBeUndefined();
      // useFileDirty + useDirtyPaths must agree.
      const { result: dirty } = renderHook(() => useFileDirty("logo.png"));
      expect(dirty.current).toBe(false);
      const { result: paths } = renderHook(() => useDirtyPaths());
      expect(paths.current).not.toContain("logo.png");
    });

    it("returns undefined when null is passed", () => {
      const { result } = renderHook(() => useFileContent(null));
      expect(result.current).toBeUndefined();
    });
  });

  describe("useFileDirty", () => {
    it("is false when there's no edit", () => {
      const { result } = renderHook(() => useFileDirty("main.tex"));
      expect(result.current).toBe(false);
    });

    it("is true when the edit differs from the original", () => {
      act(() => useTabsStore.getState().updateContent("main.tex", "different"));
      const { result } = renderHook(() => useFileDirty("main.tex"));
      expect(result.current).toBe(true);
    });

    it("is false when the edit equals the original (no-op edit)", () => {
      const original = useProjectsStore.getState().active!.files["main.tex"]!.content as string;
      act(() => useTabsStore.getState().updateContent("main.tex", original));
      const { result } = renderHook(() => useFileDirty("main.tex"));
      expect(result.current).toBe(false);
    });

    it("is false when null is passed", () => {
      const { result } = renderHook(() => useFileDirty(null));
      expect(result.current).toBe(false);
    });
  });

  describe("useDirtyPaths", () => {
    it("returns paths whose edits diverge from the original", () => {
      act(() => {
        useTabsStore.getState().updateContent("main.tex", "x");
        useTabsStore.getState().updateContent("references.bib", "y");
      });
      const { result } = renderHook(() => useDirtyPaths());
      // useDirtyPaths returns a readonly array; copy before sort.
      expect([...result.current].sort()).toEqual(["main.tex", "references.bib"]);
    });

    it("excludes paths whose edits happen to equal the original", () => {
      const original = useProjectsStore.getState().active!.files["main.tex"]!.content as string;
      act(() => {
        useTabsStore.getState().updateContent("main.tex", original);
        useTabsStore.getState().updateContent("references.bib", "y");
      });
      const { result } = renderHook(() => useDirtyPaths());
      expect(result.current).toEqual(["references.bib"]);
    });

    it("returns an empty array when no project is active", () => {
      act(() => useProjectsStore.getState().closeProject());
      const { result } = renderHook(() => useDirtyPaths());
      expect(result.current).toEqual([]);
    });
  });
});
