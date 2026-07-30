import type katexModule from "katex";

type Katex = typeof katexModule;

let katexPromise: Promise<Katex> | undefined;

export async function renderInlineMath(latex: string): Promise<string> {
  try {
    const katex = await loadKatex();
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
      output: "html",
      strict: "ignore",
    });
  } catch {
    return `<span class="od-math-fallback">$${escapeHtml(latex)}$</span>`;
  }
}

function loadKatex(): Promise<Katex> {
  katexPromise ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")])
    .then(([module]) => module.default)
    .catch((error: unknown) => {
      katexPromise = undefined;
      throw error;
    });
  return katexPromise;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
