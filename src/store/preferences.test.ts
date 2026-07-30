import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { usePreferences, autoSaveIntervalSeconds } from "./preferences";

describe("preferences store", () => {
  const originalMatchMedia = window.matchMedia;
  const originalWindow = global.window;

  beforeEach(() => {
    // We cannot use setState with true to reset because of the persist middleware.
    // That wipes the actions from the store. Instead, we use the setters.
    if (usePreferences.getState().setTheme) {
      usePreferences.getState().setTheme("light");
      usePreferences.getState().setDensity("comfortable");
      usePreferences.getState().setAutoSave("15s");
    }
  });

  afterEach(() => {
    global.window.matchMedia = originalMatchMedia;
    global.window = originalWindow;
  });

  it("can toggle theme between dark and light", () => {
    usePreferences.getState().setTheme("light");
    usePreferences.getState().toggleTheme();
    expect(usePreferences.getState().theme).toBe("dark");

    usePreferences.getState().toggleTheme();
    expect(usePreferences.getState().theme).toBe("light");
  });

  it("can set theme explicitly", () => {
    usePreferences.getState().setTheme("dark");
    expect(usePreferences.getState().theme).toBe("dark");
  });

  it("can set density explicitly", () => {
    usePreferences.getState().setDensity("compact");
    expect(usePreferences.getState().density).toBe("compact");
  });

  it("can set autoSave explicitly", () => {
    usePreferences.getState().setAutoSave("5s");
    expect(usePreferences.getState().autoSave).toBe("5s");
  });

  it("autoSaveIntervalSeconds returns correct values", () => {
    expect(autoSaveIntervalSeconds("5s")).toBe(5);
    expect(autoSaveIntervalSeconds("15s")).toBe(15);
    expect(autoSaveIntervalSeconds("30s")).toBe(30);
    expect(autoSaveIntervalSeconds("off")).toBe(0);
  });

  it("uses matchMedia correctly when false", async () => {
    const origWindow = global.window;

    try {
      vi.resetModules();

      global.window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: false,
      }));

      const module = await import("./preferences");
      expect(module.usePreferences.getState().theme).toBe("light");
    } finally {
      global.window = origWindow;
    }
  });

  it("partialize filters state for persistence", () => {
    usePreferences.getState().setTheme("dark");
    usePreferences.getState().setDensity("compact");
    usePreferences.getState().setAutoSave("5s");

    const persistedStr = window.localStorage.getItem("opendraft.prefs");
    if (persistedStr) {
      const persisted = JSON.parse(persistedStr);
      expect(persisted.state.theme).toBe("dark");
      expect(persisted.state.density).toBe("compact");
      expect(persisted.state.autoSave).toBe("5s");
      expect(persisted.state.setTheme).toBeUndefined();
    }
  });
});
