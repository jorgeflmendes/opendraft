import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { I } from "./icons";

describe("icons", () => {
  it("make creates an icon component that renders with default props", () => {
    // Render one of the icons created with `make`
    const { container } = render(<I.folder />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("make passes defaults through to Icon", () => {
    const { container } = render(<I.chevronD />); // info has defaults: { viewBox: "0 0 24 24" }
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders with array paths", () => {
    const { container } = render(<I.folderOpen />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(1);
  });
});
