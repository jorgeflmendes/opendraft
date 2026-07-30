import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

export interface EditorDiagnostic {
  line: number;
  severity: "error" | "warn";
  message: string;
}

const replaceDiagnostics = StateEffect.define<readonly EditorDiagnostic[]>();

const diagnosticField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(replaceDiagnostics)) continue;
      const ranges = effect.value
        .map((diagnostic) => {
          const lineNumber = Math.max(1, Math.min(transaction.state.doc.lines, diagnostic.line));
          const line = transaction.state.doc.line(lineNumber);
          return Decoration.line({
            attributes: {
              class: `od-cm-diagnostic od-cm-diagnostic--${diagnostic.severity}`,
              title: diagnostic.message,
              "data-diagnostic": diagnostic.severity,
            },
          }).range(line.from);
        })
        .sort((a, b) => a.from - b.from);
      next = Decoration.set(ranges);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function editorDiagnosticsExtension(): Extension {
  return diagnosticField;
}

export function setEditorDiagnostics(
  view: EditorView,
  diagnostics: readonly EditorDiagnostic[],
): void {
  view.dispatch({ effects: replaceDiagnostics.of(diagnostics) });
}
