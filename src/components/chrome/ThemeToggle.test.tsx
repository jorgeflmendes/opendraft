import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";
import { usePreferences } from "@/store/preferences";

describe("<ThemeToggle />", () => {
  beforeEach(() => {
    usePreferences.setState({ theme: "light" });
  });

  it("renders correctly", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: /switch to dark theme/i })).toBeInTheDocument();
  });

  it("toggles theme when clicked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button"));

    expect(usePreferences.getState().theme).toBe("dark");

    await user.click(screen.getByRole("button"));
    expect(usePreferences.getState().theme).toBe("light");
  });
});
