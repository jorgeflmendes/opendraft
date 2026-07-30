import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useKeyboardShortcut } from "./useKeyboardShortcut";

// We can't reliably synthesise platform-aware Mod+S events through
// userEvent's keyboard("{Meta>}s") in jsdom because the Meta/Ctrl
// dispatch is platform-sensitive. Instead, fire raw KeyboardEvents
// against window - exactly what useKeyboardShortcut listens for.
const fire = (init: Partial<KeyboardEventInit> & { key: string }) => {
  window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
};

describe("useKeyboardShortcut", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
  });

  it("fires the handler when the combo matches", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut("Ctrl+S", handler));
    fire({ key: "s", ctrlKey: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not fire on a non-matching combo", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut("Ctrl+S", handler));
    fire({ key: "s" });
    fire({ key: "x", ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("preventDefault() runs by default", () => {
    renderHook(() => useKeyboardShortcut("Ctrl+S", () => {}));
    const evt = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true });
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });

  it("preventDefault: false leaves the default behaviour", () => {
    renderHook(() => useKeyboardShortcut("Ctrl+S", () => {}, { preventDefault: false }));
    const evt = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true });
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
  });

  it("respects enabled=false (no listener attached, no handler call)", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut("Ctrl+S", handler, { enabled: false }));
    fire({ key: "s", ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores events that target an input by default", () => {
    const handler = vi.fn();
    const Test = () => {
      useKeyboardShortcut("Ctrl+S", handler);
      return <input data-testid="x" />;
    };
    const { getByTestId } = render(<Test />);
    // Dispatch on the input directly so e.target IS the input.
    getByTestId("x").dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }),
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("allowInInputs lets the handler fire even with an input focused", async () => {
    const handler = vi.fn();
    const Test = () => {
      useKeyboardShortcut("Ctrl+S", handler, { allowInInputs: true });
      return <input data-testid="x" />;
    };
    const { getByTestId } = render(<Test />);
    const user = userEvent.setup();
    await user.click(getByTestId("x"));
    // Dispatch directly on the input so e.target is the input.
    getByTestId("x").dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }),
    );
    expect(handler).toHaveBeenCalledOnce();
  });

  it("always sees the latest handler (no rebinding on closure change)", () => {
    const seq: number[] = [];
    const { rerender } = renderHook(
      ({ n }: { n: number }) => useKeyboardShortcut("Ctrl+S", () => seq.push(n)),
      { initialProps: { n: 1 } },
    );
    fire({ key: "s", ctrlKey: true });
    rerender({ n: 2 });
    fire({ key: "s", ctrlKey: true });
    expect(seq).toEqual([1, 2]);
  });

  it("unmount removes the listener", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useKeyboardShortcut("Ctrl+S", handler));
    unmount();
    fire({ key: "s", ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
  });
});
