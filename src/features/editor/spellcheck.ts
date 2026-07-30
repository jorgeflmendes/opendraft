import type { EditorState } from "@codemirror/state";
import { StateField, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

// Native spellcheck is enabled for the document, then disabled on syntax spans
// that cannot contain prose because contenteditable has no token-level API.

const spellcheckMark = Decoration.mark({ attributes: { spellcheck: "false" } });

const spellcheckField = StateField.define<DecorationSet>({
  create(state) {
    return buildSpellcheckDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) {
      return buildSpellcheckDecorations(tr.state);
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildSpellcheckDecorations(state: EditorState): DecorationSet {
  const widgets: ReturnType<typeof spellcheckMark.range>[] = [];
  const tree = syntaxTree(state);

  tree.iterate({
    enter: (node) => {
      const name = node.type.name;
      if (
        name.includes("atom") ||
        name.includes("keyword") ||
        name.includes("comment") ||
        name.includes("math") ||
        name.includes("env") ||
        name.includes("bracket")
      ) {
        widgets.push(spellcheckMark.range(node.from, node.to));
      }
    },
  });

  return Decoration.set(widgets, true);
}

export function spellcheckExtension(): Extension {
  return [EditorView.contentAttributes.of({ spellcheck: "true" }), spellcheckField];
}
