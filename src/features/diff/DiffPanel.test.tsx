import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project } from "@/domain";
import { useProjectsStore } from "@/features/projects";
import { useTabsStore } from "@/features/editor";
import { DiffPanel } from "./DiffPanel";
import { useDiffStore } from "./useDiffStore";

const SEED_PROJECT: Project = {
  id: "p-diff",
  name: "Diff Test",
  entry: "main.tex",
  files: {
    "main.tex": {
      id: "f-main",
      path: "main.tex",
      name: "main.tex",
      kind: "tex",
      content: "Hello\nworld\n",
    },
    "notes.md": {
      id: "f-notes",
      path: "notes.md",
      name: "notes.md",
      kind: "md",
      content: "# Notes\n",
    },
  },
  folders: {},
  createdAt: "2026-05-22T12:00:00Z",
};

beforeEach(() => {
  // Reset the three stores DiffPanel reads so each test starts clean.
  // (useProjectsStore.setState etc. is exposed by Zustand.)
  useProjectsStore.setState({ active: SEED_PROJECT, error: null, loading: false });
  useTabsStore.setState({ openTabs: [], activeTab: null, edits: {} });
  useDiffStore.setState({ open: false });
});

describe("<DiffPanel />", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<DiffPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the empty state when open with no edits", () => {
    useDiffStore.setState({ open: true });
    render(<DiffPanel />);
    expect(screen.getByText(/No changes since the last save/i)).toBeInTheDocument();
  });

  it("lists modified files with +/- counts and a unified diff view", async () => {
    useTabsStore.setState({
      openTabs: ["main.tex"],
      activeTab: "main.tex",
      edits: { "main.tex": "Hello\nthere\n" },
    });
    useDiffStore.setState({ open: true });
    render(<DiffPanel />);

    // File row visible with the +/- counts.
    const row = screen.getByRole("button", { name: /main\.tex/ });
    expect(within(row).getByText("+1")).toBeInTheDocument();
    expect(within(row).getByText("-1")).toBeInTheDocument();

    // Unified diff shows the deleted line and the inserted line.
    const diff = screen.getByLabelText(/Diff of main\.tex/i);
    expect(within(diff).getByText("world")).toBeInTheDocument();
    expect(within(diff).getByText("there")).toBeInTheDocument();
  });

  it("closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    useDiffStore.setState({ open: true });
    render(<DiffPanel />);
    expect(useDiffStore.getState().open).toBe(true);
    await user.keyboard("{Escape}");
    expect(useDiffStore.getState().open).toBe(false);
  });
});
