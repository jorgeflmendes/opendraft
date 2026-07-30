import { useEffect, useMemo, useRef } from "react";
import { isMacPlatform, matchesCombo, parseCombo } from "./parse-combo";

interface Options {
  /** Disable without changing the call site - handy when the
   *  shortcut should be active only on certain screens. */
  enabled?: boolean;
  /** Default true. Set false for shortcuts that need to coexist
   *  with browser defaults (e.g. system-level cut/copy). */
  preventDefault?: boolean;
  /** Default false. When true, the handler still fires while the
   *  user is typing in an input/textarea/contentEditable. */
  allowInInputs?: boolean;
}

/**
 * Register a keyboard shortcut for the lifetime of the component.
 * `combo` uses the parse-combo syntax ("Mod+S", "Ctrl+Shift+P", ...).
 * The handler is held in a ref so it always sees the latest closure
 * without re-binding the document listener every render.
 *
 * The handler does NOT fire when focus is in an editable element by
 * default. CodeMirror's editor surface IS treated as editable
 * (contentEditable=true), so editor-targeted shortcuts must opt in
 * via allowInInputs.
 */
export function useKeyboardShortcut(
  combo: string | readonly string[],
  handler: (e: KeyboardEvent) => void,
  options: Options = {},
): void {
  const { enabled = true, preventDefault = true, allowInInputs = false } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const parsed = useMemo(() => {
    const combos = typeof combo === "string" ? [combo] : combo;
    const isMac = isMacPlatform(typeof navigator !== "undefined" ? navigator : {});
    return combos.map((entry) => parseCombo(entry, isMac));
  }, [combo]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!parsed.some((candidate) => matchesCombo(e, candidate))) return;
      if (!allowInInputs && isEditableTarget(e.target)) return;
      if (preventDefault) e.preventDefault();
      handlerRef.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, parsed, preventDefault, allowInInputs]);
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}
