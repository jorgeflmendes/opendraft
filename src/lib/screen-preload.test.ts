import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/screens/Projects", () => ({ ProjectsScreen: () => null }));
vi.mock("@/screens/Editor", () => ({ EditorScreen: () => null }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("screen preloading", () => {
  it("reuses the same module request for repeated navigation intent", async () => {
    const { loadProjectsScreen } = await import("./screen-preload");

    const first = loadProjectsScreen();
    const second = loadProjectsScreen();

    expect(second).toBe(first);
    await expect(first).resolves.toHaveProperty("ProjectsScreen");
  });

  it("schedules the likely next screen while the browser is idle", async () => {
    const requestIdleCallback = vi.fn(() => 42);
    const cancelIdleCallback = vi.fn();
    vi.stubGlobal("requestIdleCallback", requestIdleCallback);
    vi.stubGlobal("cancelIdleCallback", cancelIdleCallback);

    const { scheduleNextScreenPreload } = await import("./screen-preload");
    const cancel = scheduleNextScreenPreload("landing");

    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 1_500 });

    cancel();
    expect(cancelIdleCallback).toHaveBeenCalledWith(42);
  });

  it("does not speculate on data-saving connections", async () => {
    const requestIdleCallback = vi.fn(() => 42);
    vi.stubGlobal("requestIdleCallback", requestIdleCallback);
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });

    const { scheduleNextScreenPreload } = await import("./screen-preload");
    scheduleNextScreenPreload("landing");

    expect(requestIdleCallback).not.toHaveBeenCalled();
    Reflect.deleteProperty(navigator, "connection");
  });
});
