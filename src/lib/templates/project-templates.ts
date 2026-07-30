// The blank seed is deliberately self-contained. Specialised templates may
// fetch their document classes and packages from CTAN on first compile.

export type ProjectTemplateId = "blank" | "amsart" | "beamer" | "acmart" | "thesis-memoir";

export interface ProjectTemplate {
  id: ProjectTemplateId;
  name: string;
  description: string;
  engine: "pdflatex" | "xelatex" | "lualatex";
}

export interface ProjectTemplateSeed {
  files: Record<string, string>;
  entry: string;
}

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    id: "blank",
    name: "Blank document",
    description: "Minimal article class - start from scratch.",
    engine: "pdflatex",
  },
  {
    id: "amsart",
    name: "AMS article",
    description: "amsart · 10pt · A4 - math-heavy submission shape.",
    engine: "pdflatex",
  },
  {
    id: "beamer",
    name: "Beamer slides",
    description: "Madrid theme · 4:3 · ready for a talk.",
    engine: "pdflatex",
  },
  {
    id: "acmart",
    name: "ACM article",
    description: "acmart · sigconf - pulled from CTAN on first compile.",
    engine: "pdflatex",
  },
  {
    id: "thesis-memoir",
    name: "Thesis chapter",
    description: "memoir · oneside - chapter scaffold + bibliography.",
    engine: "pdflatex",
  },
];

export function seedForTemplate(template: ProjectTemplateId, title: string): ProjectTemplateSeed {
  switch (template) {
    case "blank":
      return { files: { "main.tex": blankSeed(title) }, entry: "main.tex" };
    case "amsart":
      return { files: { "main.tex": amsartSeed(title) }, entry: "main.tex" };
    case "beamer":
      return { files: { "main.tex": beamerSeed(title) }, entry: "main.tex" };
    case "acmart":
      return {
        files: {
          "main.tex": acmartSeed(title),
          "refs.bib": acmartBib(),
        },
        entry: "main.tex",
      };
    case "thesis-memoir":
      return {
        files: {
          "main.tex": thesisMemoirMain(title),
          "chapters/01-introduction.tex": thesisMemoirChapter("Introduction"),
          "chapters/02-literature-review.tex": thesisMemoirDummyChapter("Literature Review"),
          "chapters/03-methodology.tex": thesisMemoirDummyChapter("Methodology"),
          "refs.bib": thesisMemoirBib(),
        },
        entry: "main.tex",
      };
  }
}

function blankSeed(title: string): string {
  return [
    "\\documentclass{article}",
    "",
    `\\title{${title}}`,
    "\\author{}",
    "\\date{\\today}",
    "",
    "\\begin{document}",
    "\\maketitle",
    "",
    "\\section{Introduction}",
    "Start writing here.",
    "",
    "\\end{document}",
    "",
  ].join("\n");
}

function amsartSeed(title: string): string {
  return [
    "\\documentclass[10pt,a4paper]{amsart}",
    "\\usepackage{amsmath,amssymb,amsthm}",
    "\\usepackage{hyperref}",
    "\\usepackage{booktabs}",
    "",
    "\\newtheorem{theorem}{Theorem}",
    "\\newtheorem{lemma}[theorem]{Lemma}",
    "\\newtheorem{corollary}[theorem]{Corollary}",
    "\\theoremstyle{definition}",
    "\\newtheorem{definition}{Definition}",
    "\\newtheorem{example}{Example}",
    "\\theoremstyle{remark}",
    "\\newtheorem{remark}{Remark}",
    "",
    `\\title{${title}}`,
    "\\author{Math Author}",
    "\\address{Department of Mathematics, University of Excellence}",
    "\\email{author@math.example.edu}",
    "\\date{\\today}",
    "",
    "\\begin{document}",
    "",
    "\\begin{abstract}",
    "This paper introduces a comprehensive mathematical framework, demonstrating various theorems, definitions, and equations to serve as a robust template for mathematical typesetting.",
    "\\end{abstract}",
    "",
    "\\maketitle",
    "",
    "\\section{Introduction}",
    "Set up the problem here. We consider the general case of the Navier-Stokes equations and their smoothness properties.",
    "",
    "\\begin{definition}[Smoothness]",
    "A function $f \\in C^{\\infty}(\\mathbb{R}^n)$ is considered smooth if it has derivatives of all orders.",
    "\\end{definition}",
    "",
    "\\section{Main Results}",
    "\\begin{theorem}[Fundamental Theorem]",
    "Let $\\Omega \\subset \\mathbb{R}^n$ be a bounded domain with smooth boundary. Then there exists a unique solution $u \\in H^1_0(\\Omega)$ to the boundary value problem.",
    "\\end{theorem}",
    "",
    "\\begin{proof}",
    "The proof follows from the Lax-Milgram theorem. Consider the bilinear form $B[u,v] = \\int_{\\Omega} \\nabla u \\cdot \\nabla v \\, dx$.",
    "It is easy to see that",
    "\\begin{equation}",
    "  \\label{eq:complex}",
    "  \\int_{\\Omega} |\\nabla u|^2 dx \\geq C \\left( \\int_{\\Omega} |u|^p dx \\right)^{2/p}",
    "\\end{equation}",
    "for $p = \\frac{2n}{n-2}$ when $n > 2$. This establishes coercivity.",
    "\\end{proof}",
    "",
    "\\section{Empirical Observations}",
    "We summarize our findings in Table~\\ref{tab:results}.",
    "",
    "\\begin{table}[htpb]",
    "  \\centering",
    "  \\caption{Summary of convergence rates}",
    "  \\label{tab:results}",
    "  \\begin{tabular}{llc}",
    "    \\toprule",
    "    Method & Order & Error $\\mathcal{O}(h^p)$ \\\\",
    "    \\midrule",
    "    Galerkin & Linear & $p=1$ \\\\",
    "    Petrov-Galerkin & Quadratic & $p=2$ \\\\",
    "    Spectral & Exponential & $p \\to \\infty$ \\\\",
    "    \\bottomrule",
    "  \\end{tabular}",
    "\\end{table}",
    "",
    "\\end{document}",
    "",
  ].join("\n");
}

