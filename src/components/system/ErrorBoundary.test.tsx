import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";

// React logs caught errors via console.error in dev - we silence it
// for these tests so the suite output stays signal-only.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
});

function Bomb({ when = true }: { when?: boolean }) {
  if (when) throw new Error("kaboom");
  return <span>OK</span>;
}

describe("<ErrorBoundary />", () => {
  it("renders children when they do not throw", () => {
    render(
      <ErrorBoundary label="Editor">
        <span>healthy</span>
      </ErrorBoundary>,
    );
    expect(screen.getByText("healthy")).toBeInTheDocument();
  });

  it("catches a render-time throw and shows the labelled error card", () => {
    render(
      <ErrorBoundary label="Preview">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Something broke in Preview/i)).toBeInTheDocument();
    // The headline message paragraph; the stack trace inside
    // <details> also contains "kaboom" so we narrow by class.
    const msg = document.querySelector(".od-error-boundary-msg");
    expect(msg?.textContent).toBe("kaboom");
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy details/i })).toBeInTheDocument();
  });

  it("invokes onError exactly once per crash with the thrown value and info", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary label="Editor" onError={onError}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    const [err, info] = onError.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("kaboom");
    expect(info).toHaveProperty("componentStack");
  });

  it("re-renders children after Try again is clicked", async () => {
    const user = userEvent.setup();
    // Mutable cell drives whether the child throws on the next render.
    const flag = { current: true };
    function Resettable() {
      if (flag.current) throw new Error("first time fails");
      return <span>now healthy</span>;
    }
    const onReset = vi.fn(() => {
      flag.current = false;
    });
    render(
      <ErrorBoundary label="Editor" onReset={onReset}>
        <Resettable />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.getByText(/now healthy/)).toBeInTheDocument();
  });

  it("writes a copyable details blob to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // jsdom doesn't provide `navigator.clipboard` and userEvent's
    // setup({writeToClipboard:true}) replaces it with its own mock.
    // We pass an explicit clipboard via setup() and a separate
    // override; the button reads navigator.clipboard at click time.
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <ErrorBoundary label="Diff">
        <Bomb />
      </ErrorBoundary>,
    );
    // Plain fireEvent.click - userEvent intercepts clipboard
    // interactions when not given an explicit clipboard, which
    // bypasses our spy.
    fireEvent.click(screen.getByRole("button", { name: /copy details/i }));
    expect(writeText).toHaveBeenCalledOnce();
    const payload = writeText.mock.calls[0]![0] as string;
    expect(payload).toContain("Where: Diff");
    expect(payload).toContain("Error: kaboom");
  });
});
