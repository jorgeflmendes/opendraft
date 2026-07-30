import { hoverTooltip, type Tooltip } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { renderInlineMath } from "./math-render";

// Hover anywhere inside a $...$ math run and a small tooltip pops
// up showing the same math rendered by KaTeX. Lets the user check
// what they're typing without running a compile.

export interface MathRange {
  from: number;
  to: number;
  latex: string;
}

/**
 * Find the $...$ pair (if any) whose interior contains the given
 * offset. Returns null when the cursor is in prose or inside an
 * unterminated math run.
 *
 * Pure helper exported for tests.
 */
export function findMathRangeAt(state: EditorState, pos: number): MathRange | null {
  if (pos < 0 || pos > state.doc.length) return null;
  const line = state.doc.lineAt(pos);
  const text = line.text;
  const linePosition = pos - line.from;

  // Walk left, counting dollar signs we cross. Inside math iff odd.
  let openAt = -1;
  let inMath = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "$" && text[i - 1] !== "\\") {
      if (!inMath) {
        if (i > linePosition) break;
        openAt = i;
        inMath = true;
      } else {
        // Closing dollar - if pos was between open and close,
        // we're done. Otherwise reset.
        if (openAt < linePosition && linePosition <= i) {
          return {
            from: line.from + openAt,
            to: line.from + i,
            latex: text.slice(openAt + 1, i),
          };
        }
        inMath = false;
        openAt = -1;
      }
    }
  }
  return null;
}

export function mathHoverExtension(): Extension {
  return hoverTooltip(
    (view, pos): Tooltip | null => {
      const range = findMathRangeAt(view.state, pos);
      if (!range || range.latex.trim() === "") return null;
      return {
        pos: range.from,
        end: range.to + 1,
        above: true,
        create: () => {
          const dom = document.createElement("div");
          dom.className = "od-math-hover";
          dom.textContent = `$${range.latex}$`;
          void renderInlineMath(range.latex).then((html) => {
            dom.innerHTML = html;
          });
          return { dom };
        },
      };
    },
    { hideOnChange: true, hoverTime: 250 },
  );
}
