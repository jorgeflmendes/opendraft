import { describe, it, expect } from "vitest";
import { bibEntrySummary, parseBib } from "./parse";

describe("parseBib", () => {
  it("returns an empty list for an empty source", () => {
    expect(parseBib("")).toEqual([]);
    expect(parseBib("just text, no @ symbols at all")).toEqual([]);
  });

  it("parses a single article with brace-delimited fields", () => {
    const src = `
@article{ay2020,
  author = {Alice and Bob},
  title  = {On Compactness in Hilbert Spaces},
  journal = {J. of Examples},
  year   = {2020},
  pages  = {1--12},
}
`;
    const [entry] = parseBib(src);
    expect(entry).toMatchObject({ type: "article", key: "ay2020" });
    expect(entry!.fields).toMatchObject({
      author: "Alice and Bob",
      title: "On Compactness in Hilbert Spaces",
      journal: "J. of Examples",
      year: "2020",
      pages: "1--12",
    });
    expect(entry!.line).toBeGreaterThan(0);
  });

  it("handles quote-delimited field values", () => {
    const src = `@misc{x, title = "A {nested} thing", year = 2021}`;
    const [entry] = parseBib(src);
    expect(entry!.fields.title).toBe("A {nested} thing");
    expect(entry!.fields.year).toBe("2021");
  });

  it("captures multiple entries in source order", () => {
    const src = `
@book{a, title={A}, year=2001}
@article{b, title={B}, year=2002}
@inproceedings{c, title={C}, year=2003}
`;
    const entries = parseBib(src);
    expect(entries.map((e) => e.key)).toEqual(["a", "b", "c"]);
    expect(entries.map((e) => e.type)).toEqual(["book", "article", "inproceedings"]);
  });

  it("resolves @string macros referenced by later entries", () => {
    const src = `
@string{jpub = "Journal of Publications"}
@article{x, journal = jpub, year = 2024}
`;
    const entries = parseBib(src);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.fields.journal).toBe("Journal of Publications");
  });

  it("supports field concatenation with the # operator", () => {
    const src = `
@string{jpub = "Journal of"}
@article{x, journal = jpub # " Things"}
`;
    const [entry] = parseBib(src);
    expect(entry!.fields.journal).toBe("Journal of Things");
  });

  it("skips @preamble and @comment without producing an entry", () => {
    const src = `
@preamble{ "\\providecommand{\\noopsort}[1]{}" }
@comment{ this should disappear }
@article{kept, title={Kept}}
`;
    const entries = parseBib(src);
    expect(entries.map((e) => e.key)).toEqual(["kept"]);
  });

  it("accepts parenthesis-delimited entries", () => {
    const src = `@article(paren, title = {Round brace})`;
    const [entry] = parseBib(src);
    expect(entry).toMatchObject({ key: "paren", type: "article" });
    expect(entry!.fields.title).toBe("Round brace");
  });

  it("skips a malformed entry and keeps parsing the next one", () => {
    const src = `
@junk this is broken
@article{ok, title = {Survived}}
`;
    const entries = parseBib(src);
    expect(entries.map((e) => e.key)).toEqual(["ok"]);
  });

  it("tolerates a missing trailing comma on the last field", () => {
    const src = `@article{x, title = {Last}, year = {2020} }`;
    const [entry] = parseBib(src);
    expect(entry!.fields.year).toBe("2020");
  });

  it("collapses internal whitespace inside braced values", () => {
    const src = `@article{x, title = {Multi\n  line\n  title} }`;
    const [entry] = parseBib(src);
    expect(entry!.fields.title).toBe("Multi line title");
  });

  it("lowercases field names but preserves cite key casing", () => {
    const src = `@article{CamelKey, Title = {T}, AUTHOR = {A}}`;
    const [entry] = parseBib(src);
    expect(entry!.key).toBe("CamelKey");
    expect(entry!.fields.title).toBe("T");
    expect(entry!.fields.author).toBe("A");
  });
});

describe("bibEntrySummary", () => {
  it("renders title - surname (year) when all three are present", () => {
    const src = `@article{x, title={On Things}, author={Alice Smith and Bob Jones}, year={2024}}`;
    const [entry] = parseBib(src);
    expect(bibEntrySummary(entry!)).toBe("On Things - Smith et al. (2024)");
  });

  it("handles surname-first author form", () => {
    const src = `@article{x, title={T}, author={Smith, Alice}, year={2024}}`;
    const [entry] = parseBib(src);
    expect(bibEntrySummary(entry!)).toBe("T - Smith (2024)");
  });

  it("falls back to the cite key when no title is present", () => {
    const src = `@misc{just-a-key, year={2020}}`;
    const [entry] = parseBib(src);
    expect(bibEntrySummary(entry!)).toContain("(2020)");
  });

  it("returns the bare cite key for a totally empty entry", () => {
    const src = `@misc{bare}`;
    const [entry] = parseBib(src);
    expect(bibEntrySummary(entry!)).toBe("bare");
  });
});
