import { describe, it, expect, beforeEach } from "vitest";
import { useTabsStore } from "./useTabsStore";

describe("useTabsStore", () => {
  beforeEach(() => {
    useTabsStore.setState({ openTabs: [], activeTab: null, edits: {} });
  });

  it("starts empty", () => {
    const s = useTabsStore.getState();
    expect(s.openTabs).toEqual([]);
    expect(s.activeTab).toBeNull();
    expect(s.edits).toEqual({});
  });

  it("open() adds a tab and makes it active", () => {
    useTabsStore.getState().open("main.tex");
    const s = useTabsStore.getState();
    expect(s.openTabs).toEqual(["main.tex"]);
    expect(s.activeTab).toBe("main.tex");
  });

  it("open() of an already-open path focuses it (no duplicate)", () => {
    const { open } = useTabsStore.getState();
    open("a.tex");
    open("b.tex");
    open("a.tex");
    const s = useTabsStore.getState();
    expect(s.openTabs).toEqual(["a.tex", "b.tex"]);
    expect(s.activeTab).toBe("a.tex");
  });

  it("close() removes a tab without discarding its draft", () => {
    const { open, close, updateContent } = useTabsStore.getState();
    open("a.tex");
    open("b.tex");
    updateContent("a.tex", "edited");
    close("a.tex");
    const s = useTabsStore.getState();
    expect(s.openTabs).toEqual(["b.tex"]);
    expect(s.edits["a.tex"]).toBe("edited");
  });

  it("close() of the active tab activates the right neighbour", () => {
    const { open, close, setActive } = useTabsStore.getState();
    open("a.tex");
    open("b.tex");
    open("c.tex");
    setActive("b.tex");
    close("b.tex");
    expect(useTabsStore.getState().activeTab).toBe("c.tex");
  });

  it("close() of the active tab falls back to the left when no right neighbour", () => {
    const { open, close } = useTabsStore.getState();
    open("a.tex");
    open("b.tex");
    close("b.tex");
    expect(useTabsStore.getState().activeTab).toBe("a.tex");
  });

  it("close() of the last remaining tab clears activeTab", () => {
    const { open, close } = useTabsStore.getState();
    open("only.tex");
    close("only.tex");
    expect(useTabsStore.getState().activeTab).toBeNull();
    expect(useTabsStore.getState().openTabs).toEqual([]);
  });

  it("close() of a non-open path is a no-op", () => {
    const { open, close } = useTabsStore.getState();
    open("a.tex");
    close("ghost.tex");
    expect(useTabsStore.getState().openTabs).toEqual(["a.tex"]);
    expect(useTabsStore.getState().activeTab).toBe("a.tex");
  });

  it("setActive() switches focus only when the path is already open", () => {
    const { open, setActive } = useTabsStore.getState();
    open("a.tex");
    open("b.tex");
    setActive("a.tex");
    expect(useTabsStore.getState().activeTab).toBe("a.tex");
    setActive("ghost.tex");
    expect(useTabsStore.getState().activeTab).toBe("a.tex");
  });

  it("reset() empties the store by default, including edits", () => {
    const { open, updateContent, reset } = useTabsStore.getState();
    open("a.tex");
    updateContent("a.tex", "edited");
    reset();
    const s = useTabsStore.getState();
    expect(s.openTabs).toEqual([]);
    expect(s.activeTab).toBeNull();
    expect(s.edits).toEqual({});
  });

  it("reset() with an initial set focuses the first entry and clears edits", () => {
    useTabsStore.getState().updateContent("old.tex", "stale");
    useTabsStore.getState().reset(["main.tex", "extra.tex"]);
    const s = useTabsStore.getState();
    expect(s.openTabs).toEqual(["main.tex", "extra.tex"]);
    expect(s.activeTab).toBe("main.tex");
    expect(s.edits).toEqual({});
  });

  describe("edits", () => {
    it("updateContent() writes an edit entry per path", () => {
      const { updateContent } = useTabsStore.getState();
      updateContent("a.tex", "v1");
      updateContent("b.tex", "v2");
      updateContent("a.tex", "v1-modified");
      expect(useTabsStore.getState().edits).toEqual({
        "a.tex": "v1-modified",
        "b.tex": "v2",
      });
    });

    it("markClean(path) drops just that entry", () => {
      const { updateContent, markClean } = useTabsStore.getState();
      updateContent("a.tex", "x");
      updateContent("b.tex", "y");
      markClean("a.tex");
      expect(useTabsStore.getState().edits).toEqual({ "b.tex": "y" });
    });

    it("markClean() with no arg wipes every edit", () => {
      const { updateContent, markClean } = useTabsStore.getState();
      updateContent("a.tex", "x");
      updateContent("b.tex", "y");
      markClean();
      expect(useTabsStore.getState().edits).toEqual({});
    });

    it("markClean(path) on a clean file is a no-op", () => {
      const before = useTabsStore.getState().edits;
      useTabsStore.getState().markClean("ghost.tex");
      expect(useTabsStore.getState().edits).toBe(before);
    });

    it("discardEdits(path) drops the entry without otherwise mutating tabs", () => {
      const { open, updateContent, discardEdits } = useTabsStore.getState();
      open("a.tex");
      updateContent("a.tex", "edited");
      discardEdits("a.tex");
      expect(useTabsStore.getState().edits).toEqual({});
      expect(useTabsStore.getState().openTabs).toEqual(["a.tex"]);
      expect(useTabsStore.getState().activeTab).toBe("a.tex");
    });
  });

  it("markClean handles undefined by clearing all edits", () => {
    useTabsStore.getState().open("a.tex");
    useTabsStore.getState().open("b.tex");
    useTabsStore.getState().updateContent("a.tex", "A");
    useTabsStore.getState().updateContent("b.tex", "B");

    expect(Object.keys(useTabsStore.getState().edits)).toHaveLength(2);

    useTabsStore.getState().markClean();
    expect(Object.keys(useTabsStore.getState().edits)).toHaveLength(0);
  });
});
