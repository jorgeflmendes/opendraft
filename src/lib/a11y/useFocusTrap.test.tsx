import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useFocusTrap } from "./useFocusTrap";

function Modal({ active, children }: { active: boolean; children: React.ReactNode }) {
  const ref = useFocusTrap<HTMLDivElement>(active);
  return (
    <div ref={ref} tabIndex={-1} data-testid="modal">
      {children}
    </div>
  );
}

function Harness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="trigger">
        Open
      </button>
      {open ? (
        <Modal active>
          <button type="button" data-testid="first">
            First
          </button>
          <button type="button" data-testid="middle">
            Middle
          </button>
          <button type="button" data-testid="last" onClick={() => setOpen(false)}>
            Close
          </button>
        </Modal>
      ) : null}
    </>
  );
}

describe("useFocusTrap", () => {
  it("moves focus into the container when the trap activates", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId("trigger"));
    expect(screen.getByTestId("first")).toHaveFocus();
  });

  it("wraps Tab from the last focusable back to the first", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId("trigger"));
    screen.getByTestId("last").focus();
    await user.tab();
    expect(screen.getByTestId("first")).toHaveFocus();
  });

  it("wraps Shift+Tab from the first focusable back to the last", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId("trigger"));
    screen.getByTestId("first").focus();
    await user.tab({ shift: true });
    expect(screen.getByTestId("last")).toHaveFocus();
  });

  it("restores focus to the trigger when the trap deactivates", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByTestId("trigger");
    await user.click(trigger);
    await user.click(screen.getByTestId("last"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(trigger).toHaveFocus();
  });

  it("does nothing when active=false", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button" data-testid="outside">
          Outside
        </button>
        <Modal active={false}>
          <button type="button" data-testid="inside">
            Inside
          </button>
        </Modal>
      </>,
    );
    screen.getByTestId("outside").focus();
    await user.tab();
    expect(screen.getByTestId("inside")).toHaveFocus();
  });

  it("pins focus on the container itself when there are no focusables", async () => {
    const user = userEvent.setup();
    render(
      <Modal active>
        <p>nothing focusable here</p>
      </Modal>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("modal")).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId("modal")).toHaveFocus();
  });

  it("captures Shift+Tab when activeElement is outside the trap and wraps to the last", async () => {
    render(
      <>
        <button type="button" data-testid="outside">
          Outside
        </button>
        <Modal active>
          <button type="button" data-testid="first">
            First
          </button>
          <button type="button" data-testid="last">
            Last
          </button>
        </Modal>
      </>,
    );
    screen.getByTestId("outside").focus();
    expect(screen.getByTestId("outside")).toHaveFocus();
    // Dispatch on window because that is where the hook installs its listener.
    const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true });
    window.dispatchEvent(event);
    expect(screen.getByTestId("last")).toHaveFocus();
  });

  it("lets the browser handle Tab when focus is mid-cycle (does not preventDefault)", async () => {
    const user = userEvent.setup();
    render(
      <Modal active>
        <button type="button" data-testid="first">
          First
        </button>
        <button type="button" data-testid="middle">
          Middle
        </button>
        <button type="button" data-testid="last">
          Last
        </button>
      </Modal>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    screen.getByTestId("first").focus();
    await user.tab();
    expect(screen.getByTestId("middle")).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByTestId("first")).toHaveFocus();
  });

  it("skips disabled buttons in the cycle", async () => {
    const user = userEvent.setup();
    render(
      <Modal active>
        <button type="button" data-testid="a">
          A
        </button>
        <button type="button" data-testid="b" disabled>
          Disabled
        </button>
        <button type="button" data-testid="c">
          C
        </button>
      </Modal>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("a")).toHaveFocus();
    screen.getByTestId("c").focus();
    await user.tab();
    expect(screen.getByTestId("a")).toHaveFocus();
  });
});
