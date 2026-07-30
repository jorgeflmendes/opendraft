import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUXILIARY_TOOLS,
  UnavailableAuxiliaryTool,
  findAuxiliaryTool,
} from "./latex-auxiliary-tools";

describe("latex auxiliary tools registry", () => {
  it("exposes explicit unavailable serverless tools", async () => {
    const tool = findAuxiliaryTool("bibtex");
    expect(tool).toBeDefined();
    expect(tool?.available).toBe(false);
    expect(tool?.serverless).toBe(true);

    const result = await tool!.run({ jobName: "main", files: new Map() });
    expect(result.ok).toBe(false);
    expect(result.log).toMatch(/BibTeX/);
    expect(result.log).toMatch(/browser/);
  });

  it("returns null for tools outside a custom registry", () => {
    const custom = [new UnavailableAuxiliaryTool("makeindex", "MakeIndex", "missing")];
    expect(findAuxiliaryTool("makeindex", custom)?.label).toBe("MakeIndex");
    expect(findAuxiliaryTool("bibtex", custom)).toBeNull();
  });

  it("tracks every known external capability as an explicit todo", () => {
    const kinds = DEFAULT_AUXILIARY_TOOLS.map((tool) => tool.kind);
    expect(kinds).toEqual([
      "bibtex",
      "biber",
      "makeindex",
      "makeglossaries",
      "shell-escape",
      "xetex",
      "luatex",
      "pythontex",
      "svg-converter",
    ]);
  });
});
