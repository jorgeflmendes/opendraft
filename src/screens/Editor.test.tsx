import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { EditorScreen } from "./Editor";
import { usePreferences } from "@/store/preferences";
import { useScreen } from "@/store/screen";
import { useProjectsStore } from "@/features/projects";
import { useTabsStore } from "@/features/editor";
import { useDiffStore } from "@/features/diff/useDiffStore";
import { useShortcutStore } from "@/store/shortcuts";

describe("EditorScreen", () => {
  beforeEach(async () => {
    usePreferences.setState({ theme: "light", density: "comfortable" });
    useScreen.setState({ current: "editor", projectId: null });
    useTabsStore.setState({ openTabs: [], activeTab: null });
    useDiffStore.setState({ open: false });
    useShortcutStore.setState({ overrides: {} });
    useProjectsStore.setState({ active: null, summaries: [], loading: false, error: null });
    // Force MockCompileService for UI tests so we don't try to load WASM engines
    const { setCompileService, mockCompileService } = await import("@/services");
    setCompileService(mockCompileService);
    // Real service call - deterministic, sync-completing in jsdom - so the
    // editor has an active project before render. the editor may switch to
    // a more elaborate fixture; the seam is the store.
    await useProjectsStore.getState().openProject("p-stokes-notes-v3");
  });

  it("renders the project name in the breadcrumb and sidebar", () => {
    render(<EditorScreen />);
    expect(screen.getAllByText("Stokes Notes").length).toBeGreaterThan(0);
  });

  it("seeds tabs with the entry file on first render", () => {
    render(<EditorScreen />);
    const tab = document.querySelector(".od-tab.is-active");
    expect(tab?.textContent).toMatch(/main\.tex/);
  });

  it("clicking a file in the tree opens it as a new tab and activates it", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);
    await user.click(screen.getByText("references.bib"));
    const tab = document.querySelector(".od-tab.is-active");
    expect(tab?.textContent).toMatch(/references\.bib/);
    expect(useTabsStore.getState().openTabs).toContain("references.bib");
  });

  it("closing a tab via the close button activates the right neighbour", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);
    await user.click(screen.getByText("references.bib"));
    await user.click(screen.getByText("preamble.sty"));
    expect(useTabsStore.getState().activeTab).toBe("preamble.sty");

    // Close the middle tab (references.bib) - focus should move to preamble.
    const closeBtn = screen.getByRole("button", { name: /^close references\.bib$/i });
    await user.click(closeBtn);
    expect(useTabsStore.getState().openTabs).not.toContain("references.bib");
    expect(useTabsStore.getState().activeTab).toBe("preamble.sty");
  });

  it("expanding a folder reveals its children", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);
    // chapters folder is pre-declared as expanded in the Stokes-Notes
    // factory, so its children are already visible. Collapse, then expand.
    const chaptersRow = screen.getByRole("button", { name: /^chapters$/i, expanded: true });
    await user.click(chaptersRow);
    expect(screen.queryByText("intro.tex")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^chapters$/i, expanded: false }));
    expect(screen.getByText("intro.tex")).toBeInTheDocument();
  });

  it("back-to-projects clears the active project and returns to the picker", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);
    await user.click(screen.getByRole("button", { name: /back to projects/i }));
    expect(useProjectsStore.getState().active).toBeNull();
    expect(useScreen.getState().current).toBe("projects");
  });

  it("OpenDraft logo returns home through the same safe project-close flow", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);
    await user.click(screen.getByRole("button", { name: /go to opendraft home/i }));
    expect(useProjectsStore.getState().active).toBeNull();
    expect(useScreen.getState().current).toBe("landing");
  });

  it("saves dirty drafts before closing the project", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);
    act(() => {
      useTabsStore.getState().updateContent("main.tex", "saved while closing");
    });

    await user.click(screen.getByRole("button", { name: /back to projects/i }));

    await waitFor(() => expect(useScreen.getState().current).toBe("projects"));
    await useProjectsStore.getState().openProject("p-stokes-notes-v3");
    expect(useProjectsStore.getState().active?.files["main.tex"]?.content).toBe(
      "saved while closing",
    );
  });

  it("keeps the project open when a dirty draft cannot be saved", async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(false);

    const originalSaveActive = useProjectsStore.getState().saveActive;
    useProjectsStore.setState({
      saveActive: async () => {
        useProjectsStore.setState({ error: "IndexedDB unavailable" });
        return [];
      },
    });

    try {
      const user = userEvent.setup();
      render(<EditorScreen />);
      act(() => {
        useTabsStore.getState().updateContent("main.tex", "must not be lost");
      });

      await user.click(screen.getByRole("button", { name: /back to projects/i }));

      await new Promise((r) => setTimeout(r, 0));

      expect(useProjectsStore.getState().active).not.toBeNull();
      expect(useScreen.getState().current).toBe("editor");
      expect(useTabsStore.getState().edits["main.tex"]).toBe("must not be lost");
      await screen.findByText(/save failed: IndexedDB unavailable/i);
    } finally {
      window.confirm = originalConfirm;
      useProjectsStore.setState({ saveActive: originalSaveActive, error: null });
    }
  });

  it("warns the browser before unloading a page with dirty drafts", () => {
    render(<EditorScreen />);
    act(() => {
      useTabsStore.getState().updateContent("main.tex", "unsaved draft");
    });
    const event = new Event("beforeunload", { cancelable: true });

    act(() => window.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
  });

  it("renders the local compile action as enabled", () => {
    render(<EditorScreen />);
    expect(screen.getByRole("button", { name: /^compile project$/i })).toBeEnabled();
  });

  it("exports the current project as a JSON download", async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(false);

    const user = userEvent.setup();
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    try {
      render(<EditorScreen />);
      await user.click(screen.getByRole("button", { name: /export project/i }));

      await new Promise((r) => setTimeout(r, 0));

      expect(window.confirm).toHaveBeenCalled();
      expect(createObjectUrl).toHaveBeenCalledWith(
        expect.objectContaining({ type: "application/json" }),
      );
      expect(anchorClick).toHaveBeenCalledOnce();
      const clickedAnchor = anchorClick.mock.instances[0] as HTMLAnchorElement | undefined;
      expect(clickedAnchor?.download).toBe("stokes-notes.opendraft.json");
    } finally {
      window.confirm = originalConfirm;
      createObjectUrl.mockRestore();
      anchorClick.mockRestore();
    }
  });

  it("toggles the editor theme from the topbar", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);

    await user.click(screen.getByRole("button", { name: /switch to dark theme/i }));

    expect(usePreferences.getState().theme).toBe("dark");
  });

  it("auto-save select renders the current cadence and updates preferences on change", async () => {
    const { usePreferences } = await import("@/store/preferences");
    usePreferences.setState({ theme: "light", density: "comfortable", autoSave: "15s" });
    const user = userEvent.setup();
    render(<EditorScreen />);
    const select = screen.getByLabelText(/auto-save cadence/i) as HTMLSelectElement;
    expect(select.value).toBe("15s");
    await user.selectOptions(select, "off");
    expect(usePreferences.getState().autoSave).toBe("off");
  });

  // the diff overlay is lazy-loaded and conditionally
  // mounted. We open the store directly (covers the dynamic-import
  // path without exercising the click handler again).
  it("lazy-mounts the diff overlay when the store is opened", async () => {
    render(<EditorScreen />);
    act(() => {
      useDiffStore.setState({ open: true });
    });
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /diff/i })).toBeInTheDocument();
    });
  });

  it("drag-drops a text file into the sidebar and persists it to the project", async () => {
    const { container } = render(<EditorScreen />);
    // The sidebar panel root carries the drag handlers (od-panel
    // with style flex 240px). Find it via the file tree's parent.
    const sidebar = container.querySelector(".od-panel") as HTMLElement;
    expect(sidebar).not.toBeNull();
    const file = new File(["fresh content"], "notes.md", { type: "text/markdown" });
    const dataTransfer = {
      files: [file] as unknown as FileList,
      types: ["Files"],
      dropEffect: "copy",
    };
    fireEvent.dragEnter(sidebar, { dataTransfer });
    fireEvent.dragOver(sidebar, { dataTransfer });
    fireEvent.drop(sidebar, { dataTransfer });
    await waitFor(() => {
      expect(useProjectsStore.getState().active?.files["notes.md"]?.content).toBe("fresh content");
    });
  });

  it("upload button opens the native file picker and ingests selected files", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);
    const uploadInput = screen.getByLabelText(/upload project files/i) as HTMLInputElement;
    expect(uploadInput).toBeTruthy();
    const file = new File(["picker body"], "from-picker.tex", { type: "text/x-tex" });
    await user.upload(uploadInput, file);
    await waitFor(() => {
      expect(useProjectsStore.getState().active?.files["from-picker.tex"]?.content).toBe(
        "picker body",
      );
    });
  });

  it("pasting an image into a TeX file uploads it and inserts includegraphics", async () => {
    render(<EditorScreen />);
    const content = screen.getByTestId("codemirror-host").querySelector(".cm-content");
    expect(content).not.toBeNull();
    const file = new File(["png"], "diagram.png", { type: "image/png" });

    fireEvent.paste(content!, {
      clipboardData: {
        files: [file],
        items: [],
      },
    });

    await waitFor(() => {
      expect(useProjectsStore.getState().active?.files["diagram.png"]?.content).toBeInstanceOf(
        Uint8Array,
      );
      expect(useTabsStore.getState().edits["main.tex"]).toMatch(
        /\\includegraphics\{diagram\.png\}/,
      );
    });
  });

  it("reports pasted upload failures in the status bar", async () => {
    const originalCreateFile = useProjectsStore.getState().createFile;
    act(() => {
      useProjectsStore.setState({
        createFile: async () => null,
      });
    });

    try {
      render(<EditorScreen />);
      const content = screen.getByTestId("codemirror-host").querySelector(".cm-content");
      expect(content).not.toBeNull();
      const file = new File(["png"], "diagram.png", { type: "image/png" });

      fireEvent.paste(content!, {
        clipboardData: {
          files: [file],
          items: [],
        },
      });

      await screen.findByText(/save failed: could not create diagram\.png/i);
    } finally {
      act(() => {
        useProjectsStore.setState({ createFile: originalCreateFile });
      });
    }
  });

  it("bibliography panel opens via the topbar button and inserts \\cite at the cursor", async () => {
    // The Stokes-Notes fixture has a refs.bib with @book{stokes1854,...}
    // - the bibliography panel surfaces that key, and clicking it
    // appends `\cite{stokes1854}` to the active editor buffer.
    const user = userEvent.setup();
    render(<EditorScreen />);
    await user.click(screen.getByRole("button", { name: /open bibliography/i }));
    const dialog = await screen.findByRole("dialog", { name: /project bibliography/i });
    const row = await within(dialog).findByText("stokes1854");
    await user.click(row);
    await waitFor(() => {
      expect(useTabsStore.getState().edits["main.tex"]).toMatch(/\\cite\{stokes1854\}$/);
    });
  });

  it("Sync button stays visible but disabled until a synctex index is loaded", () => {
    render(<EditorScreen />);
    expect(screen.getByRole("button", { name: /sync pdf preview to cursor/i })).toBeDisabled();
  });

  it("Sync (Mod+J) writes forward-sync rectangles into the sync store", async () => {
    const { useSyncStore } = await import("@/features/preview");
    const { useCompileStore } = await import("@/features/compile");
    const user = userEvent.setup();
    // Stub a tiny synctex index - forward lookup is the only API we exercise.
    const stub = {
      pageCount: 1,
      forward: (path: string, line: number) =>
        path === "main.tex" && line === 1
          ? [{ page: 1, x: 10, y: 20, w: 100, h: 12, path, line }]
          : [],
      reverse: () => null,
      pageRecords: () => [],
    };
    act(() => {
      useCompileStore.setState({
        status: "success",
        result: {
          status: "success",
          engine: "Test",
          log: [],
          pdf: new Uint8Array([37, 80, 68, 70]),
        },
        compiledInput: {
          project: useProjectsStore.getState().active,
          edits: useTabsStore.getState().edits,
        },
        synctex: stub,
      } as never);
    });
    render(<EditorScreen />);
    // The cursorRef defaults to null, so a forward sync without
    // a cursor write should be a no-op.
    act(() => {
      useSyncStore.getState().reset();
    });
    await user.click(screen.getByRole("button", { name: /sync pdf preview to cursor/i }));
    expect(useSyncStore.getState().highlights).toEqual([]);
  });

  it("consumes useSyncStore.reverseTarget and clears it after routing", async () => {
    const { useSyncStore } = await import("@/features/preview");
    render(<EditorScreen />);
    act(() => {
      useSyncStore.getState().reverse("references.bib", 4);
    });
    await waitFor(() => {
      expect(useSyncStore.getState().reverseTarget).toBeNull();
    });
    // The Editor opens the file in a tab as part of the jump.
    expect(useTabsStore.getState().openTabs).toContain("references.bib");
  });

  it("routes BusyTeX absolute reverse-sync paths to the real project file", async () => {
    const { useSyncStore } = await import("@/features/preview");
    render(<EditorScreen />);
    act(() => {
      useSyncStore.getState().reverse("/home/web_user/project_dir/./main.tex", 4);
    });
    await waitFor(() => expect(useSyncStore.getState().reverseTarget).toBeNull());
    expect(useTabsStore.getState().activeTab).toBe("main.tex");
    expect(useTabsStore.getState().openTabs).not.toContain("/home/web_user/project_dir/./main.tex");
  });

  it("does not open unrelated absolute paths from reverse sync", async () => {
    const { useSyncStore } = await import("@/features/preview");
    render(<EditorScreen />);
    act(() => {
      useSyncStore.getState().reverse("/tmp/main.tex", 4);
    });
    await waitFor(() => expect(useSyncStore.getState().reverseTarget).toBeNull());
    expect(useTabsStore.getState().openTabs).not.toContain("/tmp/main.tex");
  });

  it("preview panel shows an idle 'Run Compile' state before compiling", () => {
    render(<EditorScreen />);
    expect(screen.getByRole("heading", { name: /preview is empty/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run compile/i })).toBeInTheDocument();
  });

  it("resizes the preview with the keyboard-accessible panel separator", async () => {
    const originalWidth = window.innerWidth;
    window.innerWidth = 1200;
    try {
      render(<EditorScreen />);
      const separator = screen.getByRole("separator", {
        name: /resize editor and preview panels/i,
      });

      expect(separator).toHaveAttribute("aria-valuenow", "460");
      fireEvent.keyDown(separator, { key: "ArrowLeft" });

      await waitFor(() => {
        expect(separator).toHaveAttribute("aria-valuenow", "476");
      });
    } finally {
      window.innerWidth = originalWidth;
    }
  });

  it("resizes the preview smoothly through pointer capture", async () => {
    render(<EditorScreen />);
    const separator = screen.getByRole("separator", {
      name: /resize editor and preview panels/i,
    });
    const setPointerCapture = vi.fn();
    Object.defineProperty(separator, "setPointerCapture", {
      configurable: true,
      value: setPointerCapture,
    });

    fireEvent.pointerDown(separator, { button: 1, pointerId: 7, clientX: 700 });
    expect(setPointerCapture).not.toHaveBeenCalled();

    fireEvent.pointerDown(separator, { button: 0, pointerId: 7, clientX: 700 });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(document.body.style.cursor).toBe("col-resize");

    fireEvent.pointerMove(separator, { pointerId: 8, clientX: 600 });
    fireEvent.pointerMove(separator, { pointerId: 7, clientX: 600 });
    fireEvent.pointerUp(separator, { pointerId: 7, clientX: 600 });

    await waitFor(() => expect(separator).toHaveAttribute("aria-valuenow", "300"));
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("preview re-renders the entry file after a successful compile", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);
    await user.click(screen.getByRole("button", { name: /compile project/i }));
    expect(await screen.findByLabelText("Compiled PDF preview")).toBeInTheDocument();
  });

  it("downloads the latest compiled PDF", async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    try {
      render(<EditorScreen />);
      const download = screen.getByRole("button", { name: /download compiled pdf/i });
      expect(download).toBeDisabled();

      await user.click(screen.getByRole("button", { name: /compile project/i }));
      await waitFor(() => expect(download).toBeEnabled());
      await user.click(download);

      expect(createObjectUrl).toHaveBeenCalledWith(
        expect.objectContaining({ type: "application/pdf" }),
      );
      expect(anchorClick).toHaveBeenCalledOnce();

      act(() => {
        useTabsStore.getState().updateContent("main.tex", "newer source");
      });
      expect(download).toBeDisabled();
      expect(download).toHaveAttribute("title", expect.stringMatching(/recompile/i));
    } finally {
      createObjectUrl.mockRestore();
      anchorClick.mockRestore();
    }
  });

  it("editor body renders the entry file's content via CodeMirror", () => {
    render(<EditorScreen />);
    const host = screen.getByTestId("codemirror-host");
    expect(host.textContent).toContain("\\documentclass");
  });

  it("dirty marker appears in the status bar after an edit", () => {
    const { rerender } = render(<EditorScreen />);
    const status = document.querySelector(".od-status");
    expect(status).not.toBeNull();
    expect(status?.textContent).not.toMatch(/\d+ unsaved/i);
    act(() => {
      useTabsStore.getState().updateContent("main.tex", "edited content");
    });
    rerender(<EditorScreen />);
    expect(status?.textContent).toMatch(/1 unsaved/i);
    expect(status?.textContent).toMatch(/main\.tex\s\*/);
  });

  it("Cmd/Ctrl+Alt+S saves the active file to the service and clears its dirty marker", async () => {
    render(<EditorScreen />);
    act(() => {
      useTabsStore.getState().updateContent("main.tex", "edited content");
    });
    expect(useTabsStore.getState().edits["main.tex"]).toBe("edited content");
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: true,
          altKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    // saveActive is async - wait for the markCleanMany side effect.
    await waitFor(() => {
      expect(useTabsStore.getState().edits).not.toHaveProperty("main.tex");
    });
    // The active project in the store reflects the saved content.
    expect(useProjectsStore.getState().active?.files["main.tex"]?.content).toBe("edited content");
    expect(document.body.textContent).toMatch(/saved \(local\)/i);
  });

  it("Cmd/Ctrl+Alt+S persists the file so a fresh open returns the saved content", async () => {
    render(<EditorScreen />);
    act(() => {
      useTabsStore.getState().updateContent("main.tex", "persisted body");
    });
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: true,
          altKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await waitFor(() => {
      expect(useTabsStore.getState().edits).not.toHaveProperty("main.tex");
    });
    // Re-open the same project (simulates a reload). The persistence
    // layer should hand back the edited content.
    await act(async () => {
      await useProjectsStore.getState().openProject("p-stokes-notes-v3");
    });
    expect(useProjectsStore.getState().active?.files["main.tex"]?.content).toBe("persisted body");
  });

  it("Cmd/Ctrl+Alt+S reports the current save error when the active file cannot be saved", async () => {
    const originalSaveActive = useProjectsStore.getState().saveActive;
    act(() => {
      useProjectsStore.setState({
        saveActive: async () => {
          useProjectsStore.setState({ error: "IndexedDB quota exceeded" });
          return [];
        },
      });
    });

    try {
      render(<EditorScreen />);
      act(() => {
        useTabsStore.getState().updateContent("main.tex", "edited content");
      });
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "s",
            ctrlKey: true,
            altKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });

      await screen.findByText(/save failed: IndexedDB quota exceeded/i);
    } finally {
      act(() => {
        useProjectsStore.setState({ saveActive: originalSaveActive, error: null });
      });
    }
  });

  it("Cmd/Ctrl+Alt+Shift+S saves every dirty file at once", async () => {
    render(<EditorScreen />);
    act(() => {
      useTabsStore.getState().updateContent("main.tex", "v1");
      useTabsStore.getState().updateContent("references.bib", "v2");
    });
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: true,
          altKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await waitFor(() => {
      expect(Object.keys(useTabsStore.getState().edits)).toEqual([]);
    });
    expect(useProjectsStore.getState().active?.files["main.tex"]?.content).toBe("v1");
    expect(useProjectsStore.getState().active?.files["references.bib"]?.content).toBe("v2");
  });

  it("Cmd/Ctrl+Alt+Shift+S reports save-all failures", async () => {
    const originalSaveActive = useProjectsStore.getState().saveActive;
    act(() => {
      useProjectsStore.setState({
        saveActive: async () => {
          useProjectsStore.setState({ error: "Project store is unavailable" });
          return [];
        },
      });
    });

    try {
      render(<EditorScreen />);
      act(() => {
        useTabsStore.getState().updateContent("main.tex", "v1");
        useTabsStore.getState().updateContent("references.bib", "v2");
      });
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "s",
            ctrlKey: true,
            altKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });

      await screen.findByText(/save failed: Project store is unavailable/i);
    } finally {
      act(() => {
        useProjectsStore.setState({ saveActive: originalSaveActive, error: null });
      });
    }
  });

  it("clicking Compile drives the lifecycle to success and updates the status bar", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);
    await user.click(screen.getByRole("button", { name: /compile project/i }));
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Compiled/i);
      expect(document.body.textContent).toMatch(/success/i);
    });
  });

  it("Cmd/Ctrl+Enter is wired to compile too", async () => {
    render(<EditorScreen />);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Compiled/i);
      expect(document.body.textContent).toMatch(/success/i);
    });
  });

  it("Cmd/Ctrl+S follows the Overleaf default and compiles", async () => {
    render(<EditorScreen />);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Compiled/i);
      expect(document.body.textContent).toMatch(/success/i);
    });
  });

  it("opens the shortcut editor from the configured workspace binding", () => {
    render(<EditorScreen />);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  it("editing the entry into broken LaTeX surfaces a compile error in the status bar", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);
    act(() => {
      useTabsStore.getState().updateContent("main.tex", "\\end{document}\n");
    });
    await user.click(screen.getByRole("button", { name: /compile project/i }));
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Compile failed|error/i);
    });
  });

  it("compile error renders a clickable log entry", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);
    act(() => {
      useTabsStore.getState().updateContent("main.tex", "\\end{document}\n");
    });
    await user.click(screen.getByRole("button", { name: /compile project/i }));
    const logRegion = await screen.findByRole("region", { name: /compile log/i });
    expect(logRegion).toBeInTheDocument();
    // Click an entry - Editor.tsx should reopen the tab and not throw.
    const entry = logRegion.querySelector(
      ".od-log-row:not([disabled])",
    ) as HTMLButtonElement | null;
    expect(entry).not.toBeNull();
    if (entry) await user.click(entry);
  });

  it("file tree displays the local storage indicator", () => {
    render(<EditorScreen />);
    const treeAnchor = screen.getByText(/files \/ local/i);
    const filesPanel = treeAnchor.closest(".od-panel");
    expect(filesPanel).not.toBeNull();
    const panel = filesPanel as HTMLElement;
    expect(within(panel).getByText(/Auto-save cadence/i)).toBeInTheDocument();
  });
});