function beamerSeed(title: string): string {
  return [
    "\\documentclass[aspectratio=43]{beamer}",
    "\\usetheme{Madrid}",
    "\\usecolortheme{default}",
    "",
    `\\title{${title}}`,
    "\\subtitle{A comprehensive overview}",
    "\\author{Speaker Name}",
    "\\institute[Inst.]{Institute of Advanced Studies \\\\ \\texttt{speaker@example.org}}",
    "\\date{\\today}",
    "",
    "\\begin{document}",
    "",
    "\\begin{frame}",
    "\\titlepage",
    "\\end{frame}",
    "",
    "\\begin{frame}{Outline}",
    "\\tableofcontents",
    "\\end{frame}",
    "",
    "\\section{Introduction}",
    "\\begin{frame}{Motivation}",
    "\\begin{block}{The Core Problem}",
    "We need to present information in a structured, engaging manner.",
    "\\end{block}",
    "\\pause",
    "\\begin{alertblock}{Challenge}",
    "Keeping the audience awake during technical derivations.",
    "\\end{alertblock}",
    "\\end{frame}",
    "",
    "\\section{Methodology}",
    "\\begin{frame}{Approach}",
    "\\begin{columns}",
    "\\column{0.5\\textwidth}",
    "  \\textbf{Theoretical Framework}",
    "  \\begin{itemize}",
    "    \\item<1-> Point one is revealed first.",
    "    \\item<2-> Point two comes next.",
    "    \\item<3-> Finally, the conclusion.",
    "  \\end{itemize}",
    "\\column{0.5\\textwidth}",
    "  \\onslide<4->{",
    "  \\begin{exampleblock}{Practical Implementation}",
    "  Using \\texttt{beamer} columns allows side-by-side content comparison.",
    "  \\end{exampleblock}",
    "  }",
    "\\end{columns}",
    "\\end{frame}",
    "",
    "\\section{Results}",
    "\\begin{frame}{Main result}",
    "\\begin{itemize}",
    "  \\item The methodology succeeded.",
    "  \\item Visual aids improved comprehension by 42\\%.",
    "\\end{itemize}",
    "\\end{frame}",
    "",
    "\\end{document}",
    "",
  ].join("\n");
}

function acmartSeed(title: string): string {
  return [
    "\\documentclass[sigconf,nonacm]{acmart}",
    "\\usepackage{algorithm}",
    "\\usepackage{algorithmic}",
    "",
    `\\title{${title}}`,
    "",
    "\\author{First Author}",
    "\\affiliation{%",
    "  \\institution{Institute for Clarity in Documentation}",
    "  \\city{Dublin}",
    "  \\country{Ireland}",
    "}",
    "\\email{first@example.com}",
    "",
    "\\author{Second Author}",
    "\\affiliation{%",
    "  \\institution{University of Technology}",
    "  \\city{Tokyo}",
    "  \\country{Japan}",
    "}",
    "\\email{second@example.com}",
    "",
    "\\begin{abstract}",
    "This paper presents a novel approach to document formatting using the ACM template. We demonstrate how to structure sections, include algorithms, and manage citations effectively. Our results show a significant improvement in readability.",
    "\\end{abstract}",
    "",
    "\\keywords{Document formatting, ACM, LaTeX, Typesetting}",
    "",
    "\\begin{document}",
    "\\maketitle",
    "",
    "\\section{Introduction}",
    "The process of scientific writing often requires adherence to strict formatting guidelines. As described by Smith et al. \\cite{smith2024}, using standardized templates greatly reduces editorial friction.",
    "",
    "\\section{Methodology}",
    "Our approach relies on a multi-pass compilation strategy. The core logic is outlined in Algorithm~\\ref{alg:formatting}.",
    "",
    "\\begin{algorithm}[h]",
    "\\caption{Document Compilation Strategy}",
    "\\label{alg:formatting}",
    "\\begin{algorithmic}[1]",
    "\\REQUIRE Source code $S$, Template $T$",
    "\\ENSURE PDF Document $D$",
    "\\STATE $D_{temp} \\leftarrow \\text{Parse}(S, T)$",
    "\\WHILE{Unresolved references exist in $D_{temp}$}",
    "  \\STATE $D_{temp} \\leftarrow \\text{Compile}(D_{temp})$",
    "\\ENDWHILE",
    "\\RETURN $D_{temp}$",
    "\\end{algorithmic}",
    "\\end{algorithm}",
    "",
    "\\section{Evaluation}",
    "We summarize the performance metrics across different templates in Table~\\ref{tab:metrics}.",
    "",
    "\\begin{table}[h]",
    "  \\centering",
    "  \\caption{Performance Comparison}",
    "  \\label{tab:metrics}",
    "  \\begin{tabular}{lcc}",
    "    \\toprule",
    "    Template & Compile Time (s) & Output Size (KB) \\\\",
    "    \\midrule",
    "    Standard & 1.2 & 450 \\\\",
    "    ACM Art & 2.4 & 890 \\\\",
    "    \\bottomrule",
    "  \\end{tabular}",
    "\\end{table}",
    "",
    "\\section{Conclusion}",
    "We have demonstrated a robust template configuration for ACM submissions.",
    "",
    "\\bibliographystyle{ACM-Reference-Format}",
    "\\bibliography{refs}",
    "",
    "\\end{document}",
    "",
  ].join("\n");
}

