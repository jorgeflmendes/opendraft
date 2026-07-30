import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DefaultStatus } from "./DefaultStatus";

describe("<DefaultStatus />", () => {
  it("renders with default props", () => {
    render(<DefaultStatus />);
    expect(screen.getByText("main.tex / Ln 1, Col 1")).toBeInTheDocument();
    expect(screen.getByText("XeLaTeX / WASM")).toBeInTheDocument();
    expect(screen.getByText(/1.24s/)).toBeInTheDocument();
  });

  it("handles uncompiled state properly", () => {
    render(<DefaultStatus time="-" />);
    expect(screen.getByText(/Not compiled/)).toBeInTheDocument();
  });
});
