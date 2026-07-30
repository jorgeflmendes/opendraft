import { describe, it, expect } from "vitest";
import {
  comboFromKeyboardEvent,
  comboSignature,
  formatCombo,
  isMacPlatform,
  matchesAnyCombo,
  matchesCombo,
  parseCombo,
} from "./parse-combo";

const ev = (init: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent =>
  new KeyboardEvent("keydown", init);

describe("parseCombo", () => {
  it("parses a bare key with no modifiers", () => {
    expect(parseCombo("Escape", false)).toEqual({
      key: "escape",
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
    });
  });

  it("normalises case and ignores whitespace", () => {
    expect(parseCombo("  CTRL +  shift + p", false)).toMatchObject({
      key: "p",
      ctrl: true,
      shift: true,
    });
  });

  it("Mod maps to Meta on macOS and Ctrl elsewhere", () => {
    expect(parseCombo("Mod+S", true)).toMatchObject({ ctrl: false, meta: true });
    expect(parseCombo("Mod+S", false)).toMatchObject({ ctrl: true, meta: false });
  });

  it.each([
    ["Cmd", "meta"],
    ["Command", "meta"],
    ["Meta", "meta"],
    ["Super", "meta"],
    ["Ctrl", "ctrl"],
    ["Control", "ctrl"],
    ["Shift", "shift"],
    ["Alt", "alt"],
    ["Option", "alt"],
    ["Opt", "alt"],
  ])("recognises the %s modifier alias", (alias, expected) => {
    const parsed = parseCombo(`${alias}+X`, false);
    expect(parsed[expected as "ctrl" | "meta" | "shift" | "alt"]).toBe(true);
  });

  it("rejects empty combos", () => {
    expect(() => parseCombo("", false)).toThrow();
  });

  it("rejects unknown modifiers", () => {
    expect(() => parseCombo("Hyper+X", false)).toThrow(/Hyper/);
  });
});

describe("matchesCombo", () => {
  const combo = parseCombo("Ctrl+Shift+P", false);

  it("matches when key + every modifier matches exactly", () => {
    expect(matchesCombo(ev({ key: "p", ctrlKey: true, shiftKey: true }), combo)).toBe(true);
  });

  it("rejects when a modifier is missing", () => {
    expect(matchesCombo(ev({ key: "p", ctrlKey: true }), combo)).toBe(false);
  });

  it("rejects when an unwanted modifier is present", () => {
    expect(matchesCombo(ev({ key: "p", ctrlKey: true, shiftKey: true, altKey: true }), combo)).toBe(
      false,
    );
  });

  it("rejects on key mismatch", () => {
    expect(matchesCombo(ev({ key: "q", ctrlKey: true, shiftKey: true }), combo)).toBe(false);
  });

  it("accepts the shifted plus key for a configured equals binding", () => {
    expect(
      matchesCombo(ev({ key: "+", ctrlKey: true, shiftKey: true }), parseCombo("Mod+=", false)),
    ).toBe(true);
  });

  it("matches any binding in an action", () => {
    expect(
      matchesAnyCombo(ev({ key: "Enter", ctrlKey: true }), ["Mod+.", "Mod+Enter"], {
        platform: "Win32",
      }),
    ).toBe(true);
  });
});

describe("shortcut recording and display", () => {
  it("records the platform primary modifier as Mod", () => {
    expect(comboFromKeyboardEvent(ev({ key: "k", ctrlKey: true }), false)).toBe("Mod+K");
    expect(comboFromKeyboardEvent(ev({ key: "k", metaKey: true }), true)).toBe("Mod+K");
  });

  it("ignores standalone modifier presses", () => {
    expect(comboFromKeyboardEvent(ev({ key: "Shift", shiftKey: true }), false)).toBeNull();
  });

  it("formats bindings for the active platform", () => {
    expect(formatCombo("Mod+Shift+P", false)).toBe("Ctrl + Shift + P");
    expect(formatCombo("Mod+Shift+P", true)).toBe("⌘ ⇧ P");
  });

  it("uses semantic signatures for conflict checks", () => {
    expect(comboSignature("Mod+S", false)).toBe(comboSignature("Ctrl+S", false));
    expect(comboSignature("Mod+S", true)).not.toBe(comboSignature("Ctrl+S", true));
  });
});

describe("isMacPlatform", () => {
  it("detects mac from navigator.platform", () => {
    expect(isMacPlatform({ platform: "MacIntel" })).toBe(true);
    expect(isMacPlatform({ platform: "iPhone" })).toBe(true);
  });

  it("falls back to userAgent when platform is empty", () => {
    expect(
      isMacPlatform({ platform: "", userAgent: "Mozilla/5.0 (Macintosh; Mac OS X 10_15_7)" }),
    ).toBe(true);
  });

  it("returns false for Windows / Linux", () => {
    expect(isMacPlatform({ platform: "Win32" })).toBe(false);
    expect(isMacPlatform({ platform: "Linux x86_64" })).toBe(false);
  });
});
