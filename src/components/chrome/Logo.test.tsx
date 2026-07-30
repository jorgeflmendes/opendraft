import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Logo, BrandHome } from "./Logo";

describe("<Logo />", () => {
  it("renders with name by default", () => {
    render(<Logo />);
    expect(screen.getByText("OpenDraft")).toBeInTheDocument();
  });

  it("can hide the name", () => {
    const { container } = render(<Logo withName={false} />);
    expect(screen.queryByText("OpenDraft")).toBeNull();
    expect(container.querySelector(".od-logo-mark")).toBeInTheDocument();
  });
});

describe("<BrandHome />", () => {
  it("renders as a button that calls onHome when clicked", async () => {
    const user = userEvent.setup();
    const onHome = vi.fn();
    render(<BrandHome onHome={onHome} />);

    const btn = screen.getByRole("button", { name: /home/i });
    expect(btn).toBeInTheDocument();

    await user.click(btn);
    expect(onHome).toHaveBeenCalledOnce();
  });
});
