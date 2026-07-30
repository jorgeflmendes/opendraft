import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useShortcutStore } from "@/store/shortcuts";
import { ShortcutSettingsDialog } from "./ShortcutSettingsDialog";

describe("ShortcutSettingsDialog", () => {
  beforeEach(() => {
    useShortcutStore.getState().resetAll();
  });

  it("groups the supported actions and exposes persisted bindings", () => {
    render(<ShortcutSettingsDialog open onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Editing" })).toBeInTheDocument();
    expect(screen.getByText("45 configurable actions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Change Bold text/i })).toHaveTextContent("Ctrl + B");
  });

  it("records a replacement binding", async () => {
    const user = userEvent.setup();
    render(<ShortcutSettingsDialog open onClose={vi.fn()} />);
    const binding = screen.getByRole("button", { name: /Change Bold text/i });
    await user.click(binding);
    fireEvent.keyDown(binding, { key: "e", ctrlKey: true });
    expect(useShortcutStore.getState().overrides["editor.bold"]).toEqual(["Mod+E"]);
    expect(screen.getByRole("button", { name: /Change Bold text/i })).toHaveTextContent("Ctrl + E");
  });

  it("prevents conflicting workspace bindings", async () => {
    const user = userEvent.setup();
    render(<ShortcutSettingsDialog open onClose={vi.fn()} />);
    const binding = screen.getByRole("button", { name: /Change Bold text/i });
    await user.click(binding);
    fireEvent.keyDown(binding, { key: "s", ctrlKey: true });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ctrl + S is already assigned to Compile project",
    );
    expect(useShortcutStore.getState().overrides["editor.bold"]).toBeUndefined();
  });

  it("can disable and restore an action", async () => {
    const user = userEvent.setup();
    render(<ShortcutSettingsDialog open onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Remove Ctrl + B from Bold text" }));
    expect(useShortcutStore.getState().overrides["editor.bold"]).toEqual([]);

    const boldRow = screen.getByText("Bold text").closest(".od-shortcut-row");
    expect(boldRow).not.toBeNull();
    await user.click(
      within(boldRow as HTMLElement).getByRole("button", { name: /Restore default/i }),
    );
    expect(useShortcutStore.getState().overrides["editor.bold"]).toBeUndefined();
  });

  it("filters actions and closes with Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ShortcutSettingsDialog open onClose={onClose} />);
    await user.type(screen.getByRole("searchbox", { name: "Search shortcuts" }), "bibliography");
    expect(screen.getByText("Open bibliography")).toBeInTheDocument();
    expect(screen.queryByText("Bold text")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
