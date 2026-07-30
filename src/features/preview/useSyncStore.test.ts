import { describe, it, expect, beforeEach } from "vitest";
import { useSyncStore } from "./useSyncStore";

beforeEach(() => {
  useSyncStore.getState().reset();
});

describe("useSyncStore", () => {
  it("starts with no highlights, no jump page, and no reverse target", () => {
    const s = useSyncStore.getState();
    expect(s.highlights).toEqual([]);
    expect(s.jumpToPage).toBeNull();
    expect(s.reverseTarget).toBeNull();
  });

  it("forward() stores rectangles and sets jumpToPage to the first rect's page", () => {
    useSyncStore.getState().forward([
      { page: 3, x: 10, y: 20, w: 100, h: 8 },
      { page: 4, x: 0, y: 0, w: 100, h: 8 },
    ]);
    const s = useSyncStore.getState();
    expect(s.highlights).toHaveLength(2);
    expect(s.jumpToPage).toBe(3);
  });

  it("forward() bumps forwardRequestId so repeat calls re-fire", () => {
    const before = useSyncStore.getState().forwardRequestId;
    useSyncStore.getState().forward([{ page: 1, x: 0, y: 0, w: 1, h: 1 }]);
    useSyncStore.getState().forward([{ page: 1, x: 0, y: 0, w: 1, h: 1 }]);
    const after = useSyncStore.getState().forwardRequestId;
    expect(after).toBeGreaterThan(before + 1);
  });

  it("forward() clears highlights and jump target when called with an empty list", () => {
    useSyncStore.getState().forward([{ page: 2, x: 0, y: 0, w: 1, h: 1 }]);
    useSyncStore.getState().forward([]);
    const after = useSyncStore.getState();
    expect(after.highlights).toEqual([]);
    expect(after.jumpToPage).toBeNull();
  });

  it("reverse() sets a target with a fresh requestId on every call", () => {
    useSyncStore.getState().reverse("main.tex", 7);
    const t1 = useSyncStore.getState().reverseTarget!;
    useSyncStore.getState().reverse("main.tex", 7);
    const t2 = useSyncStore.getState().reverseTarget!;
    expect(t1.path).toBe("main.tex");
    expect(t1.line).toBe(7);
    expect(t2.requestId).toBeGreaterThan(t1.requestId);
  });

  it("clearReverse() drops the reverse target without touching highlights", () => {
    useSyncStore.getState().forward([{ page: 1, x: 0, y: 0, w: 1, h: 1 }]);
    useSyncStore.getState().reverse("main.tex", 7);
    useSyncStore.getState().clearReverse();
    const s = useSyncStore.getState();
    expect(s.reverseTarget).toBeNull();
    expect(s.highlights).toHaveLength(1);
  });

  it("reset() wipes both directions", () => {
    useSyncStore.getState().forward([{ page: 1, x: 0, y: 0, w: 1, h: 1 }]);
    useSyncStore.getState().reverse("a", 1);
    useSyncStore.getState().reset();
    const s = useSyncStore.getState();
    expect(s.highlights).toEqual([]);
    expect(s.jumpToPage).toBeNull();
    expect(s.reverseTarget).toBeNull();
  });
});
