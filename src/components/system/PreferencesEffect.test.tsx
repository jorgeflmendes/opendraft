import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import { PreferencesEffect } from "./PreferencesEffect";
import { usePreferences } from "@/store/preferences";

describe("PreferencesEffect", () => {
  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;

  beforeEach(() => {
    usePreferences.getState().setTheme?.("light");
    usePreferences.getState().setDensity?.("comfortable");

    const store: Record<string, string> = {};
    Storage.prototype.getItem = vi.fn((key: string) => store[key] || null);
    Storage.prototype.setItem = vi.fn((key: string, value: string) => {
      store[key] = value;
    });
  });

  afterEach(() => {
    Storage.prototype.getItem = originalGetItem;
    Storage.prototype.setItem = originalSetItem;
    vi.restoreAllMocks();
  });

  it("mirrors the initial theme and density onto <html>", () => {
    render(<PreferencesEffect />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
  });

  it("updates <html> when the store changes", () => {
    render(<PreferencesEffect />);
    act(() => {
      usePreferences.setState({ theme: "dark", density: "compact" });
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
  });

  it("renders nothing into the DOM tree itself", () => {
    const { container } = render(<PreferencesEffect />);
    expect(container.firstChild).toBeNull();
  });
});
