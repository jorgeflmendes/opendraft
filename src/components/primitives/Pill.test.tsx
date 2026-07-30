import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Pill } from "./Pill";

describe("<Pill />", () => {
  it("renders with default props", () => {
    render(<Pill>Normal Pill</Pill>);
    const pill = screen.getByText("Normal Pill");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveClass("od-pill");
    expect(pill).not.toHaveClass("od-pill--ok");
  });

  it("applies tone class", () => {
    render(<Pill tone="err">Error Pill</Pill>);
    const pill = screen.getByText("Error Pill");
    expect(pill).toHaveClass("od-pill--err");
  });

  it("merges custom className", () => {
    render(<Pill className="my-pill">Custom</Pill>);
    const pill = screen.getByText("Custom");
    expect(pill).toHaveClass("od-pill");
    expect(pill).toHaveClass("my-pill");
  });

  it("renders a dot when dot is true", () => {
    const { container } = render(<Pill dot>Dotted</Pill>);
    expect(container.querySelector(".dot")).toBeInTheDocument();
  });

  it("renders leading icon", () => {
    render(<Pill leadingIcon={<span data-testid="icon">ICON</span>}>Icon Pill</Pill>);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("applies ok tone", () => {
    render(<Pill tone="ok">OK</Pill>);
    expect(screen.getByText("OK")).toHaveClass("od-pill--ok");
  });

  it("applies coral tone", () => {
    render(<Pill tone="coral">Coral</Pill>);
    expect(screen.getByText("Coral")).toHaveClass("od-pill--coral");
  });

  it("applies warn tone", () => {
    render(<Pill tone="warn">Warn</Pill>);
    expect(screen.getByText("Warn")).toHaveClass("od-pill--warn");
  });

  it("applies info tone", () => {
    render(<Pill tone="info">Info</Pill>);
    expect(screen.getByText("Info")).toHaveClass("od-pill--info");
  });
});
