import { describe, it, expect } from "vitest";
import { fuzzyMatch, rankByFuzzy } from "./match";

describe("fuzzyMatch", () => {
  it("returns a non-null match when every query char appears in order", () => {
    const result = fuzzyMatch("ftree", "FileTree.tsx");
    expect(result).not.toBeNull();
    expect(result!.indices).toEqual([0, 4, 5, 6, 7]); // F,T,r,e,e
  });

  it("returns null when a query char doesn't appear", () => {
    expect(fuzzyMatch("xyz", "main.tex")).toBeNull();
  });

  it("returns null when query chars appear but out of order", () => {
    expect(fuzzyMatch("zb", "abcd")).toBeNull();
  });

  it("scores contiguous matches higher than scattered ones", () => {
    const contiguous = fuzzyMatch("main", "main.tex");
    const scattered = fuzzyMatch("main", "m-a-i-n.tex");
    expect(contiguous!.score).toBeGreaterThan(scattered!.score);
  });

  it("boosts matches on word boundaries (after / or .)", () => {
    // 'i' after '/' is a word-boundary match; 'i' inside "list" is
    // mid-word. The boundary version should outscore the mid-word
    // one even though both are length-4 candidates.
    const wordBoundary = fuzzyMatch("i", "chapters/intro.tex");
    const midWord = fuzzyMatch("i", "list.tex");
    expect(wordBoundary).not.toBeNull();
    expect(midWord).not.toBeNull();
    expect(wordBoundary!.score).toBeGreaterThan(midWord!.score);
  });

  it("scores shorter candidates higher when match shape is equivalent", () => {
    // Both contain "main" contiguously at the start; the shorter
    // candidate should win on the length penalty.
    const shorter = fuzzyMatch("main", "main.tex");
    const longer = fuzzyMatch("main", "main-very-long-filename.tex");
    expect(shorter!.score).toBeGreaterThan(longer!.score);
  });

  it("is case-insensitive by default but rewards exact case matches slightly", () => {
    const exact = fuzzyMatch("FT", "FileTree.tsx");
    const inexact = fuzzyMatch("ft", "FileTree.tsx");
    expect(exact).not.toBeNull();
    expect(inexact).not.toBeNull();
    expect(exact!.score).toBeGreaterThan(inexact!.score);
  });

  it("treats an empty query as 'everything matches with neutral score'", () => {
    const result = fuzzyMatch("", "anything");
    expect(result).toEqual({ score: 1, indices: [] });
  });

  it("returns null when the candidate is shorter than the query", () => {
    expect(fuzzyMatch("longquery", "ab")).toBeNull();
  });
});

describe("rankByFuzzy", () => {
  it("orders best matches first and drops non-matches", () => {
    const items = ["main.tex", "chapters/intro.tex", "refs.bib", "preamble.sty"];
    const ranked = rankByFuzzy(items, "main", (s) => s);
    expect(ranked[0]!.item).toBe("main.tex");
    expect(ranked.map((r) => r.item)).not.toContain("refs.bib");
  });

  it("returns every item with neutral score when query is empty", () => {
    const items = ["a", "b", "c"];
    const ranked = rankByFuzzy(items, "", (s) => s);
    expect(ranked.map((r) => r.item)).toEqual(["a", "b", "c"]);
    expect(ranked.every((r) => r.match.score === 0)).toBe(true);
  });

  it("operates on a projection function for non-string items", () => {
    interface FileLike {
      path: string;
      size: number;
    }
    const items: FileLike[] = [
      { path: "main.tex", size: 1 },
      { path: "refs.bib", size: 2 },
    ];
    const ranked = rankByFuzzy(items, "main", (f) => f.path);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.item.path).toBe("main.tex");
  });

  it("does not mutate the input list", () => {
    const items = ["b", "a", "c"];
    const before = [...items];
    rankByFuzzy(items, "a", (s) => s);
    expect(items).toEqual(before);
  });
});
