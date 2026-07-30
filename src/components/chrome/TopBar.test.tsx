import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopBar } from "./TopBar";

describe("<TopBar />", () => {
  it("renders just the title without actions", () => {
    render(<TopBar project="My File.tex" />);
    expect(screen.getByText("My File.tex")).toBeInTheDocument();
  });

  it("renders actions when provided", () => {
    render(<TopBar project="My File.tex" right={<button>Save</button>} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
