import { describe, it, expect } from "vitest";
import { parseOutline } from "./outline";

describe("parseOutline", () => {
  it("returns an empty list when there are no sectioning commands", () => {
    expect(parseOutline("Just text here.\nNo sections.")).toEqual([]);
  });

  it("parses every standard sectioning level with correct depth + line numbers", () => {
    const source = [
      "\\part{Foundations}",
      "\\chapter{Setup}",
      "\\section{Hypotheses}",
      "\\subsection{Notation}",
      "\\subsubsection{Symbols}",
      "\\paragraph{Side remark}",
      "\\subparagraph{Tiny remark}",
    ].join("\n");
    const nodes = parseOutline(source);
    expect(nodes.map((n) => [n.kind, n.depth, n.line, n.title])).toEqual([
      ["part", 0, 1, "Foundations"],
      ["chapter", 1, 2, "Setup"],
      ["section", 2, 3, "Hypotheses"],
      ["subsection", 3, 4, "Notation"],
      ["subsubsection", 4, 5, "Symbols"],
      ["paragraph", 5, 6, "Side remark"],
      ["subparagraph", 6, 7, "Tiny remark"],
    ]);
  });

  it("marks starred variants as starred", () => {
    const nodes = parseOutline("\\section*{Acknowledgments}\n\\section{Body}");
    expect(nodes[0]).toMatchObject({ kind: "section", starred: true, title: "Acknowledgments" });
    expect(nodes[1]).toMatchObject({ kind: "section", starred: false });
  });

  it("ignores lines that start with a comment marker", () => {
    const source = ["% \\section{Hidden}", "  % \\section{Also hidden}", "\\section{Real}"].join(
      "\n",
    );
    const nodes = parseOutline(source);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.title).toBe("Real");
    expect(nodes[0]!.line).toBe(3);
  });

  it("strips an optional [short title] argument before reading the braced title", () => {
    const nodes = parseOutline("\\section[Short]{The long descriptive title}");
    expect(nodes[0]!.title).toBe("The long descriptive title");
  });

  it("ignores embedded \\section commands inside inline math by accident only when commented", () => {
    // Inline math like $\section{x}$ wouldn't appear in real LaTeX -
    // we keep the simple line walker. This test documents the
    // deliberate scope: anything not commented is parsed.
    const nodes = parseOutline("$\\section{x}$");
    expect(nodes).toHaveLength(1);
  });

  it("trims whitespace inside the braced title", () => {
    const nodes = parseOutline("\\section{   Padded title   }");
    expect(nodes[0]!.title).toBe("Padded title");
  });

  it("handles empty section titles without crashing", () => {
    const nodes = parseOutline("\\section{}");
    expect(nodes[0]!.title).toBe("");
  });

  it("returns line numbers 1-based to match editor conventions", () => {
    const nodes = parseOutline("\n\n\\section{First}");
    expect(nodes[0]!.line).toBe(3);
  });
});
