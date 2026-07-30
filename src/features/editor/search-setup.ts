import { search } from "@codemirror/search";
import type { Extension } from "@codemirror/state";

// CodeMirror's search extension ships with its own panel UI; we
// only configure it. The panel respects design tokens through the
// styles in chrome.css (`.cm-panels`, `.cm-panel.cm-search`).
export function searchExtension(): Extension {
  return search({ top: true });
}
