import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectPicker } from "./ProjectPicker";
import { filterSummaries, mostRecent } from "./picker-helpers";
import { useProjectsStore } from "./useProjectsStore";
import { useTabsStore } from "@/features/editor";
import type { ProjectSummary } from "@/domain";

const SUMMARIES: ProjectSummary[] = [
  {
    id: "p-a",
    name: "Alpha",
    description: "First",
    texFileCount: 1,
    fileCount: 1,
    lastOpenedAt: "2026-05-22T10:00:00Z",
  },
  {
    id: "p-b",
    name: "Beta",
    description: "Second",
    texFileCount: 2,
    fileCount: 2,
    lastOpenedAt: "2026-05-21T10:00:00Z",
  },
];

describe("filterSummaries", () => {
  it("returns everything when the query is blank", () => {
    expect(filterSummaries(SUMMARIES, "")).toHaveLength(2);
    expect(filterSummaries(SUMMARIES, "   ")).toHaveLength(2);
  });

  it("matches case-insensitively on name", () => {
    expect(filterSummaries(SUMMARIES, "alpha")).toHaveLength(1);
    expect(filterSummaries(SUMMARIES, "ALPHA")).toHaveLength(1);
  });

  it("also matches on description", () => {
    expect(filterSummaries(SUMMARIES, "second")).toHaveLength(1);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterSummaries(SUMMARIES, "ghost")).toEqual([]);
  });

  it("does not mutate the input", () => {
    const before = SUMMARIES.map((s) => s.id);
    filterSummaries(SUMMARIES, "alpha");
    expect(SUMMARIES.map((s) => s.id)).toEqual(before);
  });
});

describe("mostRecent", () => {
  it("returns null for an empty list", () => {
    expect(mostRecent([])).toBeNull();
  });

  it("picks the highest lastOpenedAt", () => {
    expect(mostRecent(SUMMARIES)?.id).toBe("p-a");
  });
});

