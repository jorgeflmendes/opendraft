import { EditorSelection } from "@codemirror/state";
import {
  addCursorAbove,
  addCursorBelow,
  copyLineDown,
  copyLineUp,
  cursorDocEnd,
  cursorDocStart,
  cursorLineEnd,
  cursorLineStart,
  defaultKeymap,
  deleteLine,
  historyKeymap,
  indentLess,
  indentMore,
  moveLineDown,
  moveLineUp,
  redo,
  selectAll,
  toggleComment,
  undo,
} from "@codemirror/commands";
import { startCompletion, completionKeymap } from "@codemirror/autocomplete";
import {
  findNext,
  findPrevious,
  gotoLine,
  openSearchPanel,
  searchKeymap,
} from "@codemirror/search";
import { foldAll, toggleFold, unfoldAll } from "@codemirror/language";
import { keymap, type Command, type KeyBinding } from "@codemirror/view";
import type { ShortcutBindingMap, ShortcutId } from "@/features/shortcuts";

const uppercaseSelection = transformSelection((value) => value.toUpperCase());
const lowercaseSelection = transformSelection((value) => value.toLowerCase());
const boldSelection = wrapSelection("\\textbf{", "}");
const italicSelection = wrapSelection("\\textit{", "}");

const EDITOR_ACTIONS: ReadonlyArray<readonly [ShortcutId, Command]> = [
  ["editor.toggleComment", toggleComment],
  ["editor.deleteLine", deleteLine],
  ["editor.autocomplete", startCompletion],
  ["editor.toggleFold", toggleFold],
  ["editor.unfoldAll", unfoldAll],
  ["editor.foldAll", foldAll],
  ["editor.indentLess", indentLess],
  ["editor.indentMore", indentMore],
  ["editor.uppercase", uppercaseSelection],
  ["editor.lowercase", lowercaseSelection],
  ["editor.bold", boldSelection],
  ["editor.italic", italicSelection],
  ["editor.duplicate", copyLineDown],
  ["editor.copyLineUp", copyLineUp],
  ["editor.copyLineDown", copyLineDown],
  ["editor.moveLineUp", moveLineUp],
  ["editor.moveLineDown", moveLineDown],
  ["editor.undo", undo],
  ["editor.redo", redo],
  ["editor.lineStart", cursorLineStart],
  ["editor.lineEnd", cursorLineEnd],
  ["editor.documentStart", cursorDocStart],
  ["editor.documentEnd", cursorDocEnd],
  ["editor.goToLine", gotoLine],
  ["editor.find", openSearchPanel],
  ["editor.findNext", findNext],
  ["editor.findPrevious", findPrevious],
  ["editor.selectAll", selectAll],
  ["editor.cursorAbove", addCursorAbove],
  ["editor.cursorBelow", addCursorBelow],
] as const;

const MANAGED_COMMANDS = new Set<unknown>(EDITOR_ACTIONS.map(([, command]) => command));

export function editorShortcutKeymap(bindings: ShortcutBindingMap): KeyBinding[] {
  return EDITOR_ACTIONS.flatMap(([id, run]) =>
    bindings[id].map((combo) => ({
      key: toCodeMirrorKey(combo),
      run,
    })),
  );
}

/**
 * CodeMirror's stock maps still provide low-level typing and cursor behavior,
 * but actions exposed in the shortcut editor are removed from those maps so
 * disabling or rebinding them is authoritative.
 */
export function unmanagedEditorKeymap(): KeyBinding[] {
  return [...completionKeymap, ...searchKeymap, ...defaultKeymap, ...historyKeymap].filter(
    (binding) => !MANAGED_COMMANDS.has(binding.run) && !MANAGED_COMMANDS.has(binding.shift),
  );
}

export function editorShortcutExtension(bindings: ShortcutBindingMap) {
  return keymap.of(editorShortcutKeymap(bindings));
}

function toCodeMirrorKey(combo: string): string {
  const rawParts = combo.split("+");
  let keyPart = rawParts.pop();
  if (keyPart === "" && rawParts.length > 0) {
    keyPart = "+";
    rawParts.pop();
  }
  if (!keyPart) throw new Error(`Invalid key combo: ${combo}`);

  const modifiers = rawParts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const normalized = part.toLowerCase();
      if (normalized === "control") return "Ctrl";
      if (normalized === "command" || normalized === "meta") return "Cmd";
      if (normalized === "option") return "Alt";
      return part[0]?.toUpperCase() + part.slice(1);
    });
  return [...modifiers, normalizeCodeMirrorKey(keyPart.trim())].join("-");
}

function normalizeCodeMirrorKey(key: string): string {
  if (key.length === 1) return key.toLowerCase();
  const normalized = key.toLowerCase();
  const names: Record<string, string> = {
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
    arrowup: "ArrowUp",
    backspace: "Backspace",
    delete: "Delete",
    end: "End",
    enter: "Enter",
    escape: "Escape",
    home: "Home",
    pagedown: "PageDown",
    pageup: "PageUp",
    space: "Space",
    tab: "Tab",
  };
  return names[normalized] ?? key;
}

function transformSelection(transform: (value: string) => string): Command {
  return (view) => {
    if (view.state.selection.ranges.every((range) => range.empty)) return false;
    const transaction = view.state.changeByRange((range) => {
      const value = view.state.sliceDoc(range.from, range.to);
      const replacement = transform(value);
      return {
        changes: { from: range.from, to: range.to, insert: replacement },
        range: EditorSelection.range(range.from, range.from + replacement.length),
      };
    });
    view.dispatch(transaction);
    return true;
  };
}

function wrapSelection(prefix: string, suffix: string): Command {
  return (view) => {
    const transaction = view.state.changeByRange((range) => {
      const selected = view.state.sliceDoc(range.from, range.to);
      const body = selected || "text";
      const replacement = `${prefix}${body}${suffix}`;
      const selectionFrom = range.from + prefix.length;
      return {
        changes: { from: range.from, to: range.to, insert: replacement },
        range: EditorSelection.range(selectionFrom, selectionFrom + body.length),
      };
    });
    view.dispatch(transaction);
    return true;
  };
}
