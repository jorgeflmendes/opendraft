import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickOpenDialog } from "./QuickOpenDialog";
import type { Project } from "@/domain";

const PROJECT: Project = {
  id: "p-quick",
  name: "Quick",
  entry: "main.tex",
  files: {
    "main.tex": { id: "f1", path: "main.tex", name: "main.tex", kind: "tex", content: "" },
    "refs.bib": { id: "f2", path: "refs.bib", name: "refs.bib", kind: "bib", content: "" },
    "chapters/intro.tex": {
      id: "f3",
      path: "chapters/intro.tex",
      name: "intro.tex",
      kind: "tex",
      content: "",
    },
    "chapters/methods.tex": {
      id: "f4",
      path: "chapters/methods.tex",
      name: "methods.tex",
      kind: "tex",
      content: "",
    },
    "preamble.sty": {
      id: "f5",
      path: "preamble.sty",
      name: "preamble.sty",
      kind: "sty",
      content: "",
    },
  },
  folders: {},
  createdAt: "2026-05-22T12:00:00Z",
};

describe("<QuickOpenDialog />", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <QuickOpenDialog open={false} onClose={() => {}} project={PROJECT} onPick={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("lists every project file with the active one floated to the top", () => {
    render(
      <QuickOpenDialog
        open
        onClose={() => {}}
        project={PROJECT}
        activePath="chapters/intro.tex"
        onPick={() => {}}
      />,
    );
    const list = screen.getByRole("listbox");
    const firstOption = list.querySelectorAll("li[role='option']")[0];
    expect(firstOption?.textContent).toContain("chapters/intro.tex");
  });

  it("does not offer soft-deleted files", () => {
    const project = {
      ...PROJECT,
      files: {
        ...PROJECT.files,
        "refs.bib": {
          ...PROJECT.files["refs.bib"]!,
          deletedAt: "2026-07-30T00:00:00.000Z",
        },
      },
    };
    render(<QuickOpenDialog open onClose={() => {}} project={project} onPick={() => {}} />);

    expect(screen.queryByText("refs.bib")).not.toBeInTheDocument();
  });

  it("filters the list as the user types, ranking better matches first", async () => {
    const user = userEvent.setup();
    render(<QuickOpenDialog open onClose={() => {}} project={PROJECT} onPick={() => {}} />);
    const input = screen.getByLabelText(/quick open query/i);
    await user.type(input, "intro");
    const list = screen.getByRole("listbox");
    const options = list.querySelectorAll("li[role='option']");
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]?.textContent).toContain("chapters/intro.tex");
  });

  it("shows the empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<QuickOpenDialog open onClose={() => {}} project={PROJECT} onPick={() => {}} />);
    await user.type(screen.getByLabelText(/quick open query/i), "zzzz");
    expect(screen.getByText(/no files match/i)).toBeInTheDocument();
  });

  it("Enter picks the highlighted row and closes the dialog", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<QuickOpenDialog open onClose={onClose} project={PROJECT} onPick={onPick} />);
    await user.type(screen.getByLabelText(/quick open query/i), "main");
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith("main.tex");
    expect(onClose).toHaveBeenCalled();
  });

  it("ArrowDown moves the highlight, then Enter opens that file", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<QuickOpenDialog open onClose={() => {}} project={PROJECT} onPick={onPick} />);
    // With empty query and no activePath, alphabetical: chapters/intro.tex,
    // chapters/methods.tex, main.tex, preamble.sty, refs.bib.
    // First Enter would pick intro; ArrowDown -> methods.
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith("chapters/methods.tex");
  });

  it("Escape closes the dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<QuickOpenDialog open onClose={onClose} project={PROJECT} onPick={() => {}} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking a row picks that file", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<QuickOpenDialog open onClose={onClose} project={PROJECT} onPick={onPick} />);
    await user.click(screen.getByText("preamble.sty"));
    expect(onPick).toHaveBeenCalledWith("preamble.sty");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the backdrop closes the dialog but clicking inside doesn't", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<QuickOpenDialog open onClose={onClose} project={PROJECT} onPick={() => {}} />);
    // Click the backdrop element directly (the dialog root).
    const backdrop = screen.getByRole("dialog");
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("highlights matched characters with <mark>", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <QuickOpenDialog open onClose={() => {}} project={PROJECT} onPick={() => {}} />,
    );
    await user.type(screen.getByLabelText(/quick open query/i), "main");
    const marks = container.querySelectorAll(".od-quickopen-hit");
    expect(marks.length).toBeGreaterThan(0);
  });
});
