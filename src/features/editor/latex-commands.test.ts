import { describe, it, expect } from "vitest";
import { LATEX_COMMANDS, matchCommands } from "./latex-commands";

describe("LATEX_COMMANDS", () => {
  it("contains a substantial curated set", () => {
    expect(LATEX_COMMANDS.length).toBeGreaterThan(150);
  });

  it("every entry has a backslash-prefixed label", () => {
    for (const c of LATEX_COMMANDS) {
      expect(c.label.startsWith("\\")).toBe(true);
    }
  });

  it("snippets use placeholder syntax", () => {
    const frac = LATEX_COMMANDS.find((c) => c.label === "\\frac");
    expect(frac?.insert).toContain("${1:");
  });

  it("non-snippet entries insert the literal label", () => {
    const alpha = LATEX_COMMANDS.find((c) => c.label === "\\alpha");
    expect(alpha?.insert).toBe("\\alpha");
  });
});

describe("matchCommands", () => {
  it("returns every entry on an empty prefix (capped)", () => {
    const all = matchCommands("");
    expect(all.length).toBeLessThanOrEqual(50);
    expect(all.length).toBeGreaterThan(0);
  });

  it("matches by leading substring", () => {
    const out = matchCommands("\\al");
    const labels = out.map((c) => c.label);
    expect(labels).toContain("\\alpha");
    // Every match must start with the prefix. \begin{align} is not in
    // the result because the dictionary's label is the full \begin{...},
    // not a bare \align.
    expect(labels.every((l) => l.toLowerCase().startsWith("\\al"))).toBe(true);
  });

  it("is case-insensitive", () => {
    const lower = matchCommands("\\alpha");
    const upper = matchCommands("\\ALPHA");
    expect(upper.length).toBe(lower.length);
  });

  it("returns empty when nothing matches", () => {
    expect(matchCommands("\\zzzzzz")).toEqual([]);
  });

  it("respects the limit parameter", () => {
    expect(matchCommands("", 3)).toHaveLength(3);
  });

  it("knows the headline commands users will hit first", () => {
    const labels = LATEX_COMMANDS.map((c) => c.label);
    for (const expected of [
      "\\omega",
      "\\sum",
      "\\int",
      "\\frac",
      "\\mathbb{R}",
      "\\section",
      "\\begin{equation}",
      "\\begin{align}",
      "\\textbf",
      "\\partial",
    ]) {
      expect(labels, `expected ${expected} in dictionary`).toContain(expected);
    }
  });
});
