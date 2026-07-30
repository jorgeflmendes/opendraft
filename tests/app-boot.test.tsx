import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import App from "@/App";
import { usePreferences } from "@/store/preferences";
import { useScreen } from "@/store/screen";
import { useProjectsStore } from "@/features/projects";
import { useTabsStore } from "@/features/editor";

describe("App boot - integration", () => {
  beforeEach(() => {
    window.location.hash = "#/";
    usePreferences.setState({ theme: "light", density: "comfortable" });
    useScreen.setState({ current: "landing", projectId: null });
    useProjectsStore.setState({ active: null, summaries: [], loading: false, error: null });
    useTabsStore.setState({ openTabs: [], activeTab: null });
  });

  it("boots into the landing screen", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /LaTeX, compiled where you write/i }),
    ).toBeInTheDocument();
  });

  it("landing -> projects -> editor flow opens the right project", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /browse projects/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /open a project/i })).toBeInTheDocument();
    });
    await user.click(await screen.findByText("Thesis 2025"));
    // Editor is unique to the editor screen - proves navigation.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /compile project/i })).toBeInTheDocument();
    });
    expect(useProjectsStore.getState().active?.id).toBe("p-thesis-2025-v2");
    expect(useTabsStore.getState().activeTab).toBe("main.tex");
  });

  it("editor back-button returns to projects and clears active project", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /browse projects/i }));
    await user.click(await screen.findByText("Stokes Notes"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /compile project/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /back to projects/i }));
    expect(useScreen.getState().current).toBe("projects");
    expect(useProjectsStore.getState().active).toBeNull();
  });

  it("mirrors theme onto <html data-theme>", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    await user.click(screen.getByRole("button", { name: /switch to dark theme/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("mirrors density onto <html data-density>", () => {
    render(<App />);
    expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
    act(() => {
      usePreferences.setState({ density: "compact" });
    });
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
  });

  it("navigates from the landing screen into a local project", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(useProjectsStore.getState().active).toBeNull();

    await user.click(screen.getByRole("button", { name: /browse projects/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /open a project/i })).toBeInTheDocument();
    });
    await user.click(await screen.findByText("Stokes Notes"));
    await waitFor(() => {
      expect(useProjectsStore.getState().active?.id).toBe("p-stokes-notes-v3");
    });
    expect(screen.getByRole("button", { name: /compile project/i })).toBeEnabled();
  });

  it("restores an editor project from its refresh-safe URL", async () => {
    window.location.hash = "#/editor/p-stokes-notes-v3";
    useScreen.getState().syncFromLocation();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /compile project/i })).toBeInTheDocument();
    });
    expect(useProjectsStore.getState().active?.id).toBe("p-stokes-notes-v3");
  });
});
