import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { I } from "./icons";

describe("Icons", () => {
  it("renders an icon with default props", () => {
    const { container } = render(<I.file />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", "14");
    expect(svg).toHaveAttribute("height", "14");
    expect(svg).toHaveAttribute("stroke", "currentColor");
  });

  it("accepts custom size and className", () => {
    const { container } = render(<I.file size={24} className="my-icon" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "24");
    expect(svg).toHaveAttribute("height", "24");
    expect(svg).toHaveClass("my-icon");
  });
});
