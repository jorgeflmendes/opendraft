import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { CodeMirrorEditor } from "./CodeMirrorEditor";

describe("<CodeMirrorEditor /> smoke", () => {
  it("mounts an editor host", () => {
    render(
      <CodeMirrorEditor
        documentKey="main.tex"
        value="\\documentclass{article}"
        kind="tex"
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("codemirror-host")).toBeInTheDocument();
  });

  it("renders the supplied content into the document", () => {
    render(
      <CodeMirrorEditor
        documentKey="x.tex"
        value="\\section{Setup}"
        kind="tex"
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("codemirror-host").textContent).toContain("\\section");
  });

  it("assigns distinct highlight classes to LaTeX commands and arguments", () => {
    render(
      <CodeMirrorEditor
        documentKey="x.tex"
        value={"\\documentclass[11pt]{article}"}
        kind="tex"
        onChange={() => {}}
      />,
    );
    const host = screen.getByTestId("codemirror-host");
    expect(host.querySelector(".od-cm-env")).toHaveTextContent("\\documentclass");
    expect(host.querySelector(".od-cm-cmd")).toHaveTextContent("11pt");
    expect(host.querySelector(".od-cm-punct")).toHaveTextContent("[");
  });

  it("rebuilds when documentKey changes (different file picked)", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CodeMirrorEditor documentKey="a.tex" value="A" kind="tex" onChange={onChange} />,
    );
    rerender(<CodeMirrorEditor documentKey="b.tex" value="B" kind="tex" onChange={onChange} />);
    expect(screen.getByTestId("codemirror-host").textContent).toContain("B");
  });

  it("patches in-place when value changes for the same documentKey", () => {
    const { rerender } = render(
      <CodeMirrorEditor documentKey="a.tex" value="first" kind="tex" onChange={() => {}} />,
    );
    rerender(
      <CodeMirrorEditor documentKey="a.tex" value="second" kind="tex" onChange={() => {}} />,
    );
    expect(screen.getByTestId("codemirror-host").textContent).toContain("second");
  });

  it("routes pasted files through the caller", () => {
    const onPasteFiles = vi.fn().mockReturnValue(true);
    render(
      <CodeMirrorEditor
        documentKey="a.tex"
        value="first"
        kind="tex"
        onChange={() => {}}
        onPasteFiles={onPasteFiles}
      />,
    );

    const file = new File(["png"], "figure.png", { type: "image/png" });
    const content = screen.getByTestId("codemirror-host").querySelector(".cm-content");
    expect(content).not.toBeNull();
    fireEvent.paste(content!, {
      clipboardData: {
        files: [file],
        items: [],
      },
    });

    expect(onPasteFiles).toHaveBeenCalledWith([file]);
  });

  it("marks compiler errors directly on their source lines", () => {
    const { rerender } = render(
      <CodeMirrorEditor
        documentKey="main.tex"
        value={"first line\nbroken command"}
        kind="tex"
        onChange={() => {}}
        diagnostics={[{ line: 2, severity: "error", message: "Undefined control sequence" }]}
      />,
    );

    const host = screen.getByTestId("codemirror-host");
    const marked = host.querySelector('[data-diagnostic="error"]');
    expect(marked).toHaveAttribute("title", "Undefined control sequence");
    expect(marked).toHaveTextContent("broken command");

    rerender(
      <CodeMirrorEditor
        documentKey="main.tex"
        value={"first line\nbroken command"}
        kind="tex"
        onChange={() => {}}
        diagnostics={[]}
      />,
    );
    expect(host.querySelector("[data-diagnostic]")).toBeNull();
  });

  it("keeps the paste-file handler after switching documents", () => {
    const onPasteFiles = vi.fn().mockReturnValue(true);
    const { rerender } = render(
      <CodeMirrorEditor
        documentKey="a.tex"
        value="A"
        kind="tex"
        onChange={() => {}}
        onPasteFiles={onPasteFiles}
      />,
    );
    rerender(
      <CodeMirrorEditor
        documentKey="b.tex"
        value="B"
        kind="tex"
        onChange={() => {}}
        onPasteFiles={onPasteFiles}
      />,
    );

    const file = new File(["pdf"], "paper.pdf", { type: "application/pdf" });
    const content = screen.getByTestId("codemirror-host").querySelector(".cm-content");
    expect(content).not.toBeNull();
    fireEvent.paste(content!, {
      clipboardData: {
        files: [file],
        items: [],
      },
    });

    expect(onPasteFiles).toHaveBeenCalledWith([file]);
  });

  it("preserves the caret when an external same-document patch inserts text before it", () => {
    const { rerender } = render(
      <CodeMirrorEditor documentKey="a.tex" value="AB" kind="tex" onChange={() => {}} />,
    );

    // Place the caret at the end of the document (after "AB", pos 2).
    const cm = screen.getByTestId("codemirror-host").querySelector(".cm-content") as HTMLElement;
    const view = EditorView.findFromDOM(cm);
    expect(view).not.toBeNull();
    view!.dispatch({ selection: { anchor: 2 } });
    expect(view!.state.selection.main.head).toBe(2);

    // External patch inserts "X" at the START of the document.
    rerender(<CodeMirrorEditor documentKey="a.tex" value="XAB" kind="tex" onChange={() => {}} />);

    // A minimal change maps the caret forward past the insertion, so
    // it still sits after "AB" (pos 3) rather than collapsing to the
    // whole-document replacement's end.
    expect(view!.state.doc.toString()).toBe("XAB");
    expect(view!.state.selection.main.head).toBe(3);
  });
});
