// Tiny key-combo parser shared by useKeyboardShortcut. Pulled out
// so it can be tested without a DOM.
//
// Accepted syntax (case-insensitive, parts joined by "+"):
//   "Mod+S"        Command on macOS, Control elsewhere
//   "Ctrl+Shift+P" explicit Control regardless of platform
//   "Cmd+Alt+]"    explicit Command (still falls back to Ctrl on
//                  non-mac because the rule key is the same)
//   "Escape"       no modifier
//
// The "Mod" alias matches the OS convention for primary modifier
// (Command on macOS, Control elsewhere) - the same convention
// CodeMirror's "Mod-" prefix uses.

export interface ParsedCombo {
  /** Lower-cased KeyboardEvent.key we match against. */
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/** Returns true on macOS. Used to decide what "Mod" maps to. */
export function isMacPlatform(navigatorRef: { platform?: string; userAgent?: string }): boolean {
  const p = navigatorRef.platform ?? "";
  if (/Mac|iPhone|iPad|iPod/i.test(p)) return true;
  return /Mac OS X|iPhone|iPad|iPod/i.test(navigatorRef.userAgent ?? "");
}

export function parseCombo(combo: string, isMac: boolean): ParsedCombo {
  const rawParts = combo.split("+");
  let keyPart = rawParts.pop();
  if (keyPart === "" && rawParts.length > 0) {
    keyPart = "+";
    rawParts.pop();
  }
  if (!keyPart) {
    throw new Error(`Invalid key combo: ${JSON.stringify(combo)}`);
  }

  const parts = rawParts.map((p) => p.trim()).filter(Boolean);
  const key = keyPart.trim().toLowerCase();
  const flags: ParsedCombo = { key, ctrl: false, shift: false, alt: false, meta: false };
  for (const raw of parts) {
    const mod = raw.toLowerCase();
    switch (mod) {
      case "mod":
        if (isMac) flags.meta = true;
        else flags.ctrl = true;
        break;
      case "cmd":
      case "meta":
      case "command":
      case "super":
        flags.meta = true;
        break;
      case "ctrl":
      case "control":
        flags.ctrl = true;
        break;
      case "shift":
        flags.shift = true;
        break;
      case "alt":
      case "option":
      case "opt":
        flags.alt = true;
        break;
      default:
        throw new Error(`Unknown modifier: ${raw} in ${combo}`);
    }
  }
  return flags;
}

/** True when a KeyboardEvent matches the parsed combo. */
export function matchesCombo(e: KeyboardEvent, c: ParsedCombo): boolean {
  const shiftedEquals = (c.key === "=" || c.key === "+") && e.key === "+" && e.shiftKey && !c.shift;
  return (
    keyMatches(e.key, c.key) &&
    e.ctrlKey === c.ctrl &&
    e.metaKey === c.meta &&
    e.altKey === c.alt &&
    (e.shiftKey === c.shift || shiftedEquals)
  );
}

export function comboSignature(combo: string, isMac: boolean): string {
  const parsed = parseCombo(combo, isMac);
  return [
    parsed.ctrl ? "ctrl" : "",
    parsed.meta ? "meta" : "",
    parsed.alt ? "alt" : "",
    parsed.shift ? "shift" : "",
    parsed.key === "+" ? "=" : parsed.key,
  ].join("|");
}

export function matchesAnyCombo(
  event: KeyboardEvent,
  combos: readonly string[],
  navigatorRef: { platform?: string; userAgent?: string } = typeof navigator !== "undefined"
    ? navigator
    : {},
): boolean {
  const isMac = isMacPlatform(navigatorRef);
  return combos.some((combo) => matchesCombo(event, parseCombo(combo, isMac)));
}

export function comboFromKeyboardEvent(event: KeyboardEvent, isMac: boolean): string | null {
  if (isModifierKey(event.key)) return null;

  const parts: string[] = [];
  if ((isMac && event.metaKey) || (!isMac && event.ctrlKey)) parts.push("Mod");
  if (event.ctrlKey && isMac) parts.push("Ctrl");
  if (event.metaKey && !isMac) parts.push("Cmd");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey && event.key !== "+") parts.push("Shift");
  parts.push(displayKeyName(event.key));
  return parts.join("+");
}

export function formatCombo(combo: string, isMac: boolean): string {
  const parsed = parseCombo(combo, isMac);
  const parts: string[] = [];
  if (parsed.meta) parts.push(isMac ? "⌘" : "Meta");
  if (parsed.ctrl) parts.push(isMac ? "⌃" : "Ctrl");
  if (parsed.alt) parts.push(isMac ? "⌥" : "Alt");
  if (parsed.shift) parts.push(isMac ? "⇧" : "Shift");
  parts.push(displayKeyName(parsed.key));
  return parts.join(isMac ? " " : " + ");
}

function keyMatches(eventKey: string, comboKey: string): boolean {
  const event = eventKey.toLowerCase();
  if (comboKey === "=" && event === "+") return true;
  if (comboKey === "+" && event === "=") return true;
  return event === comboKey;
}

function isModifierKey(key: string): boolean {
  return ["Alt", "AltGraph", "Control", "Meta", "Shift"].includes(key);
}

function displayKeyName(key: string): string {
  const normalized = key.toLowerCase();
  const names: Record<string, string> = {
    " ": "Space",
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
  if (/^f\d{1,2}$/.test(normalized)) return normalized.toUpperCase();
  return names[normalized] ?? (key.length === 1 ? key.toUpperCase() : key);
}
