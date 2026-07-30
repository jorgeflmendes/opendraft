import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBar } from "./StatusBar";

describe("<StatusBar />", () => {
  it("renders items separated by dots", () => {
    render(<StatusBar items={["Item 1", "Item 2", "Item 3"]} />);
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();

    const dots = screen.getAllByText("·");
    expect(dots).toHaveLength(2);
  });

  it("handles a single item without separators", () => {
    render(<StatusBar items={["Just one"]} />);
    expect(screen.getByText("Just one")).toBeInTheDocument();
    expect(screen.queryByText("·")).toBeNull();
  });
});
