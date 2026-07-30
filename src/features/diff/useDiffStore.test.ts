import { describe, it, expect, beforeEach } from "vitest";
import { useDiffStore } from "./useDiffStore";

describe("useDiffStore", () => {
  beforeEach(() => {
    useDiffStore.setState({ open: false });
  });

  it("starts closed", () => {
    expect(useDiffStore.getState().open).toBe(false);
  });

  it("can open diff", () => {
    useDiffStore.getState().openDiff();
    expect(useDiffStore.getState().open).toBe(true);
  });

  it("can close diff", () => {
    useDiffStore.getState().openDiff();
    expect(useDiffStore.getState().open).toBe(true);
    useDiffStore.getState().closeDiff();
    expect(useDiffStore.getState().open).toBe(false);
  });

  it("can toggle diff", () => {
    useDiffStore.getState().toggleDiff();
    expect(useDiffStore.getState().open).toBe(true);
    useDiffStore.getState().toggleDiff();
    expect(useDiffStore.getState().open).toBe(false);
  });

  it("close handles missing path", () => {
    useDiffStore.getState().closeDiff();
    expect(useDiffStore.getState().open).toBe(false);
  });
});
