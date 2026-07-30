import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewProjectForm } from "./NewProjectForm";

describe("<NewProjectForm />", () => {
  it("renders an empty input and disables Create until there's text", () => {
    render(<NewProjectForm onCancel={() => {}} onSubmit={() => {}} />);
    expect(screen.getByLabelText(/project name/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
  });

  it("enables Create as soon as a non-whitespace name is typed", async () => {
    const user = userEvent.setup();
    render(<NewProjectForm onCancel={() => {}} onSubmit={() => {}} />);
    await user.type(screen.getByLabelText(/project name/i), "Hello");
    expect(screen.getByRole("button", { name: /create/i })).toBeEnabled();
  });

  it("calls onSubmit with the trimmed name", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NewProjectForm onCancel={() => {}} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/project name/i), "  Padded  ");
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(onSubmit).toHaveBeenCalledWith("Padded");
  });

  it("submits on Enter inside the input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NewProjectForm onCancel={() => {}} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/project name/i), "Quick{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("Quick");
  });

  it("calls onCancel when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<NewProjectForm onCancel={onCancel} onSubmit={() => {}} />);
    await user.type(screen.getByLabelText(/project name/i), "abc");
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });

  it("disables every control while busy", () => {
    render(<NewProjectForm onCancel={() => {}} onSubmit={() => {}} busy />);
    expect(screen.getByLabelText(/project name/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
  });
});
