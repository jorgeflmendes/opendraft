import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocalChip } from "./LocalChip";

describe("<LocalChip />", () => {
  it("renders with default props", () => {
    render(<LocalChip />);
    expect(screen.getByText("Compiled locally")).toBeInTheDocument();
    expect(screen.getByText("/ 1.24s")).toBeInTheDocument();
  });

  it("renders with custom props", () => {
    render(<LocalChip ms="0.5s" label="Quick compile" />);
    expect(screen.getByText("Quick compile")).toBeInTheDocument();
    expect(screen.getByText("/ 0.5s")).toBeInTheDocument();
  });
});
