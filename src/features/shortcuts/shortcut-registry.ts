import { isMacPlatform } from "@/lib/keymap/parse-combo";

export type ShortcutScope = "workspace" | "editor" | "pdf";
export type ShortcutCategory = "Project" | "Editing" | "Navigation" | "Selection" | "PDF preview";

export type ShortcutId =
  | "workspace.compile"
  | "workspace.save"
  | "workspace.saveAll"
  | "workspace.quickOpen"
  | "workspace.findInFiles"
  | "workspace.bibliography"
  | "workspace.syncPdf"
  | "workspace.shortcuts"
  | "editor.toggleComment"
  | "editor.deleteLine"
  | "editor.autocomplete"
  | "editor.toggleFold"
  | "editor.unfoldAll"
  | "editor.foldAll"
  | "editor.indentLess"
  | "editor.indentMore"
  | "editor.uppercase"
  | "editor.lowercase"
  | "editor.bold"
  | "editor.italic"
  | "editor.duplicate"
  | "editor.copyLineUp"
  | "editor.copyLineDown"
  | "editor.moveLineUp"
  | "editor.moveLineDown"
  | "editor.undo"
  | "editor.redo"
  | "editor.lineStart"
  | "editor.lineEnd"
  | "editor.documentStart"
  | "editor.documentEnd"
  | "editor.goToLine"
  | "editor.find"
  | "editor.findNext"
  | "editor.findPrevious"
  | "editor.selectAll"
  | "editor.cursorAbove"
  | "editor.cursorBelow"
  | "pdf.zoomIn"
  | "pdf.zoomOut"
  | "pdf.zoomReset"
  | "pdf.previousPage"
  | "pdf.nextPage"
  | "pdf.firstPage"
  | "pdf.lastPage";

export interface ShortcutDefinition {
  id: ShortcutId;
  label: string;
  description: string;
  category: ShortcutCategory;
  scope: ShortcutScope;
  defaultBindings: readonly string[];
  macDefaultBindings?: readonly string[];
}

const shortcut = (
  id: ShortcutId,
  label: string,
  description: string,
  category: ShortcutCategory,
  scope: ShortcutScope,
  defaultBindings: readonly string[],
  macDefaultBindings?: readonly string[],
): ShortcutDefinition => ({
  id,
  label,
  description,
  category,
  scope,
  defaultBindings,
  ...(macDefaultBindings ? { macDefaultBindings } : {}),
});

/**
 * Canonical action registry. UI, persistence and dispatch all consume this
 * table, so adding a shortcut is a data change plus an action implementation.
 * Overleaf-compatible defaults are used whenever OpenDraft supports the action.
 */
