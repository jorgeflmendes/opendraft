import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppHeader } from "./AppHeader";

describe("<AppHeader />", () => {
  it("renders just the logo and location when only location is provided", () => {
    render(<AppHeader location="~/" />);
    expect(screen.getByLabelText("Current location")).toHaveTextContent("~/");
    expect(screen.getByText("OpenDraft")).toBeInTheDocument();
  });

  it("renders a BrandHome link when onHome is provided", async () => {
    const user = userEvent.setup();
    const onHome = vi.fn();
    render(<AppHeader location="~/projects" onHome={onHome} />);

    const homeBtn = screen.getByRole("button", { name: /home/i });
    expect(homeBtn).toBeInTheDocument();

    await user.click(homeBtn);
    expect(onHome).toHaveBeenCalledOnce();
  });

  it("renders the title when provided", () => {
    render(<AppHeader location="~/" title="Settings" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Settings");
  });

  it("omits the location when it does not provide useful navigation context", () => {
    render(<AppHeader title="Projects" />);
    expect(screen.queryByLabelText("Current location")).not.toBeInTheDocument();
  });

  it("renders actions when provided", () => {
    render(<AppHeader location="~/" actions={<button>Log Out</button>} />);
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });
});
