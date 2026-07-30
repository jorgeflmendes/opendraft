// Curated high-frequency LaTeX commands for autocomplete. This intentionally
// favors fast, useful suggestions over exhaustive package documentation.

export type CommandKind =
  | "greek"
  | "operator"
  | "bigop"
  | "relation"
  | "arrow"
  | "set"
  | "delimiter"
  | "function"
  | "environment"
  | "structure"
  | "format"
  | "construct";

export interface LatexCommand {
  label: string;
  /** CodeMirror snippet body; `${N:default}` marks a placeholder. */
  insert: string;
  detail: string;
  category: CommandKind;
}

const cmd = (
  label: string,
  insert: string,
  detail: string,
  category: CommandKind,
): LatexCommand => ({ label, insert, detail, category });

// -- Greek letters ----------------------------------------------
const GREEK_LOWER = [
  ["alpha", "α"],
  ["beta", "β"],
  ["gamma", "γ"],
  ["delta", "δ"],
  ["epsilon", "ε"],
  ["varepsilon", "ɛ"],
  ["zeta", "ζ"],
  ["eta", "η"],
  ["theta", "θ"],
  ["vartheta", "ϑ"],
  ["iota", "ι"],
  ["kappa", "κ"],
  ["lambda", "λ"],
  ["mu", "μ"],
  ["nu", "ν"],
  ["xi", "ξ"],
  ["pi", "π"],
  ["varpi", "ϖ"],
  ["rho", "ρ"],
  ["varrho", "ϱ"],
  ["sigma", "σ"],
  ["varsigma", "ς"],
  ["tau", "τ"],
  ["upsilon", "υ"],
  ["phi", "φ"],
  ["varphi", "ϕ"],
  ["chi", "χ"],
  ["psi", "ψ"],
  ["omega", "ω"],
] as const;
const GREEK_UPPER = [
  ["Gamma", "Γ"],
  ["Delta", "Δ"],
  ["Theta", "Θ"],
  ["Lambda", "Λ"],
  ["Xi", "Ξ"],
  ["Pi", "Π"],
  ["Sigma", "Σ"],
  ["Upsilon", "Υ"],
  ["Phi", "Φ"],
  ["Psi", "Ψ"],
  ["Omega", "Ω"],
] as const;

const greekCmds: LatexCommand[] = [
  ...GREEK_LOWER.map(([n, g]) => cmd(`\\${n}`, `\\${n}`, `Greek ${g}`, "greek")),
  ...GREEK_UPPER.map(([n, g]) => cmd(`\\${n}`, `\\${n}`, `Greek ${g}`, "greek")),
];

// -- Operators (named) ------------------------------------------
const OPERATORS = [
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "arcsin",
  "arccos",
  "arctan",
  "sinh",
  "cosh",
  "tanh",
  "coth",
  "log",
  "ln",
  "exp",
  "lim",
  "limsup",
  "liminf",
  "max",
  "min",
  "sup",
  "inf",
  "arg",
  "det",
  "dim",
  "ker",
  "gcd",
  "deg",
  "hom",
];
const operatorCmds: LatexCommand[] = OPERATORS.map((n) =>
  cmd(`\\${n}`, `\\${n}`, `${n} operator`, "operator"),
);

// -- Big operators ----------------------------------------------
const bigOps: LatexCommand[] = [
  cmd("\\sum", "\\sum_{${1:i=0}}^{${2:n}}", "Summation", "bigop"),
  cmd("\\prod", "\\prod_{${1:i=1}}^{${2:n}}", "Product", "bigop"),
  cmd("\\int", "\\int_{${1:a}}^{${2:b}}", "Integral", "bigop"),
  cmd("\\iint", "\\iint", "Double integral", "bigop"),
  cmd("\\iiint", "\\iiint", "Triple integral", "bigop"),
  cmd("\\oint", "\\oint", "Contour integral", "bigop"),
  cmd("\\bigcup", "\\bigcup_{${1:i}}", "Big union", "bigop"),
  cmd("\\bigcap", "\\bigcap_{${1:i}}", "Big intersection", "bigop"),
  cmd("\\bigoplus", "\\bigoplus", "Big oplus", "bigop"),
  cmd("\\bigotimes", "\\bigotimes", "Big otimes", "bigop"),
];

// -- Relations --------------------------------------------------
const RELATIONS = [
  ["leq", "≤"],
  ["geq", "≥"],
  ["neq", "≠"],
  ["approx", "≈"],
  ["equiv", "≡"],
  ["sim", "∼"],
  ["simeq", "≃"],
  ["cong", "≅"],
  ["propto", "∝"],
  ["in", "∈"],
  ["notin", "∉"],
  ["ni", "∋"],
  ["subset", "⊂"],
  ["supset", "⊃"],
  ["subseteq", "⊆"],
  ["supseteq", "⊇"],
  ["preceq", "⪯"],
  ["succeq", "⪰"],
  ["parallel", "∥"],
  ["perp", "⊥"],
] as const;
const relationCmds: LatexCommand[] = RELATIONS.map(([n, g]) =>
  cmd(`\\${n}`, `\\${n}`, `Relation ${g}`, "relation"),
);

