import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProjectSummary } from "@/domain";
import { ProjectListItem } from "./ProjectListItem";

const summary: ProjectSummary = {
  id: "project-1",
  name: "Research Notes",
  description: "A local LaTeX project",
  texFileCount: 3,
  fileCount: 5,
  lastOpenedAt: "2026-07-10T00:00:00Z",
};

describe("ProjectListItem", () => {
  it("opens a focused row with Enter or Space", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ProjectListItem summary={summary} onOpen={onOpen} />);
    const row = screen.getByRole("button", { name: "Open Research Notes" });

    row.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("opens active rows and requires explicit confirmation before deletion", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(<ProjectListItem summary={summary} onOpen={onOpen} />);

    await user.click(screen.getByRole("button", { name: "Open Research Notes" }));
    expect(onOpen).toHaveBeenCalledWith("project-1");
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();

    rerender(<ProjectListItem summary={summary} active onOpen={onOpen} onDelete={onDelete} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpen).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: /more actions/i }));
    await user.click(screen.getByRole("menuitem", { name: "Delete project" }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("menuitem", { name: /delete research notes.*confirm/i }));
    expect(onDelete).toHaveBeenCalledWith("project-1");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("dismisses the action menu on an outside click", async () => {
    const user = userEvent.setup();
    render(<ProjectListItem summary={summary} onOpen={() => {}} onDelete={() => {}} />);

    await user.click(screen.getByRole("button", { name: /more actions/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