export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  shortcut(
    "workspace.compile",
    "Compile project",
    "Compile the current source and refresh the PDF.",
    "Project",
    "workspace",
    ["Mod+.", "Mod+S", "Mod+Enter"],
  ),
  shortcut(
    "workspace.save",
    "Save current file",
    "Write the active file to local project storage.",
    "Project",
    "workspace",
    ["Mod+Alt+S"],
  ),
  shortcut(
    "workspace.saveAll",
    "Save all files",
    "Write every changed file to local project storage.",
    "Project",
    "workspace",
    ["Mod+Alt+Shift+S"],
  ),
  shortcut(
    "workspace.quickOpen",
    "Quick open",
    "Search for a project file by name.",
    "Project",
    "workspace",
    ["Mod+P"],
  ),
  shortcut(
    "workspace.findInFiles",
    "Find in files",
    "Search across every text file in the project.",
    "Project",
    "workspace",
    ["Mod+Shift+F"],
  ),
  shortcut(
    "workspace.bibliography",
    "Open bibliography",
    "Open the bibliography browser.",
    "Project",
    "workspace",
    ["Mod+Shift+B"],
  ),
  shortcut(
    "workspace.syncPdf",
    "Sync PDF to cursor",
    "Jump from the source cursor to the compiled PDF.",
    "Project",
    "workspace",
    ["Mod+J"],
  ),
  shortcut(
    "workspace.shortcuts",
    "Keyboard shortcuts",
    "Open this shortcut editor.",
    "Project",
    "workspace",
    ["Mod+K"],
  ),
  shortcut(
    "editor.toggleComment",
    "Toggle comment",
    "Add or remove % on the selected line or lines.",
    "Editing",
    "editor",
    ["Mod+/"],
  ),
  shortcut(
    "editor.deleteLine",
    "Delete current line",
    "Delete every line touched by the selection.",
    "Editing",
    "editor",
    ["Mod+D"],
  ),
  shortcut(
    "editor.autocomplete",
    "Open autocomplete",
    "Show LaTeX commands, citations and references.",
    "Editing",
    "editor",
    ["Ctrl+Space", "Alt+Space"],
  ),
  shortcut(
    "editor.toggleFold",
    "Toggle fold",
    "Fold or unfold the syntax block at the cursor.",
    "Editing",
    "editor",
    ["F2"],
  ),
  shortcut("editor.unfoldAll", "Unfold all", "Expand every folded region.", "Editing", "editor", [
    "Alt+Shift+0",
  ]),
  shortcut("editor.foldAll", "Fold all", "Collapse every foldable region.", "Editing", "editor", [
    "Alt+Shift+1",
  ]),
  shortcut(
    "editor.indentLess",
    "Indent less",
    "Decrease indentation for the selected lines.",
    "Editing",
    "editor",
    ["Mod+[", "Shift+Tab"],
  ),
  shortcut(
    "editor.indentMore",
    "Indent more",
    "Increase indentation for the selected lines.",
    "Editing",
    "editor",
    ["Mod+]", "Tab"],
  ),
  shortcut(
    "editor.uppercase",
    "Uppercase selection",
    "Convert selected text to uppercase.",
    "Editing",
    "editor",
    ["Ctrl+U"],
  ),
  shortcut(
    "editor.lowercase",
    "Lowercase selection",
    "Convert selected text to lowercase.",
    "Editing",
    "editor",
    ["Ctrl+Shift+U"],
  ),
  shortcut("editor.bold", "Bold text", "Wrap the selection in \\textbf{…}.", "Editing", "editor", [
    "Mod+B",
  ]),
  shortcut(
    "editor.italic",
    "Italicise text",
    "Wrap the selection in \\textit{…}.",
    "Editing",
    "editor",
    ["Mod+I"],
  ),
  shortcut(
    "editor.duplicate",
    "Duplicate selection or line",
    "Duplicate the selected lines below.",
    "Editing",
    "editor",
    ["Mod+Shift+D"],
  ),
  shortcut(
    "editor.copyLineUp",
    "Copy lines up",
    "Duplicate the selected lines above.",
    "Editing",
    "editor",
    ["Alt+Shift+ArrowUp"],
  ),
  shortcut(
    "editor.copyLineDown",
    "Copy lines down",
    "Duplicate the selected lines below.",
    "Editing",
    "editor",
    ["Alt+Shift+ArrowDown"],
  ),
  shortcut(
    "editor.moveLineUp",
    "Move lines up",
    "Move the selected lines one row upwards.",
    "Editing",
    "editor",
    ["Alt+ArrowUp"],
  ),
  shortcut(
    "editor.moveLineDown",
    "Move lines down",
    "Move the selected lines one row downwards.",
    "Editing",
    "editor",
    ["Alt+ArrowDown"],
  ),
  shortcut("editor.undo", "Undo", "Undo the last edit.", "Editing", "editor", ["Mod+Z"]),
  shortcut("editor.redo", "Redo", "Reapply the most recently undone edit.", "Editing", "editor", [
    "Mod+Shift+Z",
  ]),
  shortcut(
    "editor.lineStart",
    "Go to line start",
    "Move the cursor to the start of the visual line.",
    "Navigation",
    "editor",
    ["Alt+ArrowLeft"],
    ["Ctrl+A"],
  ),
  shortcut(
    "editor.lineEnd",
    "Go to line end",
    "Move the cursor to the end of the visual line.",
    "Navigation",
    "editor",
    ["Alt+ArrowRight"],
    ["Ctrl+E"],
  ),
  shortcut(
    "editor.documentStart",
    "Go to document start",
    "Move the cursor to the beginning of the file.",
    "Navigation",
    "editor",
    ["Ctrl+Home"],
    ["Mod+ArrowUp"],
  ),
  shortcut(
    "editor.documentEnd",
    "Go to document end",
    "Move the cursor to the end of the file.",
    "Navigation",
    "editor",
    ["Ctrl+End"],
    ["Mod+ArrowDown"],
  ),
  shortcut(
    "editor.goToLine",
    "Go to line number",
    "Open the line-number prompt.",
    "Navigation",
    "editor",
    ["Mod+Shift+L"],
  ),
  shortcut("editor.find", "Find", "Search inside the active file.", "Navigation", "editor", [
    "Mod+F",
  ]),
  shortcut("editor.findNext", "Find next", "Move to the next match.", "Navigation", "editor", [
    "Mod+G",
  ]),
  shortcut(
    "editor.findPrevious",
    "Find previous",
    "Move to the previous match.",
    "Navigation",
    "editor",
    ["Mod+Shift+G"],
  ),
  shortcut(
    "editor.selectAll",
    "Select all",
    "Select the complete active file.",
    "Selection",
    "editor",
    ["Mod+A"],
  ),
  shortcut(
    "editor.cursorAbove",
    "Add cursor above",
    "Add another cursor on the preceding line.",
    "Selection",
    "editor",
    ["Mod+Alt+ArrowUp"],
  ),
  shortcut(
    "editor.cursorBelow",
    "Add cursor below",
    "Add another cursor on the following line.",
    "Selection",
    "editor",
    ["Mod+Alt+ArrowDown"],
  ),
  shortcut("pdf.zoomIn", "Zoom PDF in", "Increase the PDF zoom level.", "PDF preview", "pdf", [
    "Mod++",
  ]),
  shortcut("pdf.zoomOut", "Zoom PDF out", "Decrease the PDF zoom level.", "PDF preview", "pdf", [
    "Mod+-",
  ]),
  shortcut("pdf.zoomReset", "Reset PDF zoom", "Return PDF zoom to 100%.", "PDF preview", "pdf", [
    "Mod+0",
  ]),
  shortcut(
    "pdf.previousPage",
    "Previous PDF page",
    "Move to the previous PDF page.",
    "PDF preview",
    "pdf",
    ["PageUp"],
  ),
  shortcut("pdf.nextPage", "Next PDF page", "Move to the next PDF page.", "PDF preview", "pdf", [
    "PageDown",
  ]),
  shortcut("pdf.firstPage", "First PDF page", "Move to the first PDF page.", "PDF preview", "pdf", [
    "Home",
  ]),
  shortcut("pdf.lastPage", "Last PDF page", "Move to the last PDF page.", "PDF preview", "pdf", [
    "End",
  ]),
] as const;

export const SHORTCUT_BY_ID = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition]),
) as Record<ShortcutId, ShortcutDefinition>;

export const SHORTCUT_CATEGORIES: readonly ShortcutCategory[] = [
  "Project",
  "Editing",
  "Navigation",
  "Selection",
  "PDF preview",
];

export type ShortcutBindingMap = Record<ShortcutId, readonly string[]>;

export function shortcutDefaults(
  navigatorRef: { platform?: string; userAgent?: string } = typeof navigator !== "undefined"
    ? navigator
    : {},
): ShortcutBindingMap {
  const isMac = isMacPlatform(navigatorRef);
  return Object.fromEntries(
    SHORTCUT_DEFINITIONS.map((definition) => [
      definition.id,
      [
        ...(isMac && definition.macDefaultBindings
          ? definition.macDefaultBindings
          : definition.defaultBindings),
      ],
    ]),
  ) as unknown as ShortcutBindingMap;
}

export function scopesConflict(left: ShortcutScope, right: ShortcutScope): boolean {
  return left === right || left === "workspace" || right === "workspace";
}