// -- Arrows -----------------------------------------------------
const ARROWS = [
  ["to", "->"],
  ["rightarrow", "->"],
  ["leftarrow", "←"],
  ["leftrightarrow", "↔"],
  ["Rightarrow", "⇒"],
  ["Leftarrow", "⇐"],
  ["Leftrightarrow", "⇔"],
  ["mapsto", "↦"],
  ["uparrow", "↑"],
  ["downarrow", "↓"],
  ["longrightarrow", "⟶"],
  ["longleftarrow", "⟵"],
  ["hookrightarrow", "↪"],
] as const;
const arrowCmds: LatexCommand[] = ARROWS.map(([n, g]) =>
  cmd(`\\${n}`, `\\${n}`, `Arrow ${g}`, "arrow"),
);

// -- Number sets ------------------------------------------------
const sets: LatexCommand[] = [
  cmd("\\mathbb{R}", "\\mathbb{R}", "Real numbers ℝ", "set"),
  cmd("\\mathbb{N}", "\\mathbb{N}", "Naturals ℕ", "set"),
  cmd("\\mathbb{Z}", "\\mathbb{Z}", "Integers ℤ", "set"),
  cmd("\\mathbb{Q}", "\\mathbb{Q}", "Rationals ℚ", "set"),
  cmd("\\mathbb{C}", "\\mathbb{C}", "Complex ℂ", "set"),
  cmd("\\mathbb{F}", "\\mathbb{F}", "Field 𝔽", "set"),
  cmd("\\mathbb{P}", "\\mathbb{P}", "Primes / Probability ℙ", "set"),
  cmd("\\emptyset", "\\emptyset", "Empty set ∅", "set"),
];

// -- Delimiters & misc symbols ----------------------------------
const delimiters: LatexCommand[] = [
  cmd("\\left", "\\left", "Auto-sized left delim", "delimiter"),
  cmd("\\right", "\\right", "Auto-sized right delim", "delimiter"),
  cmd("\\langle", "\\langle", "Left angle ⟨", "delimiter"),
  cmd("\\rangle", "\\rangle", "Right angle ⟩", "delimiter"),
  cmd("\\lceil", "\\lceil", "Left ceiling ⌈", "delimiter"),
  cmd("\\rceil", "\\rceil", "Right ceiling ⌉", "delimiter"),
  cmd("\\lfloor", "\\lfloor", "Left floor ⌊", "delimiter"),
  cmd("\\rfloor", "\\rfloor", "Right floor ⌋", "delimiter"),
  cmd("\\|", "\\|", "Double vertical ‖", "delimiter"),
  cmd("\\infty", "\\infty", "Infinity ∞", "delimiter"),
  cmd("\\partial", "\\partial", "Partial ∂", "delimiter"),
  cmd("\\nabla", "\\nabla", "Nabla ∇", "delimiter"),
  cmd("\\forall", "\\forall", "For all ∀", "delimiter"),
  cmd("\\exists", "\\exists", "Exists ∃", "delimiter"),
  cmd("\\cdot", "\\cdot", "Center dot ⋅", "delimiter"),
  cmd("\\cdots", "\\cdots", "Center ellipsis ⋯", "delimiter"),
  cmd("\\ldots", "\\ldots", "Lower ellipsis ...", "delimiter"),
  cmd("\\times", "\\times", "Cross ×", "delimiter"),
  cmd("\\pm", "\\pm", "Plus-minus ±", "delimiter"),
  cmd("\\mp", "\\mp", "Minus-plus ∓", "delimiter"),
];

// -- Common math constructs (with placeholders) -----------------
const constructs: LatexCommand[] = [
  cmd("\\frac", "\\frac{${1:num}}{${2:den}}", "Fraction", "construct"),
  cmd("\\sqrt", "\\sqrt{${1:x}}", "Square root", "construct"),
  cmd("\\sqrt[n]", "\\sqrt[${1:n}]{${2:x}}", "n-th root", "construct"),
  cmd("\\binom", "\\binom{${1:n}}{${2:k}}", "Binomial coefficient", "construct"),
  cmd("\\overline", "\\overline{${1:x}}", "Overline", "construct"),
  cmd("\\underline", "\\underline{${1:x}}", "Underline", "construct"),
  cmd("\\hat", "\\hat{${1:x}}", "Hat", "construct"),
  cmd("\\bar", "\\bar{${1:x}}", "Bar", "construct"),
  cmd("\\vec", "\\vec{${1:x}}", "Vector arrow", "construct"),
  cmd("\\tilde", "\\tilde{${1:x}}", "Tilde", "construct"),
  cmd("\\dot", "\\dot{${1:x}}", "Dot", "construct"),
  cmd("\\ddot", "\\ddot{${1:x}}", "Double dot", "construct"),
];