function acmartBib(): string {
  return [
    "@article{smith2024,",
    "  title = {A comprehensive survey on typesetting systems},",
    "  author = {Smith, John and Doe, Jane},",
    "  journal = {Journal of Formatting Excellence},",
    "  volume = {42},",
    "  number = {3},",
    "  pages = {100--120},",
    "  year = {2024},",
    "  publisher = {Formatting Society}",
    "}",
    "",
  ].join("\n");
}

function thesisMemoirMain(title: string): string {
  return [
    "\\documentclass[oneside,12pt]{memoir}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage{amsmath,amssymb}",
    "\\usepackage{graphicx}",
    "\\usepackage{hyperref}",
    "\\usepackage{cleveref}",
    "",
    `\\title{${title}}`,
    "\\author{Thesis Author}",
    "\\date{\\today}",
    "",
    "\\begin{document}",
    "",
    "\\frontmatter",
    "\\maketitle",
    "\\tableofcontents",
    "\\listoffigures",
    "\\listoftables",
    "",
    "\\mainmatter",
    "\\input{chapters/01-introduction.tex}",
    "\\input{chapters/02-literature-review.tex}",
    "\\input{chapters/03-methodology.tex}",
    "",
    "\\backmatter",
    "\\bibliographystyle{plain}",
    "\\bibliography{refs}",
    "",
    "\\end{document}",
    "",
  ].join("\n");
}

function thesisMemoirChapter(title: string): string {
  return [
    `\\chapter{${title}}`,
    "",
    "Open the chapter with the question this work answers, then sketch how each",
    "section contributes.",
    "",
    "\\section{Motivation}",
    "Why does this matter? See \\cref{fig:dummy} for an illustration of the problem space.",
    "",
    "\\begin{figure}[htpb]",
    "  \\centering",
    "  \\rule{4cm}{3cm} % Dummy placeholder for an image",
    "  \\caption{A placeholder for a real figure.}",
    "  \\label{fig:dummy}",
    "\\end{figure}",
    "",
    "\\section{Contributions}",
    "As detailed in \\cref{tab:contrib}, we make several key advances.",
    "",
    "\\begin{table}[htpb]",
    "  \\centering",
    "  \\caption{Summary of contributions}",
    "  \\label{tab:contrib}",
    "  \\begin{tabular}{ll}",
    "    \\toprule",
    "    Domain & Contribution \\\\",
    "    \\midrule",
    "    Theory & Novel bounds on complexity. \\\\",
    "    Practice & Open-source implementation. \\\\",
    "    \\bottomrule",
    "  \\end{tabular}",
    "\\end{table}",
    "",
    "\\begin{itemize}",
    "  \\item First contribution: theoretical framework \\cite{example2026}.",
    "  \\item Second contribution: empirical validation.",
    "\\end{itemize}",
    "",
  ].join("\n");
}

function thesisMemoirDummyChapter(title: string): string {
  return [
    `\\chapter{${title}}`,
    "",
    `This chapter covers the ${title.toLowerCase()}. It builds upon the foundations laid in the previous chapters.`,
    "",
    "\\section{Overview}",
    "We survey the relevant literature and identify gaps that our methodology addresses.",
    "",
    "\\section{Key Findings}",
    "The primary results are presented here, showing significant improvements over state-of-the-art methods.",
    "",
  ].join("\n");
}

function thesisMemoirBib(): string {
  return [
    "@book{example2026,",
    "  title  = {An Example Reference},",
    "  author = {A. Author and B. Coauthor},",
    "  year   = {2026},",
    "  publisher = {Springer},",
    "}",
    "",
  ].join("\n");
}
