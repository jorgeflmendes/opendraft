import { Annotation, Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { history } from "@codemirror/commands";
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { stexMath } from "@codemirror/legacy-modes/mode/stex";
import { tags as t } from "@lezer/highlight";
import type { FileKind } from "@/domain";
import { shortcutDefaults, type ShortcutBindingMap } from "@/features/shortcuts/shortcut-registry";
import { latexAutocompleteExtension } from "./latex-completion";
import { mathHoverExtension } from "./math-hover";
import { searchExtension } from "./search-setup";
import { editorDiagnosticsExtension } from "./editor-diagnostics";
import { spellcheckExtension } from "./spellcheck";
import { latexFoldingExtension } from "./latex-folding";
import { editorShortcutExtension, unmanagedEditorKeymap } from "./editor-shortcuts";

export function selectLanguage(kind: FileKind | undefined): Extension {
  switch (kind) {
    case "tex":
    case "sty":
      return StreamLanguage.define(stex);
    case "bib":
      // CodeMirror has no BibTeX mode; this provides useful delimiter highlighting.
      return StreamLanguage.define(stexMath);
    default:
      return [];
  }
}

// Classes defer color to CSS tokens, so theme changes do not rebuild editor state.
const openDraftHighlight = HighlightStyle.define([
  { tag: t.keyword, class: "od-cm-keyword" },
  { tag: t.atom, class: "od-cm-cmd" },
  { tag: t.string, class: "od-cm-string" },
  { tag: t.number, class: "od-cm-num" },
  { tag: t.comment, class: "od-cm-comment" },
  { tag: t.bracket, class: "od-cm-punct" },
  { tag: t.tagName, class: "od-cm-env" },
  { tag: t.attributeName, class: "od-cm-opt" },
  { tag: t.variableName, class: "od-cm-arg" },
  { tag: t.invalid, class: "od-cm-invalid" },
]);

const baseTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    backgroundColor: "var(--od-paper)",
    color: "var(--syn-fg)",
  },
  ".cm-scroller": {
    fontFamily: "var(--od-mono)",
    lineHeight: "1.65",
  },
  ".cm-content": {
    padding: "14px 18px",
    caretColor: "var(--syn-cursor)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--od-paper)",
    color: "var(--od-muted)",
    borderRight: "1px solid var(--od-border)",
    fontSize: "12px",
  },
  ".cm-foldGutter": {
    width: "12px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ".cm-foldGutter .cm-gutterElement": {
    cursor: "pointer",
  },
  ".cm-foldGutter .cm-gutterElement:hover": {
    color: "var(--syn-fg)",
  },
  ".cm-activeLineGutter": {
    color: "var(--od-coral)",
    backgroundColor: "transparent",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--od-paper-2)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--od-coral-wash)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".od-cm-spell-error": {
    textDecoration: "underline wavy var(--od-err)",
    textUnderlineOffset: "2px",
  },
});

interface BuildStateInput {
  content: string;
  kind: FileKind | undefined;
  shortcutBindings?: ShortcutBindingMap;
  onChange: (next: string) => void;
  onCursorChange?: (line: number, column: number) => void;
  onPasteFiles?: (files: File[]) => boolean;
}

/**
 * Marks controlled-value patches so they are not echoed back as user edits.
 */
export const ExternalPatch = Annotation.define<true>();
export const editorShortcutCompartment = new Compartment();

export function buildEditorState({
  content,
  kind,
  shortcutBindings = shortcutDefaults(),
  onChange,
  onCursorChange,
  onPasteFiles,
}: BuildStateInput): EditorState {
  return EditorState.create({
    doc: content,
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      EditorView.contentAttributes.of({ "aria-label": "LaTeX source editor" }),
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      // Configurable actions run first. Stock bindings remain only for
      // low-level editing behavior that is not exposed as a user shortcut.
      editorShortcutCompartment.of(editorShortcutExtension(shortcutBindings)),
      keymap.of(unmanagedEditorKeymap()),
      syntaxHighlighting(openDraftHighlight, { fallback: true }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      selectLanguage(kind),
      latexAutocompleteExtension(),
      searchExtension(),
      mathHoverExtension(),
      editorDiagnosticsExtension(),
      spellcheckExtension(),
      latexFoldingExtension(),
      baseTheme,
      // Route file-only clipboard payloads to upload rather than inserting empty text.
      EditorView.domEventHandlers({
        paste(event) {
          if (!onPasteFiles) return false;
          const data = event.clipboardData;
          if (!data) return false;
          const files: File[] = [];
          if (data.files && data.files.length > 0) {
            for (let i = 0; i < data.files.length; i++) {
              const f = data.files[i];
              if (f) files.push(f);
            }
          }
          if (files.length === 0) return false;
          const handled = onPasteFiles(files);
          if (handled) event.preventDefault();
          return handled;
        },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          if (!u.transactions.some((tr) => tr.annotation(ExternalPatch))) {
            onChange(u.state.doc.toString());
          }
        }
        if (onCursorChange && (u.docChanged || u.selectionSet)) {
          const head = u.state.selection.main.head;
          const lineInfo = u.state.doc.lineAt(head);
          onCursorChange(lineInfo.number, head - lineInfo.from + 1);
        }
      }),
    ],
  });
}