// -- Environments (snippets) ------------------------------------
const envs: LatexCommand[] = [
  cmd(
    "\\begin{equation}",
    "\\begin{equation}\n  ${1:body}\n\\end{equation}",
    "Numbered equation",
    "environment",
  ),
  cmd(
    "\\begin{align}",
    "\\begin{align}\n  ${1:lhs} &= ${2:rhs}\n\\end{align}",
    "Aligned equations",
    "environment",
  ),
  cmd(
    "\\begin{itemize}",
    "\\begin{itemize}\n  \\item ${1:first}\n\\end{itemize}",
    "Bullet list",
    "environment",
  ),
  cmd(
    "\\begin{enumerate}",
    "\\begin{enumerate}\n  \\item ${1:first}\n\\end{enumerate}",
    "Numbered list",
    "environment",
  ),
  cmd(
    "\\begin{figure}",
    "\\begin{figure}[${1:ht}]\n  \\centering\n  ${2:body}\n  \\caption{${3:caption}}\n\\end{figure}",
    "Figure",
    "environment",
  ),
  cmd(
    "\\begin{table}",
    "\\begin{table}[${1:ht}]\n  \\centering\n  ${2:body}\n  \\caption{${3:caption}}\n\\end{table}",
    "Table",
    "environment",
  ),
  cmd(
    "\\begin{theorem}",
    "\\begin{theorem}\n  ${1:body}\n\\end{theorem}",
    "Theorem",
    "environment",
  ),
  cmd("\\begin{proof}", "\\begin{proof}\n  ${1:body}\n\\end{proof}", "Proof", "environment"),
  cmd(
    "\\begin{cases}",
    "\\begin{cases}\n  ${1:case_1} &\\text{if } ${2:cond} \\\\\n  ${3:case_2} &\\text{otherwise}\n\\end{cases}",
    "Cases",
    "environment",
  ),
  cmd(
    "\\begin{matrix}",
    "\\begin{${1:matrix}}\n  ${2:a} & ${3:b} \\\\\n  ${4:c} & ${5:d}\n\\end{${1:matrix}}",
    "Matrix",
    "environment",
  ),
];

// -- Document structure -----------------------------------------
const structure: LatexCommand[] = [
  cmd("\\section", "\\section{${1:Title}}", "Section heading", "structure"),
  cmd("\\subsection", "\\subsection{${1:Title}}", "Subsection heading", "structure"),
  cmd("\\subsubsection", "\\subsubsection{${1:Title}}", "Subsubsection heading", "structure"),
  cmd("\\chapter", "\\chapter{${1:Title}}", "Chapter heading", "structure"),
  cmd("\\paragraph", "\\paragraph{${1:Title}}", "Paragraph heading", "structure"),
  cmd("\\title", "\\title{${1:Title}}", "Document title", "structure"),
  cmd("\\author", "\\author{${1:Name}}", "Document author", "structure"),
  cmd("\\date", "\\date{${1:\\today}}", "Document date", "structure"),
  cmd("\\maketitle", "\\maketitle", "Render the title block", "structure"),
  cmd("\\tableofcontents", "\\tableofcontents", "Render the TOC", "structure"),
  cmd("\\label", "\\label{${1:key}}", "Cross-ref label", "structure"),
  cmd("\\ref", "\\ref{${1:key}}", "Cross-ref", "structure"),
  cmd("\\eqref", "\\eqref{${1:key}}", "Equation reference", "structure"),
  cmd("\\cite", "\\cite{${1:key}}", "Citation", "structure"),
  cmd("\\bibliography", "\\bibliography{${1:refs}}", "BibTeX database", "structure"),
  cmd("\\usepackage", "\\usepackage{${1:pkg}}", "Load a package", "structure"),
  cmd("\\documentclass", "\\documentclass[${1:11pt}]{${2:article}}", "Document class", "structure"),
];

// -- Text formatting --------------------------------------------
const formatting: LatexCommand[] = [
  cmd("\\textbf", "\\textbf{${1:bold}}", "Bold text", "format"),
  cmd("\\textit", "\\textit{${1:italic}}", "Italic text", "format"),
  cmd("\\emph", "\\emph{${1:emphasised}}", "Emphasis", "format"),
  cmd("\\texttt", "\\texttt{${1:mono}}", "Monospace text", "format"),
  cmd("\\underline", "\\underline{${1:text}}", "Underlined text", "format"),
  cmd("\\footnote", "\\footnote{${1:note}}", "Footnote", "format"),
];

export const LATEX_COMMANDS: ReadonlyArray<LatexCommand> = [
  ...greekCmds,
  ...operatorCmds,
  ...bigOps,
  ...relationCmds,
  ...arrowCmds,
  ...sets,
  ...delimiters,
  ...constructs,
  ...envs,
  ...structure,
  ...formatting,
];

export function matchCommands(prefix: string, limit = 50): LatexCommand[] {
  const p = prefix.toLowerCase();
  const out: LatexCommand[] = [];
  for (const c of LATEX_COMMANDS) {
    if (c.label.toLowerCase().startsWith(p)) {
      out.push(c);
      if (out.length >= limit) break;
    }
  }
  return out;
}
