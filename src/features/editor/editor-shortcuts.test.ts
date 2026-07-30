import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { effectiveShortcutBindings } from "@/store/shortcuts";
import { editorShortcutKeymap, unmanagedEditorKeymap } from "./editor-shortcuts";

describe("editor shortcut keymap", () => {
  it("builds CodeMirror bindings from the central registry", () => {
    const keymap = editorShortcutKeymap(effectiveShortcutBindings({}));
    expect(keymap.some((binding) => binding.key === "Mod-/")).toBe(true);
    expect(keymap.some((binding) => binding.key === "Mod-b")).toBe(true);
    expect(keymap.some((binding) => binding.key === "F2")).toBe(true);
  });

  it("replaces defaults with user bindings", () => {
    const bindings = effectiveShortcutBindings({
      "editor.bold": ["Mod+Shift+B"],
    });
    const keymap = editorShortcutKeymap(bindings);
    const boldBindings = keymap.filter((binding) => binding.run && binding.key?.includes("b"));
    expect(boldBindings.some((binding) => binding.key === "Mod-Shift-b")).toBe(true);
  });

  it("keeps unmanaged low-level editor commands available", () => {
    expect(unmanagedEditorKeymap().length).toBeGreaterThan(10);
  });

  it("wraps a selection in the configured LaTeX bold command", () => {
    const state = EditorState.create({
      doc: "tensor",
      selection: { anchor: 0, head: 6 },
    });
    const view = new EditorView({ state });
    const bold = editorShortcutKeymap(effectiveShortcutBindings({})).find(
      (binding) => binding.key === "Mod-b",
    );
    expect(bold?.run?.(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("\\textbf{tensor}");
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe(
      "tensor",
    );
    view.destroy();
  });

  it("transforms selected text and leaves an empty selection unchanged", () => {
    const bindings = editorShortcutKeymap(effectiveShortcutBindings({}));
    const uppercase = bindings.find((binding) => binding.key === "Ctrl-u");

    const selectedView = new EditorView({
      state: EditorState.create({
        doc: "stokes",
        selection: { anchor: 0, head: 6 },
      }),
    });
    expect(uppercase?.run?.(selectedView)).toBe(true);
    expect(selectedView.state.doc.toString()).toBe("STOKES");
    selectedView.destroy();

    const emptyView = new EditorView({
      state: EditorState.create({ doc: "stokes" }),
    });
    expect(uppercase?.run?.(emptyView)).toBe(false);
    expect(emptyView.state.doc.toString()).toBe("stokes");
    emptyView.destroy();
  });
});
