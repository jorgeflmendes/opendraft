import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useScreen, installScreenNavigation } from "./screen";

describe("screen store", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // @ts-expect-error test mock
    delete window.location;
    // @ts-expect-error test mock
    window.location = { ...originalLocation, hash: "" };
    useScreen.getState().syncFromLocation();
  });

  afterEach(() => {
    // @ts-expect-error test mock
    window.location = originalLocation;
  });

  it("handles malformed hash safely", () => {
    window.location.hash = "#/editor/%ZZ";
    useScreen.getState().syncFromLocation();

    expect(useScreen.getState().current).toBe("projects");
    expect(useScreen.getState().projectId).toBeNull();
  });

  it("handles empty editor route", () => {
    window.location.hash = "#/editor";
    useScreen.getState().syncFromLocation();

    expect(useScreen.getState().current).toBe("editor");
    expect(useScreen.getState().projectId).toBeNull();
  });

  it("handles unknown routes", () => {
    window.location.hash = "#/unknown-route";
    useScreen.getState().syncFromLocation();

    expect(useScreen.getState().current).toBe("landing");
  });

  it("handles valid editor path with ID", () => {
    window.location.hash = "#/editor/test-id";
    useScreen.getState().syncFromLocation();

    expect(useScreen.getState().current).toBe("editor");
    expect(useScreen.getState().projectId).toBe("test-id");
  });

  it("navigates to projects correctly", () => {
    useScreen.getState().go("projects");
    expect(useScreen.getState().current).toBe("projects");
    expect(window.location.hash).toBe("#/projects");
  });

  it("navigates to landing correctly", () => {
    useScreen.getState().go("landing");
    expect(useScreen.getState().current).toBe("landing");
    expect(window.location.hash).toBe("#/");
  });

  it("handles editor route with trailing slash but no ID", () => {
    window.location.hash = "#/editor/";
    useScreen.getState().syncFromLocation();

    expect(useScreen.getState().current).toBe("landing");
  });

  it("navigates to editor without ID", () => {
    useScreen.getState().go("editor");
    expect(useScreen.getState().current).toBe("editor");
    expect(useScreen.getState().projectId).toBeNull();
    expect(window.location.hash).toBe("#/editor");
  });

  it("navigates to editor with ID", () => {
    useScreen.getState().go("editor", "my-id");
    expect(useScreen.getState().current).toBe("editor");
    expect(useScreen.getState().projectId).toBe("my-id");
    expect(window.location.hash).toBe("#/editor/my-id");
  });

  it("installs and uninstalls window event listener", () => {
    const removeListenerSpy = vi.spyOn(window, "removeEventListener");
    const addListenerSpy = vi.spyOn(window, "addEventListener");

    const cleanup = installScreenNavigation();
    expect(addListenerSpy).toHaveBeenCalledWith("hashchange", expect.any(Function));

    cleanup();
    expect(removeListenerSpy).toHaveBeenCalledWith("hashchange", expect.any(Function));

    addListenerSpy.mockRestore();
    removeListenerSpy.mockRestore();
  });

  it("installScreenNavigation returns no-op when window is undefined", () => {
    const origWindow = global.window;

    try {
      // @ts-expect-error test mock
      delete global.window;

      const cleanup = installScreenNavigation();
      expect(typeof cleanup).toBe("function");

      cleanup();
    } finally {
      global.window = origWindow;
    }
  });

  it("navigates safely when window is undefined", () => {
    const origWindow = global.window;

    try {
      // @ts-expect-error test mock
      delete global.window;

      useScreen.getState().go("projects");
      expect(useScreen.getState().current).toBe("projects");
    } finally {
      global.window = origWindow;
    }
  });

  it("currentLocationRoute falls back when window is undefined", () => {
    const origWindow = global.window;

    try {
      // @ts-expect-error test mock
      delete global.window;

      useScreen.getState().syncFromLocation();

      expect(useScreen.getState().current).toBe("landing");
      expect(useScreen.getState().projectId).toBeNull();
    } finally {
      global.window = origWindow;
    }
  });

  it("only updates hash when different from current", () => {
    useScreen.getState().go("projects");
    expect(window.location.hash).toBe("#/projects");

    const hashSetter = vi.fn();
    Object.defineProperty(window.location, "hash", {
      set: hashSetter,
      get: () => "#/projects",
    });

    useScreen.getState().go("projects");
    expect(hashSetter).not.toHaveBeenCalled();

    Object.defineProperty(window.location, "hash", {
      value: "#/projects",
      writable: true,
      configurable: true,
    });
  });
});