describe("<ProjectPicker />", () => {
  beforeEach(() => {
    useProjectsStore.setState({
      summaries: [],
      active: null,
      loading: false,
      error: null,
    });
    useTabsStore.setState({ openTabs: [], activeTab: null });
  });

  it("loads summaries on mount and renders them as rows", async () => {
    render(<ProjectPicker onOpened={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Stokes Notes")).toBeInTheDocument();
    });
    expect(screen.getByText("Thesis 2025")).toBeInTheDocument();
  });

  it("does not announce zero projects while the initial list is loading", () => {
    useProjectsStore.setState({ loading: true });
    const { container } = render(<ProjectPicker onOpened={() => {}} />);

    expect(container.querySelector(".od-project-count")).toHaveTextContent("Loading projects...");
    expect(container.querySelector(".od-project-count")).not.toHaveTextContent(
      "0 available projects",
    );
  });

  it("filters by search query", async () => {
    const user = userEvent.setup();
    render(<ProjectPicker onOpened={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Stokes Notes")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/search projects/i), "thesis");
    expect(screen.queryByText("Stokes Notes")).toBeNull();
    expect(screen.getByText("Thesis 2025")).toBeInTheDocument();
  });

  it("shows an empty-results panel when nothing matches", async () => {
    const user = userEvent.setup();
    render(<ProjectPicker onOpened={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Stokes Notes")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/search projects/i), "zzzzzzz");
    expect(screen.getByText(/No projects match/i)).toBeInTheDocument();
  });

  it("clears an active search without requiring text selection", async () => {
    const user = userEvent.setup();
    render(<ProjectPicker onOpened={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Stokes Notes")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/search projects/i), "thesis");
    expect(screen.queryByText("Stokes Notes")).toBeNull();

    await user.click(screen.getByRole("button", { name: /clear project search/i }));
    expect(screen.getByText("Stokes Notes")).toBeInTheDocument();
    expect(screen.getByLabelText(/search projects/i)).toHaveValue("");
  });

  it("clicking a row opens the project and calls onOpened with its id", async () => {
    const user = userEvent.setup();
    const onOpened = vi.fn();
    render(<ProjectPicker onOpened={onOpened} />);
    await waitFor(() => {
      expect(screen.getByText("Stokes Notes")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Thesis 2025"));
    await waitFor(() => {
      expect(useProjectsStore.getState().active?.id).toBe("p-thesis-2025-v2");
    });
    expect(onOpened).toHaveBeenCalledWith("p-thesis-2025-v2");
  });

  it("New project button reveals the inline form", async () => {
    const user = userEvent.setup();
    render(<ProjectPicker onOpened={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Stokes Notes")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^new project$/i }));
    expect(screen.getByLabelText(/^project name$/i)).toBeInTheDocument();
  });

  it("creating a project navigates to it via onOpened", async () => {
    const user = userEvent.setup();
    const onOpened = vi.fn();
    render(<ProjectPicker onOpened={onOpened} />);
    await waitFor(() => {
      expect(screen.getByText("Stokes Notes")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^new project$/i }));
    await user.type(screen.getByLabelText(/^project name$/i), "Created from picker");
    await user.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => {
      expect(onOpened).toHaveBeenCalled();
    });
    const id = onOpened.mock.calls[0]?.[0] as string;
    expect(id).toMatch(/^p-local-/);
  });

  it("deleting a project removes it from the list (two-click confirm)", async () => {
    const user = userEvent.setup();
    const onOpened = vi.fn();
    render(<ProjectPicker onOpened={onOpened} />);
    // Create a project so we have a known row to delete (fixtures
    // can be deleted too, but they reappear because they're seeds -
    // we want a stronger assertion here).
    await waitFor(() => {
      expect(screen.getByText("Stokes Notes")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^new project$/i }));
    await user.type(screen.getByLabelText(/^project name$/i), "Will be deleted");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(onOpened).toHaveBeenCalledOnce());
    const id = onOpened.mock.calls[0]?.[0] as string;
    const row = await screen.findByTestId(`project-row-${id}`);
    await user.click(within(row).getByRole("button", { name: /more actions/i }));
    const deleteButton = screen.getByRole("menuitem", { name: /^delete project$/i });
    await user.click(deleteButton);
    await user.click(
      screen.getByRole("menuitem", { name: /delete will be deleted\? click to confirm/i }),
    );

    await waitFor(() => expect(screen.queryByTestId(`project-row-${id}`)).toBeNull());
  });

  it("does not offer a non-functional delete action for built-in examples", async () => {
    render(<ProjectPicker onOpened={() => {}} />);
    const row = await screen.findByTestId("project-row-p-stokes-notes-v3");

    expect(within(row).queryByRole("button", { name: /more actions/i })).toBeNull();
  });

  it("opens a local LaTeX folder through the browser filesystem bridge", async () => {
    const onOpened = vi.fn();
    const directory = {
      kind: "directory",
      name: "Local paper",
      async *entries() {
        yield [
          "main.tex",
          {
            kind: "file",
            name: "main.tex",
            getFile: async () => {
              const bytes = new TextEncoder().encode("\\documentclass{article}");
              return {
                name: "main.tex",
                size: bytes.byteLength,
                text: async () => new TextDecoder().decode(bytes),
                arrayBuffer: async () => bytes.buffer,
              } as File;
            },
          },
        ];
      },
    } as FileSystemDirectoryHandle;
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: vi.fn(async () => directory),
    });

    try {
      const user = userEvent.setup();
      render(<ProjectPicker onOpened={onOpened} />);
      await user.click(screen.getByRole("button", { name: /open folder/i }));

      await waitFor(() => expect(onOpened).toHaveBeenCalledOnce());
      expect(useProjectsStore.getState().active?.name).toBe("Local paper");
      expect(useProjectsStore.getState().active?.entry).toBe("main.tex");
    } finally {
      Reflect.deleteProperty(window, "showDirectoryPicker");
    }
  });
});
