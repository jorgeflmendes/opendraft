import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { LATEX_COMMANDS, matchCommands } from "./latex-commands";
import { citeCompletionSource } from "./cite-completion";
import { refCompletionSource } from "./ref-completion";
import { fileCompletionSource } from "./file-completion";

// CodeMirror autocomplete wired against LATEX_COMMANDS. The source
// matches a backslash followed by zero or more word chars at the
// cursor - that's the standard LaTeX command prefix. Snippets are
// emitted via snippetCompletion() so placeholder navigation works.

const BACKSLASH_RE = /\\[A-Za-z@*]*/;

/** Returns the entries shown for the given prefix. Pure so tests
 *  can verify the popup contents without spinning up CodeMirror. */
export function buildCompletions(prefix: string, limit = 50): Completion[] {
  const matches = matchCommands(prefix, limit);
  return matches.map((c) => {
    const detail = c.category;
    // Detect snippet syntax - entries with `${N:` need the snippet
    // helper for placeholder navigation.
    if (c.insert.includes("${")) {
      return snippetCompletion(c.insert, {
        label: c.label,
        detail,
        info: c.detail,
        type: "keyword",
      });
    }
    return {
      label: c.label,
      detail,
      info: c.detail,
      type: "keyword",
      apply: c.insert,
    };
  });
}

/** Completion source CodeMirror calls on every keystroke. */
export function latexCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(BACKSLASH_RE);
  if (!word) return null;
  // Don't auto-popup on a bare cursor; only show explicit results
  // once a backslash is typed. `explicit` opens it via Ctrl+Space.
  if (word.from === word.to && !context.explicit) return null;
  const options = buildCompletions(word.text);
  if (options.length === 0) return null;
  return {
    from: word.from,
    to: word.to,
    options,
    validFor: BACKSLASH_RE,
  };
}

/** Extension bundle: autocompletion + LaTeX command source +
 *  cite-key source + \ref source. CodeMirror
 *  picks whichever source returns a non-null result for the
 *  current context - backslash-led commands, \cite{...}, and
 *  \ref{...} arguments never overlap, so the sources don't
 *  collide. */
export function latexAutocompleteExtension(): Extension {
  return autocompletion({
    override: [
      latexCompletionSource,
      citeCompletionSource,
      refCompletionSource,
      fileCompletionSource,
    ],
    closeOnBlur: true,
    activateOnTyping: true,
    icons: false,
    maxRenderedOptions: 50,
  });
}

// Re-export the dictionary too so consumers (symbol palette, tests)
// don't have to reach into latex-commands directly.
export { LATEX_COMMANDS };
