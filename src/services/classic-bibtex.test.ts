import { describe, expect, it } from "vitest";
import type { Project } from "@/domain";
import { generateClassicBibtexBbl, parseBibEntries } from "./classic-bibtex";

const project = (
  main: string,
  extras: Project["files"] = {
    "refs.bib": {
      id: "refs",
      path: "refs.bib",
      name: "refs.bib",
      kind: "bib",
      content: `@article{a,
        author = {Ada Lovelace and Alan Turing},
        title = {Computing Notes},
        journal = {Annals of Computation},
        year = {1950},
        volume = {1},
        pages = {1--9},
      }

      @book{b,
        author = {Donald Knuth},
        title = {The TeXbook},
        publisher = {Addison-Wesley},
        year = {1984},
      }`,
    },
  },
): Project => ({
  id: "p",
  name: "P",
  entry: "main.tex",
  createdAt: "2026-05-23T00:00:00.000Z",
  folders: {},
  files: {
    "main.tex": {
      id: "main",
      path: "main.tex",
      name: "main.tex",
      kind: "tex",
      content: main,
    },
    ...extras,
  },
});

describe("classic BibTeX fallback", () => {
  it("returns null when the entry file is missing", () => {
    const p = project("\\bibliography{refs}");
    delete p.files["main.tex"];

    expect(generateClassicBibtexBbl(p, undefined)).toBeNull();
  });

  it("returns null when the document has no bibliography command", () => {
    expect(generateClassicBibtexBbl(project("\\begin{document}Hi\\end{document}"), undefined)).toBe(
      null,
    );
  });

  it("generates a main.bbl from cited entries in citation order", () => {
    const output = generateClassicBibtexBbl(
      project("\\cite{b}\\cite{missing,a}\\bibliography{refs}"),
      undefined,
    );

    expect(output?.path).toBe("main.bbl");
    expect(output?.content).toContain("\\begin{thebibliography}{2}");
    expect(output?.content.indexOf("\\bibitem{b}")).toBeLessThan(
      output!.content.indexOf("\\bibitem{a}"),
    );
    expect(output?.content).toContain("\\emph{The TeXbook}");
    expect(output?.content).not.toContain("\\bibitem{missing}");
    expect(output?.log.some((entry) => /Citation 'missing'/.test(entry.message))).toBe(true);
  });

  it("includes every bib entry when there are no citation commands", () => {
    const output = generateClassicBibtexBbl(project("\\bibliography{refs}"), undefined);

    expect(output?.content).toContain("\\bibitem{a}");
    expect(output?.content).toContain("\\bibitem{b}");
    expect(output?.log.some((entry) => entry.level === "info")).toBe(true);
  });

  it("supports nocite star and edited bib file contents", () => {
    const output = generateClassicBibtexBbl(project("\\nocite{*}\\bibliography{refs}"), {
      "refs.bib": "@misc{edited, title = {Edited Entry}, year = 2026}",
    });

    expect(output?.content).toContain("\\bibitem{edited}");
    expect(output?.content).toContain("Edited Entry.");
  });

  it("does not overwrite a user-provided bbl", () => {
    const output = generateClassicBibtexBbl(
      project("\\bibliography{refs}", {
        "refs.bib": {
          id: "refs",
          path: "refs.bib",
          name: "refs.bib",
          kind: "bib",
          content: "@misc{x, title={X}}",
        },
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

    expect(output).toBeNull();
  });

  it("warns and emits an empty bbl when the database is missing", () => {
    const output = generateClassicBibtexBbl(project("\\bibliography{missing}", {}), undefined);

    expect(output?.content).toBe("\\begin{thebibliography}{1}\n\\end{thebibliography}\n");
    expect(output?.log[0]).toMatchObject({ level: "warn" });
  });

  it("resolves bibliography files relative to an entry in a subfolder", () => {
    const p = project("\\bibliography{refs}", {});
    p.entry = "chapters/main.tex";
    p.files = {
      "chapters/main.tex": {
        id: "main",
        path: "chapters/main.tex",
        name: "main.tex",
        kind: "tex",
        content: "\\bibliography{refs,refs}",
      },
      "chapters/refs.bib": {
        id: "refs",
        path: "chapters/refs.bib",
        name: "refs.bib",
        kind: "bib",
        content: "@misc{x, title = {Relative Ref}, year = 2026}",
      },
    };

    const output = generateClassicBibtexBbl(p, undefined);

    expect(output?.path).toBe("chapters/main.bbl");
    expect(output?.content).toContain("\\bibitem{x}");
    expect(output?.log.some((entry) => /chapters\/refs\.bib/.test(entry.message))).toBe(true);
  });

  it("renders common non-article entry shapes and URL-like fields", () => {
    const output = generateClassicBibtexBbl(
      project("\\bibliography{refs}", {
        "refs.bib": {
          id: "refs",
          path: "refs.bib",
          name: "refs.bib",
          kind: "bib",
          content: `
            @manual{manual, title={Manual!}, organization={Org}, url={https://example.test}}
            @inproceedings{conf, editor={E. Editor}, booktitle={Conference}, publisher={Pub}, pages={10--20}, doi={10/test}}
            @misc{misc, howpublished={Online}, note={Already done.}}
          `,
        },
      }),
      undefined,
    );

    expect(output?.content).toContain("\\emph{Manual!}");
    expect(output?.content).toContain("\\texttt{https://example.test}");
    expect(output?.content).toContain("In \\emph{Conference}");
    expect(output?.content).toContain("\\texttt{10/test}");
    expect(output?.content).toContain("Already done.");
  });
});

describe("parseBibEntries", () => {
  it("parses braced, quoted, parenthesized, and concatenated fields", () => {
    const entries = parseBibEntries(`
      @string{j = {Journal}}
      @article(foo,
        title = "A " # {Nested {Title}},
        journal = {J},
        year = 2026
      )
    `);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "article",
      key: "foo",
      fields: {
        title: "A Nested Title",
        journal: "J",
        year: "2026",
      },
    });
  });

  it("skips malformed entries and stops cleanly on unterminated entries", () => {
    expect(parseBibEntries("@article{noComma}")).toEqual([]);
    expect(parseBibEntries("@article{, title={No Key}}")).toEqual([]);
    expect(parseBibEntries("@article{bad, title {missing equals}}")).toEqual([
      { type: "article", key: "bad", fields: {}, order: 0 },
    ]);
    expect(parseBibEntries("@article")).toEqual([]);
    expect(parseBibEntries("@article{bad, title={Never closed}")).toEqual([]);
  });

  it("parses quoted values with nested braces and bare tokens", () => {
    const entries = parseBibEntries(
      '@misc{x, title = "Quoted {Nested} Title", note = bare-token, url = "https://x.test"}',
    );

    expect(entries[0]?.fields).toMatchObject({
      title: "Quoted Nested Title",
      note: "bare-token",
      url: "https://x.test",
    });
  });
});
