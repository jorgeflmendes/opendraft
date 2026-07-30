import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./Button";

describe("<Button />", () => {
  it("renders with default props", () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole("button", { name: "Click me" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveClass("od-btn");
    expect(btn).not.toHaveClass("od-btn--primary");
    expect(btn).not.toHaveClass("od-btn--sm");
  });

  it("applies variant and size classes", () => {
    render(
      <Button variant="primary" size="lg">
        Big Primary
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Big Primary" });
    expect(btn).toHaveClass("od-btn--primary");
    expect(btn).toHaveClass("od-btn--lg");
  });

  it("merges custom className", () => {
    render(<Button className="my-custom-class">Custom</Button>);
    const btn = screen.getByRole("button", { name: "Custom" });
    expect(btn).toHaveClass("my-custom-class");
    expect(btn).toHaveClass("od-btn");
  });

  it("renders icons", () => {
    render(
      <Button
        leadingIcon={<span data-testid="lead">L</span>}
        trailingIcon={<span data-testid="trail">T</span>}
      >
        Icon Button
      </Button>,
    );
    expect(screen.getByTestId("lead")).toBeInTheDocument();
    expect(screen.getByTestId("trail")).toBeInTheDocument();
  });

  it("applies soft variant", () => {
    render(<Button variant="soft">Soft Button</Button>);
    const btn = screen.getByRole("button", { name: "Soft Button" });
    expect(btn).toHaveClass("od-btn--soft");
  });

  it("applies ghost variant", () => {
    render(<Button variant="ghost">Ghost Button</Button>);
    const btn = screen.getByRole("button", { name: "Ghost Button" });
    expect(btn).toHaveClass("od-btn--ghost");
  });

  it("applies sm size", () => {
    render(<Button size="sm">Small Button</Button>);
    const btn = screen.getByRole("button", { name: "Small Button" });
    expect(btn).toHaveClass("od-btn--sm");
  });

  it("applies type submit", () => {
    render(<Button type="submit">Submit Button</Button>);
    const btn = screen.getByRole("button", { name: "Submit Button" });
    expect(btn).toHaveAttribute("type", "submit");
  });
});
