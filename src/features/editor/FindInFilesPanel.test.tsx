import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...actual,
    useDeferredValue: (val: unknown) => val,
  };
});

import { FindInFilesPanel } from "./FindInFilesPanel";
import { useTabsStore } from "./useTabsStore";
import { useProjectsStore } from "@/features/projects/useProjectsStore";
import type { Project } from "@/domain";

function project(): Project {
  return {
    id: "p1",
    name: "Test Project",
    entry: "main.tex",
    createdAt: "2026-05-23T00:00:00.000Z",
    folders: {},
    files: {
      "main.tex": {
        id: "main.tex",
        path: "main.tex",
        kind: "tex",
        name: "main.tex",
        content: "\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}",
      },
      "notes.txt": {
        id: "notes.txt",
        path: "notes.txt",
        kind: "txt",
        name: "notes.txt",
        content: "Some notes about the World\nAnd more.",
      },
    },
  };
}

describe("<FindInFilesPanel />", () => {
  beforeEach(() => {
    useTabsStore.setState({ edits: {} });
    useProjectsStore.setState({ saveActive: vi.fn().mockResolvedValue(undefined) });
  });

  it("renders null if not open", () => {
    const { container } = render(
      <FindInFilesPanel open={false} onClose={vi.fn()} project={project()} onJump={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders with no results initially when open", () => {
    render(<FindInFilesPanel open={true} onClose={vi.fn()} project={project()} onJump={vi.fn()} />);
    expect(screen.getByPlaceholderText("Search across all files...")).toBeInTheDocument();
    expect(screen.getByText("Type to search every text file in the project.")).toBeInTheDocument();
  });

  it("can perform a basic search and click a result", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const onClose = vi.fn();
    render(<FindInFilesPanel open={true} onClose={onClose} project={project()} onJump={onJump} />);

    const input = screen.getByPlaceholderText("Search across all files...");
    await user.type(input, "World");

    await waitFor(() => {
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("2 matches in 2 files");
    });

    expect(screen.getByText("main.tex")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();

    // Click the first hit in main.tex
    const hits = screen
      .getAllByRole("button")
      .filter((el) => el.classList.contains("od-findinfiles-hit"));
    await user.click(hits[0]!);

    expect(onJump).toHaveBeenCalledWith("main.tex", 3);
    expect(onClose).toHaveBeenCalled();
  });

  it("handles keyboard navigation (Enter) to jump to result", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const onClose = vi.fn();
    render(<FindInFilesPanel open={true} onClose={onClose} project={project()} onJump={onJump} />);

    const input = screen.getByPlaceholderText("Search across all files...");
    await user.type(input, "World");

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").filter((el) => el.classList.contains("od-findinfiles-hit"))
          .length,
      ).toBeGreaterThan(0);
    });

    const hits = screen
      .getAllByRole("button")
      .filter((el) => el.classList.contains("od-findinfiles-hit"));
    hits[0]!.focus();
    await user.keyboard("{Enter}");

    expect(onJump).toHaveBeenCalledWith("main.tex", 3);
    expect(onClose).toHaveBeenCalled();
  });

  it("handles keyboard navigation (Space) to jump to result", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const onClose = vi.fn();
    render(<FindInFilesPanel open={true} onClose={onClose} project={project()} onJump={onJump} />);

    const input = screen.getByPlaceholderText("Search across all files...");
    await user.type(input, "World");

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").filter((el) => el.classList.contains("od-findinfiles-hit"))
          .length,
      ).toBeGreaterThan(0);
    });

    const hits = screen
      .getAllByRole("button")
      .filter((el) => el.classList.contains("od-findinfiles-hit"));
    hits[0]!.focus();
    await user.keyboard(" ");

    expect(onJump).toHaveBeenCalledWith("main.tex", 3);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when Escape is pressed on the window", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<FindInFilesPanel open={true} onClose={onClose} project={project()} onJump={vi.fn()} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when Escape is pressed inside input", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<FindInFilesPanel open={true} onClose={onClose} project={project()} onJump={vi.fn()} />);

    const input = screen.getByPlaceholderText("Search across all files...");
    input.focus();
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("closes when clicking on the backdrop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<FindInFilesPanel open={true} onClose={onClose} project={project()} onJump={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    await user.click(dialog);

    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the panel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<FindInFilesPanel open={true} onClose={onClose} project={project()} onJump={vi.fn()} />);

    const input = screen.getByPlaceholderText("Search across all files...");
    await user.click(input);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("can toggle match case and regex mode", async () => {
    const user = userEvent.setup();
    render(<FindInFilesPanel open={true} onClose={vi.fn()} project={project()} onJump={vi.fn()} />);

    const input = screen.getByPlaceholderText("Search across all files...");
    await user.type(input, "world");

    // initially case insensitive, so "World" should match "world"
    await waitFor(() => {
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("2 matches in 2 files");
    });

    // Toggle match case
    const caseInput = screen.getByLabelText("Match case");
    await user.click(caseInput);

    await waitFor(() => {
      expect(screen.getByText(/No matches/)).toBeInTheDocument();
    });

    // Toggle regex
    const regexInput = screen.getByLabelText("Regex");
    await user.click(regexInput);

    await user.clear(input);
    await user.type(input, "W.*d");

    await waitFor(() => {
      // 2 matches since case sensitive now and W.*d matches World in both files
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("2 matches in 2 files");
    });
  });

  it("toggles the replace view and replaces all", async () => {
    const user = userEvent.setup();
    const saveActive = vi.fn().mockResolvedValue(undefined);
    useProjectsStore.setState({ saveActive });

    render(<FindInFilesPanel open={true} onClose={vi.fn()} project={project()} onJump={vi.fn()} />);

    const toggleBtn = screen.getByLabelText("Toggle replace mode");
    await user.click(toggleBtn);

    const replaceInput = screen.getByPlaceholderText("Replace with...");
    expect(replaceInput).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Search across all files...");
    await user.type(input, "World");

    await user.type(replaceInput, "Universe");

    const replaceAllBtn = screen.getByRole("button", { name: /Replace All/i });
    await user.click(replaceAllBtn);

    expect(saveActive).toHaveBeenCalledOnce();
    expect(saveActive).toHaveBeenCalledWith(["main.tex", "notes.txt"], {
      "main.tex": expect.stringContaining("Hello Universe"),
      "notes.txt": expect.stringContaining("Some notes about the Universe"),
    });

    const { edits } = useTabsStore.getState();
    expect(edits["main.tex"]).toContain("Hello Universe");
    expect(edits["notes.txt"]).toContain("Some notes about the Universe");
  });

  it("does not replace if replace in file results in the same content", async () => {
    const user = userEvent.setup();
    const saveActive = vi.fn().mockResolvedValue(undefined);
    useProjectsStore.setState({ saveActive });

    render(<FindInFilesPanel open={true} onClose={vi.fn()} project={project()} onJump={vi.fn()} />);

    const toggleBtn = screen.getByLabelText("Toggle replace mode");
    await user.click(toggleBtn);

    const replaceInput = screen.getByPlaceholderText("Replace with...");
    expect(replaceInput).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Search across all files...");
    await user.type(input, "World");

    await user.type(replaceInput, "World");

    const replaceAllBtn = screen.getByRole("button", { name: /Replace All/i });
    await user.click(replaceAllBtn);

    // Save should not be called because content is identical
    expect(saveActive).not.toHaveBeenCalled();
  });

  it("handles replace via Cmd+Enter on replace input", async () => {
    const user = userEvent.setup();
    const saveActive = vi.fn().mockResolvedValue(undefined);
    useProjectsStore.setState({ saveActive });

    render(<FindInFilesPanel open={true} onClose={vi.fn()} project={project()} onJump={vi.fn()} />);

    await user.click(screen.getByLabelText("Toggle replace mode"));

    const replaceInput = screen.getByPlaceholderText("Replace with...");

    const input = screen.getByPlaceholderText("Search across all files...");
    await user.type(input, "World");
    await user.type(replaceInput, "Universe");

    replaceInput.focus();
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(saveActive).toHaveBeenCalledOnce();
  });

  it("closes when pressing Escape on the replace input", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<FindInFilesPanel open={true} onClose={onClose} project={project()} onJump={vi.fn()} />);

    await user.click(screen.getByLabelText("Toggle replace mode"));
    const replaceInput = screen.getByPlaceholderText("Replace with...");
    replaceInput.focus();
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("handles replace with Enter without ctrlKey (does not replace)", async () => {
    const user = userEvent.setup();
    const saveActive = vi.fn().mockResolvedValue(undefined);
    useProjectsStore.setState({ saveActive });

    render(<FindInFilesPanel open={true} onClose={vi.fn()} project={project()} onJump={vi.fn()} />);

    await user.click(screen.getByLabelText("Toggle replace mode"));

    const replaceInput = screen.getByPlaceholderText("Replace with...");

    const input = screen.getByPlaceholderText("Search across all files...");
    await user.type(input, "World");
    await user.type(replaceInput, "Universe");

    replaceInput.focus();
    await user.keyboard("{Enter}");

    expect(saveActive).not.toHaveBeenCalled();
  });
});
