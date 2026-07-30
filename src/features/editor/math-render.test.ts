import { describe, expect, it, vi } from "vitest";
import { renderInlineMath } from "./math-render";

let throwError = false;

vi.mock("katex", () => ({
  default: {
    renderToString: (tex: string) => {
      if (throwError) throw new Error("ParseError");
      return `<span>rendered: ${tex}</span>`;
    },
  },
}));

vi.mock("katex/dist/katex.min.css", () => ({}));

describe("math-render", () => {
  it("renders math using KaTeX", async () => {
    throwError = false;
    const html = await renderInlineMath("E=mc^2");
    expect(html).toBe("<span>rendered: E=mc^2</span>");
  });

  it("uses the cached promise on subsequent calls", async () => {
    throwError = false;
    await renderInlineMath("x+y");
    const html = await renderInlineMath("x+y");
    expect(html).toBe("<span>rendered: x+y</span>");
  });

  it("uses escapeHtml when katex fails", async () => {
    throwError = true;
    const html = await renderInlineMath('E < "mc"&^2 > x');
    expect(html).toContain("E &lt; &quot;mc&quot;&amp;^2 &gt; x");
  });
});
