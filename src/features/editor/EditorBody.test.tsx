import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { EditorBody } from "./EditorBody";
import { useTabsStore } from "./useTabsStore";
import { useProjectsStore } from "@/features/projects/useProjectsStore";

describe("<EditorBody />", () => {
  beforeEach(async () => {
    useTabsStore.setState({ openTabs: [], activeTab: null, edits: {} });
    useProjectsStore.setState({ active: null, summaries: [], loading: false, error: null });
    await useProjectsStore.getState().openProject("p-stokes-notes-v3");
  });

  it("renders an empty state when no file is provided", () => {
    render(<EditorBody file={undefined} />);
    expect(screen.getByText(/no file open/i)).toBeInTheDocument();
    expect(screen.queryByTestId("codemirror-host")).toBeNull();
  });

  it("renders the file's content through CodeMirror", () => {
    const file = useProjectsStore.getState().active!.files["main.tex"]!;
    render(<EditorBody file={file} />);
    const host = screen.getByTestId("codemirror-host");
    expect(host.textContent).toContain("\\documentclass");
  });

  it("renders the edit (not the original) when one exists", () => {
    const file = useProjectsStore.getState().active!.files["main.tex"]!;
    act(() => {
      useTabsStore.getState().updateContent(file.path, "% completely different content");
    });
    render(<EditorBody file={file} />);
    expect(screen.getByTestId("codemirror-host").textContent).toContain(
      "% completely different content",
    );
  });

  it("renders the binary placeholder for image / binary files", () => {
    const file = {
      id: "f-logo",
      path: "logo.png",
      name: "logo.png",
      kind: "img" as const,
      content: new Uint8Array([137, 80, 78, 71, 0, 0, 0, 0, 0, 0]),
    };
    render(<EditorBody file={file} />);
    expect(screen.getByText(/Binary file/i)).toBeInTheDocument();
    expect(screen.getByText(/img/)).toBeInTheDocument();
    expect(screen.queryByTestId("codemirror-host")).toBeNull();
  });

  it("forwards pasted files from CodeMirror to the parent handler", () => {
    const file = useProjectsStore.getState().active!.files["main.tex"]!;
    const onPasteFiles = vi.fn().mockReturnValue(true);
    render(<EditorBody file={file} onPasteFiles={onPasteFiles} />);

    const pasted = new File(["png"], "diagram.png", { type: "image/png" });
    const content = screen.getByTestId("codemirror-host").querySelector(".cm-content");
    expect(content).not.toBeNull();
    fireEvent.paste(content!, {
      clipboardData: {
        files: [pasted],
        items: [],
      },
    });

    expect(onPasteFiles).toHaveBeenCalledWith([pasted]);
  });
});
