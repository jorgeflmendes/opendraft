import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LogEntry } from "@/domain";
import { CompileLog } from "./CompileLog";

const errorEntry: LogEntry = {
  level: "error",
  message: "Unclosed environment \\begin{equation}",
  filePath: "main.tex",
  line: 14,
  column: 1,
};
const warnEntry: LogEntry = {
  level: "warn",
  message: "TODO: refine",
  filePath: "chapters/intro.tex",
  line: 7,
};
const infoEntry: LogEntry = { level: "info", message: "Compiled in 1.24s" };

describe("<CompileLog />", () => {
  it("renders nothing when there are no errors or warnings", () => {
    const { container } = render(<CompileLog entries={[infoEntry]} onJump={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one row per non-info entry", () => {
    render(<CompileLog entries={[errorEntry, warnEntry, infoEntry]} onJump={() => {}} />);
    expect(screen.getByText(/Unclosed environment/)).toBeInTheDocument();
    expect(screen.getByText(/TODO: refine/)).toBeInTheDocument();
    expect(screen.queryByText(/Compiled in/)).toBeNull();
  });

  it("shows the issue count in the header", () => {
    render(<CompileLog entries={[errorEntry, warnEntry]} onJump={() => {}} />);
    expect(screen.getByText(/2 issues/i)).toBeInTheDocument();
  });

  it("lets the user hide and show compile issues", async () => {
    const user = userEvent.setup();
    render(<CompileLog entries={[errorEntry, warnEntry]} onJump={() => {}} />);
    const toggle = screen.getByRole("button", { name: /2 issues/i });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/TODO: refine/)).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/TODO: refine/)).toBeInTheDocument();
  });

  it("collapses repeated diagnostics emitted by multiple TeX passes", () => {
    render(<CompileLog entries={[warnEntry, { ...warnEntry }]} onJump={() => {}} />);
    expect(screen.getByText(/1 issue/i)).toBeInTheDocument();
    expect(screen.getAllByText(/TODO: refine/)).toHaveLength(1);
  });

  it("calls onJump with path / line / column when a row is clicked", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    render(<CompileLog entries={[errorEntry]} onJump={onJump} />);
    await user.click(screen.getByText(/Unclosed environment/));
    expect(onJump).toHaveBeenCalledWith("main.tex", 14, 1);
  });

  it("forwards undefined column when not present on the entry", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    render(<CompileLog entries={[warnEntry]} onJump={onJump} />);
    await user.click(screen.getByText(/TODO: refine/));
    expect(onJump).toHaveBeenCalledWith("chapters/intro.tex", 7, undefined);
  });

  it("disables rows without a source location (engine messages)", () => {
    const unlocated: LogEntry = { level: "error", message: "Engine offline" };
    render(<CompileLog entries={[unlocated]} onJump={() => {}} />);
    const row = screen.getByText(/Engine offline/).closest("button");
    expect(row).toBeDisabled();
  });
});
