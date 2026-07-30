import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectsScreen } from "./Projects";
import { useScreen } from "@/store/screen";
import { usePreferences } from "@/store/preferences";
import { useProjectsStore } from "@/features/projects";
import { useTabsStore } from "@/features/editor";

describe("ProjectsScreen", () => {
  beforeEach(() => {
    usePreferences.setState({ theme: "light", density: "comfortable" });
    useScreen.setState({ current: "projects", projectId: null });
    useProjectsStore.setState({ summaries: [], active: null, loading: false, error: null });
    useTabsStore.setState({ openTabs: [], activeTab: null });
  });

  it("renders the picker headline and lists projects", async () => {
    render(<ProjectsScreen />);
    expect(screen.getByRole("heading", { name: /open a project/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Stokes Notes")).toBeInTheDocument();
    });
  });

  it("renders the real template rail without the removed fake recent-files panel", async () => {
    render(<ProjectsScreen />);
    await screen.findByText("Stokes Notes");
    expect(screen.getByText(/start fresh/i)).toBeInTheDocument();
    expect(screen.queryByText(/continue where you left off/i)).toBeNull();
  });

  it("template rows are clickable and route to the editor with a seeded project", async () => {
    const user = userEvent.setup();
    render(<ProjectsScreen />);
    const amsart = await screen.findByRole("button", { name: /start a new ams article/i });
    expect(amsart).not.toBeDisabled();
    await user.click(amsart);
    await waitFor(() => {
      expect(useScreen.getState().current).toBe("editor");
    });
    const active = useProjectsStore.getState().active;
    expect(active?.files["main.tex"]?.content).toMatch(/\\documentclass\[[^\]]*\]\{amsart\}/);
  });

  it("OpenDraft brand returns to the landing screen", async () => {
    const user = userEvent.setup();
    render(<ProjectsScreen />);
    await user.click(screen.getByRole("button", { name: /go to opendraft home/i }));
    expect(useScreen.getState().current).toBe("landing");
  });

  it("clicking a project loads it and navigates to the editor", async () => {
    const user = userEvent.setup();
    render(<ProjectsScreen />);
    await waitFor(() => {
      expect(screen.getByText("Stokes Notes")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Stokes Notes"));
    await waitFor(() => {
      expect(useProjectsStore.getState().active?.id).toBe("p-stokes-notes-v3");
    });
    expect(useScreen.getState().current).toBe("editor");
  });

  it("theme toggle works from the projects screen", async () => {
    const user = userEvent.setup();
    render(<ProjectsScreen />);
    await user.click(screen.getByRole("button", { name: /switch to dark theme/i }));
    expect(usePreferences.getState().theme).toBe("dark");
  });
});
