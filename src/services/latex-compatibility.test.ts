import { describe, expect, it } from "vitest";
import type { Project } from "@/domain";
import { analyseServerlessCompatibility, BUSYTEX_CAPABILITIES } from "./latex-compatibility";

const project = (content: string, extras: Project["files"] = {}): Project => ({
  id: "p",
  name: "P",
  entry: "main.tex",
  files: {
    "main.tex": {
      id: "main",
      path: "main.tex",
      name: "main.tex",
      kind: "tex",
      content,
    },
    ...extras,
  },
  folders: {},
  createdAt: "2026-05-23T00:00:00Z",
});

describe("serverless LaTeX compatibility analysis", () => {
  it("allows plain pdfLaTeX documents", () => {
    expect(
      analyseServerlessCompatibility(
        project("\\documentclass{article}\\begin{document}Hi\\end{document}"),
        undefined,
      ),
    ).toEqual([]);
  });

  it("detects XeTeX/LuaTeX package requirements and magic comments", () => {
    const issues = analyseServerlessCompatibility(
      project("% !TEX program = lualatex\n\\usepackage{fontspec,unicode-math}"),
      undefined,
    );

    expect(issues.map((issue) => issue.tool)).toEqual(["luatex", "xetex", "luatex"]);
    expect(issues[0]).toMatchObject({ line: 1, filePath: "main.tex" });
  });

  it("detects shell escape and external-program packages", () => {
    const issues = analyseServerlessCompatibility(
      project("\\usepackage{minted}\n\\usepackage{gnuplottex}\n\\immediate\\write18{echo nope}"),
      undefined,
    );

    expect(issues).toHaveLength(3);
    expect(issues.every((issue) => issue.tool === "shell-escape")).toBe(true);
  });

  it("detects Lua-only package requirements when LuaLaTeX is unavailable", () => {
    const issues = analyseServerlessCompatibility(project("\\usepackage{luacode}"), undefined);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ tool: "luatex" });
  });

  it("detects Python, SVG, and biber-only workflows", () => {
    const issues = analyseServerlessCompatibility(
      project(
        "\\usepackage{pythontex}\n\\usepackage{svg}\n\\includesvg{diagram}\n\\usepackage{biblatex}",
      ),
      undefined,
    );

    expect(issues.map((issue) => issue.tool)).toEqual(["pythontex", "svg-converter", "biber"]);
  });

  it("allows classic BibTeX because a serverless bbl fallback is generated", () => {
    const issues = analyseServerlessCompatibility(project("\\bibliography{refs}"), undefined);

    expect(issues).toEqual([]);
  });

  it("allows classic bibliography when a generated bbl is part of the project", () => {
    const issues = analyseServerlessCompatibility(
      project("\\bibliography{refs}", {
        "main.bbl": {
          id: "bbl",
          path: "main.bbl",
          name: "main.bbl",
          kind: "tex",
          content: "\\begin{thebibliography}{1}\\end{thebibliography}",
        },
      }),
      undefined,
    );

    expect(issues).toEqual([]);
  });

  it("detects MakeIndex and glossary workflows", () => {
    const issues = analyseServerlessCompatibility(
      project("\\makeindex\n\\printglossaries"),
      undefined,
    );

    expect(issues.map((issue) => issue.tool)).toEqual(["makeglossaries", "makeindex"]);
  });

  it("allows XeTeX, LuaTeX, MakeIndex, and BibTeX-backed biblatex when BusyTeX is active", () => {
    const issues = analyseServerlessCompatibility(
      project(
        "% !TEX program = xelatex\n\\usepackage{fontspec,luacode}\n\\makeindex\n\\usepackage[backend=bibtex]{biblatex}",
      ),
      undefined,
      BUSYTEX_CAPABILITIES,
    );

    expect(issues).toEqual([]);
  });

  it("scans RequirePackage in auxiliary TeX files instead of only the main file", () => {
    const issues = analyseServerlessCompatibility(
      project("\\input{preamble}", {
        "preamble.sty": {
          id: "sty",
          path: "preamble.sty",
          name: "preamble.sty",
          kind: "sty",
          content: "\\RequirePackage{fontspec}",
        },
      }),
      undefined,
    );

    expect(issues.map((issue) => issue.tool)).toEqual(["xetex"]);
  });

  it("ignores engine magic comments outside the root document", () => {
    const issues = analyseServerlessCompatibility(
      project("\\input{chapter}", {
        "chapter.tex": {
          id: "chapter",
          path: "chapter.tex",
          name: "chapter.tex",
          kind: "tex",
          content: "% !TEX program = lualatex\nBody",
        },
      }),
      undefined,
    );

    expect(issues).toEqual([]);
  });

  it("allows no-index glossaries and pregenerated glossary outputs", () => {
    expect(
      analyseServerlessCompatibility(
        project("\\usepackage{glossaries}\\makenoidxglossaries\\printnoidxglossary"),
        undefined,
      ),
    ).toEqual([]);

    expect(
      analyseServerlessCompatibility(
        project("\\usepackage{glossaries}\\printglossaries", {
          "main.gls": {
            id: "gls",
            path: "main.gls",
            name: "main.gls",
            kind: "other",
            content: "\\glossarysection{}",
          },
        }),
        undefined,
      ),
    ).toEqual([]);
  });

  it("allows biber-style biblatex when a generated bbl is present", () => {
    const issues = analyseServerlessCompatibility(
      project("\\usepackage{biblatex}\\addbibresource{refs.bib}\\printbibliography", {
        "main.bbl": {
          id: "bbl",
          path: "main.bbl",
          name: "main.bbl",
          kind: "tex",
          content: "\\begingroup\\endgroup",
        },
      }),
      undefined,
      BUSYTEX_CAPABILITIES,
    );

    expect(issues).toEqual([]);
  });

  it("allows biblatex when no backend is needed or biber is available", () => {
    expect(
      analyseServerlessCompatibility(
        project("\\usepackage[backend=none]{biblatex}\\printbibliography"),
        undefined,
        BUSYTEX_CAPABILITIES,
      ),
    ).toEqual([]);

    expect(
      analyseServerlessCompatibility(
        project("\\usepackage{biblatex}\\addbibresource{refs.bib}\\printbibliography"),
        undefined,
        { ...BUSYTEX_CAPABILITIES, biber: true },
      ),
    ).toEqual([]);
  });

  it("allows minted frozen caches and preconverted SVG companions", () => {
    const issues = analyseServerlessCompatibility(
      project("\\usepackage[frozencache]{minted}\n\\usepackage{svg}\n\\includesvg{figures/plot}", {
        "_minted-main/default.pygstyle": {
          id: "style",
          path: "_minted-main/default.pygstyle",
          name: "default.pygstyle",
          kind: "other",
          content: "cached style",
        },
        "figures/plot.pdf": {
          id: "pdf",
          path: "figures/plot.pdf",
          name: "plot.pdf",
          kind: "other",
          content: "%PDF",
        },
      }),
      undefined,
      BUSYTEX_CAPABILITIES,
    );

    expect(issues).toEqual([]);
  });

  it("resolves SVG companions through relative paths and explicit no-convert options", () => {
    expect(
      analyseServerlessCompatibility(
        project("\\input{chapters/section}", {
          "chapters/section.tex": {
            id: "section",
            path: "chapters/section.tex",
            name: "section.tex",
            kind: "tex",
            content: "\\usepackage{svg}\n\\includesvg{../figures/plot.svg}\n\\includesvg{./local}",
          },
          "figures/plot.pdf": {
            id: "plot",
            path: "figures/plot.pdf",
            name: "plot.pdf",
            kind: "other",
            content: "%PDF",
          },
          "chapters/local.pdf_tex": {
            id: "local",
            path: "chapters/local.pdf_tex",
            name: "local.pdf_tex",
            kind: "other",
            content: "\\includegraphics{local.pdf}",
          },
        }),
        undefined,
        BUSYTEX_CAPABILITIES,
      ),
    ).toEqual([]);

    expect(
      analyseServerlessCompatibility(
        project("\\usepackage[inkscape=false]{svg}\\includesvg{source-only}"),
        undefined,
        BUSYTEX_CAPABILITIES,
      ),
    ).toEqual([]);
  });

  it("still blocks biber and shell escape when BusyTeX is active", () => {
    const issues = analyseServerlessCompatibility(
      project("\\usepackage{biblatex}\n\\usepackage{minted}"),
      undefined,
      BUSYTEX_CAPABILITIES,
    );

    expect(issues.map((issue) => issue.tool)).toEqual(["biber", "shell-escape"]);
  });

  it("uses edit overlays when analysing compatibility", () => {
    const p = project("\\documentclass{article}");
    const issues = analyseServerlessCompatibility(p, {
      "main.tex": "\\usepackage{minted}",
    });

    expect(issues[0]?.tool).toBe("shell-escape");
  });
});
