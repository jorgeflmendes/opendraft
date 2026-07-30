import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewFileForm } from "./NewFileForm";

describe("<NewFileForm />", () => {
  it("starts empty and keeps Create disabled until the path has non-whitespace text", async () => {
    const user = userEvent.setup();
    render(<NewFileForm onCancel={() => {}} onSubmit={() => {}} />);

    const input = screen.getByLabelText(/file path/i);
    expect(input).toHaveFocus();
    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();

    await user.type(input, "   ");
    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();

    await user.type(input, "main.tex");
    expect(screen.getByRole("button", { name: /create/i })).toBeEnabled();
  });

  it("submits a trimmed path with the configured prefix and then clears the input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NewFileForm prefix="chapters/" onCancel={() => {}} onSubmit={onSubmit} />);

    expect(screen.getByText("chapters/")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/file path/i), "  intro.tex  ");
    await user.click(screen.getByRole("button", { name: /create/i }));

    expect(onSubmit).toHaveBeenCalledWith("chapters/intro.tex");
    expect(screen.getByLabelText(/file path/i)).toHaveValue("");
  });

  it("submits on Enter without a prefix", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<NewFileForm onCancel={() => {}} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/file path/i), "notes.tex{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("notes.tex");
  });

  it("cancels from Escape and from the explicit cancel button", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<NewFileForm onCancel={onCancel} onSubmit={() => {}} />);

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /cancel new file/i }));

    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("locks every control and ignores submit while busy", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<NewFileForm busy onCancel={() => {}} onSubmit={onSubmit} />);

    expect(screen.getByLabelText(/file path/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel new file/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does nothing when submitting empty path directly", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<NewFileForm onCancel={() => {}} onSubmit={onSubmit} />);

    // The button is disabled when empty, but we can bypass it by calling form submit directly
    const input = screen.getByLabelText(/file path/i);
    await user.type(input, "{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
