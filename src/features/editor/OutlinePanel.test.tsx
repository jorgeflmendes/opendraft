import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutlinePanel } from "./OutlinePanel";
import { useTabsStore } from "./useTabsStore";
import { useProjectsStore } from "@/features/projects/useProjectsStore";
import type { Project } from "@/domain";

function mkProject(content: string): Project {
  return {
    id: "p-out",
    name: "Out",
    entry: "main.tex",
    files: {
      "main.tex": { id: "f1", path: "main.tex", name: "main.tex", kind: "tex", content },
    },
    folders: {},
    createdAt: "2026-05-22T12:00:00Z",
  };
}

beforeEach(() => {
  useTabsStore.setState({ openTabs: ["main.tex"], activeTab: "main.tex", edits: {} });
});

describe("<OutlinePanel />", () => {
  it("shows the no-file empty state when no path is active", () => {
    const project = mkProject("");
    useProjectsStore.setState({ active: project, summaries: [], loading: false, error: null });
    render(<OutlinePanel project={project} activePath={null} onJump={() => {}} />);
    expect(screen.getByText(/open a file to see its outline/i)).toBeInTheDocument();
  });

  it("shows the no-sections empty state when the file has no sectioning commands", () => {
    const project = mkProject("Just text. No sections at all.");
    useProjectsStore.setState({ active: project, summaries: [], loading: false, error: null });
    const { container } = render(
      <OutlinePanel project={project} activePath="main.tex" onJump={() => {}} />,
    );
    // The empty-state message wraps "\section" in a <code> tag so the
    // text is split across DOM nodes - assert on the combined text
    // content of the surrounding element.
    expect(container.textContent).toMatch(/no.*\\section.*commands/i);
  });

  it("renders every section as a tree row indented by depth", () => {
    const project = mkProject(
      ["\\chapter{Setup}", "\\section{Goals}", "\\subsection{Notation}"].join("\n"),
    );
    useProjectsStore.setState({ active: project, summaries: [], loading: false, error: null });
    render(<OutlinePanel project={project} activePath="main.tex" onJump={() => {}} />);
    expect(screen.getByText("Setup")).toBeInTheDocument();
    expect(screen.getByText("Goals")).toBeInTheDocument();
    expect(screen.getByText("Notation")).toBeInTheDocument();
    const tree = screen.getByRole("tree");
    const items = tree.querySelectorAll("li[role='treeitem']");
    expect(items[0]?.getAttribute("aria-level")).toBe("2"); // chapter, depth 1 -> level 2
    expect(items[2]?.getAttribute("aria-level")).toBe("4"); // subsection, depth 3 -> level 4
  });

  it("clicking a row calls onJump with the path and line", async () => {
    const user = userEvent.setup();
    const project = mkProject(["", "\\section{Hello}"].join("\n"));
    useProjectsStore.setState({ active: project, summaries: [], loading: false, error: null });
    const onJump = vi.fn();
    render(<OutlinePanel project={project} activePath="main.tex" onJump={onJump} />);
    await user.click(screen.getByText("Hello"));
    expect(onJump).toHaveBeenCalledWith("main.tex", 2);
  });

  it("tracks unsaved edits - newly-added sections appear immediately", () => {
    const project = mkProject("\\section{Original}");
    useProjectsStore.setState({ active: project, summaries: [], loading: false, error: null });
    useTabsStore.setState({
      openTabs: ["main.tex"],
      activeTab: "main.tex",
      edits: { "main.tex": "\\section{Original}\n\\section{Added live}" },
    });
    render(<OutlinePanel project={project} activePath="main.tex" onJump={() => {}} />);
    expect(screen.getByText("Original")).toBeInTheDocument();
    expect(screen.getByText("Added live")).toBeInTheDocument();
  });

  it("renders a starred section with a visible asterisk marker", () => {
    const project = mkProject("\\section*{Unnumbered}");
    useProjectsStore.setState({ active: project, summaries: [], loading: false, error: null });
    const { container } = render(
      <OutlinePanel project={project} activePath="main.tex" onJump={() => {}} />,
    );
    expect(container.querySelector(".od-outline-star")?.textContent).toBe("*");
  });

  it("renders untitled sections with an (untitled) placeholder", () => {
    const project = mkProject("\\section{}");
    useProjectsStore.setState({ active: project, summaries: [], loading: false, error: null });
    render(<OutlinePanel project={project} activePath="main.tex" onJump={() => {}} />);
    expect(screen.getByText("(untitled)")).toBeInTheDocument();
  });
});
