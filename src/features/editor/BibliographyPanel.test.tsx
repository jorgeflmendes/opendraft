import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BibliographyPanel } from "./BibliographyPanel";
import { useBibStore } from "./useBibStore";
import type { Project } from "@/domain";

function mkProject(bib: string): Project {
  return {
    id: "p-bib-panel",
    name: "P",
    entry: "main.tex",
    files: {
      "refs.bib": {
        id: "f-bib",
        path: "refs.bib",
        name: "refs.bib",
        kind: "bib",
        content: bib,
      },
    },
    folders: {},
    createdAt: "2026-05-22T12:00:00Z",
  };
}

beforeEach(() => useBibStore.getState().reset());

describe("<BibliographyPanel />", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <BibliographyPanel open={false} onClose={() => {}} onInsert={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the empty-state message when no .bib files contributed", () => {
    render(<BibliographyPanel open onClose={() => {}} onInsert={() => {}} />);
    expect(screen.getByText(/no/i).textContent).toMatch(/\.bib/);
  });

  it("renders every entry from the bib store with key + summary", () => {
    useBibStore.getState().rebuild(
      mkProject(`
@article{alpha2020, title={Alpha}, author={Smith, Alice}, year={2020}}
@book{beta2021, title={Beta}, author={Jones, Bob}, year={2021}}
    `),
    );
    render(<BibliographyPanel open onClose={() => {}} onInsert={() => {}} />);
    expect(screen.getByText("alpha2020")).toBeInTheDocument();
    expect(screen.getByText("beta2021")).toBeInTheDocument();
    expect(document.body.textContent).toContain("Alpha");
    expect(document.body.textContent).toContain("Beta");
  });

  it("filters by key, title, or author substring", async () => {
    const user = userEvent.setup();
    useBibStore.getState().rebuild(
      mkProject(`
@article{alpha, title={Alpha}, author={Smith}, year={2020}}
@article{beta, title={Beta paper}, author={Jones}, year={2021}}
    `),
    );
    render(<BibliographyPanel open onClose={() => {}} onInsert={() => {}} />);
    await user.type(screen.getByLabelText(/filter bibliography/i), "beta");
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.queryByText("alpha")).toBeNull();
  });

  it("shows the no-matches message when the filter doesn't match anything", async () => {
    const user = userEvent.setup();
    useBibStore.getState().rebuild(mkProject("@article{x, title={X}}"));
    render(<BibliographyPanel open onClose={() => {}} onInsert={() => {}} />);
    await user.type(screen.getByLabelText(/filter bibliography/i), "zzz");
    expect(screen.getByText(/no entries match/i)).toBeInTheDocument();
  });

  it("calls onInsert with the key on click and closes", async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    const onClose = vi.fn();
    useBibStore.getState().rebuild(mkProject("@article{picked, title={Pick me}}"));
    render(<BibliographyPanel open onClose={onClose} onInsert={onInsert} />);
    await user.click(screen.getByText("picked"));
    expect(onInsert).toHaveBeenCalledWith("picked");
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape closes the panel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    useBibStore.getState().rebuild(mkProject("@article{a, title={A}}"));
    render(<BibliographyPanel open onClose={onClose} onInsert={() => {}} />);
    await user.type(screen.getByLabelText(/filter bibliography/i), "x");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("Enter on a focused row inserts that entry", () => {
    const onInsert = vi.fn();
    useBibStore.getState().rebuild(mkProject("@article{kbd, title={Keyboard-picked}}"));
    render(<BibliographyPanel open onClose={() => {}} onInsert={onInsert} />);
    const row = screen.getByLabelText(/insert \\cite\{kbd\}/i);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onInsert).toHaveBeenCalledWith("kbd");
  });
});
