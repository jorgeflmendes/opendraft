import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTabsStore } from "@/features/editor";
import { useProjectsStore } from "@/features/projects";
import { usePreferences } from "@/store/preferences";
import { useScreen } from "@/store/screen";
import { LandingScreen } from "./Landing";

describe("LandingScreen", () => {
  beforeEach(() => {
    usePreferences.setState({ theme: "light", density: "comfortable" });
    useScreen.setState({ current: "landing" });
    useProjectsStore.setState({ active: null, summaries: [], loading: false, error: null });
    useTabsStore.setState({ openTabs: [], activeTab: null });
  });

  it("renders the hero copy", () => {
    render(<LandingScreen />);
    expect(
      screen.getByRole("heading", { name: /Your research, from first line to final PDF/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/runs the TeX toolchain in your browser/i)).toBeInTheDocument();
  });

  it("primary CTA navigates to the projects picker", async () => {
    const user = userEvent.setup();
    render(<LandingScreen />);
    await user.click(screen.getByRole("button", { name: /open project workspace/i }));
    expect(useScreen.getState().current).toBe("projects");
    expect(useProjectsStore.getState().active).toBeNull();
  });

  it("header projects action navigates to the projects picker", async () => {
    const user = userEvent.setup();
    render(<LandingScreen />);
    await user.click(screen.getByRole("button", { name: "Projects" }));
    expect(useScreen.getState().current).toBe("projects");
  });

  it("theme toggle updates the preferences store", async () => {
    const user = userEvent.setup();
    render(<LandingScreen />);
    await user.click(screen.getByRole("button", { name: /switch to dark theme/i }));
    expect(usePreferences.getState().theme).toBe("dark");
  });

  it("renders the local compilation guarantees", () => {
    render(<LandingScreen />);
    expect(screen.getByText(/no account gate/i)).toBeInTheDocument();
    expect(screen.getByText(/local project storage/i)).toBeInTheDocument();
  });

  it("renders the compilation workflow", () => {
    render(<LandingScreen />);
    for (const label of ["Structured source", "Real compilation", "Precise review"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(/private by architecture/i)).toBeInTheDocument();
  });

  it("identifies the local TeX runtime", () => {
    render(<LandingScreen />);
    expect(screen.getByText(/Browser TeX runtime/i)).toBeInTheDocument();
  });

  it("shows a meaningful source-to-output example", () => {
    render(<LandingScreen />);
    expect(screen.getByText("main.tex")).toBeInTheDocument();
    expect(screen.getByText("Compiled PDF")).toBeInTheDocument();
    expect(screen.getByText(/Theorem 1 \(Stokes\)/i)).toBeInTheDocument();
  });
});
