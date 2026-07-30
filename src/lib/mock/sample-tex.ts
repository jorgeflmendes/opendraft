// Sample LaTeX content for the seed project. Kept stable so editor and
// preview tests exercise the same source shape.

export const SAMPLE_MAIN_TEX = `\\documentclass[11pt]{article}
\\usepackage{amsmath, amssymb}
\\usepackage{mathtools}
\\usepackage{geometry}
\\usepackage{tikz}
\\usepackage{amsthm}
\\usepackage{lipsum}
\\usepackage{booktabs}
\\usepackage{hyperref}
\\geometry{margin=1in}

% Notes for the Tuesday seminar
\\title{Advanced Notes on Generalized Stokes' Theorem\\\\ \\Large Massive Extended Edition}
\\author{Eleanor Hart}
\\date{\\today}

\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{definition}[theorem]{Definition}
\\newtheorem{corollary}[theorem]{Corollary}

\\begin{document}
\\maketitle

\\begin{abstract}
This document provides a massive and comprehensive exposition on the generalized Stokes' Theorem on smooth manifolds. We cover differential forms, integration on manifolds, the fundamental theorem of calculus in higher dimensions, and numerous applications. \\lipsum[1]
\\end{abstract}

\\tableofcontents
\\newpage

\\input{chapters/intro.tex}
\\input{chapters/setup.tex}
\\input{chapters/forms.tex}
\\input{chapters/proof.tex}
\\input{chapters/applications.tex}
\\input{chapters/advanced.tex}

\\bibliographystyle{plain}
\\bibliography{references}
\\end{document}
`;

export const SAMPLE_INTRO_TEX = `\\section{Introduction}
\\lipsum[2-5]

The classical theorems of vector calculus---Green's theorem, the divergence theorem, and the classical Stokes' theorem---are all special cases of a single, unifying result in differential geometry known as the generalized Stokes' theorem. It can be stated simply as
\\begin{equation}
    \\int_{\\partial M} \\omega = \\int_M d\\omega
\\end{equation}
where $M$ is an oriented smooth manifold with boundary, $\\omega$ is a differential form of degree $n-1$, and $d\\omega$ is its exterior derivative.

\\lipsum[6-10]

In these notes, we will meticulously develop the necessary machinery, including the theory of differential forms, the exterior derivative, and integration on manifolds, before presenting a rigorous proof of the theorem.
`;

export const SAMPLE_SETUP_TEX = `\\section{Setup and Preliminaries}
\\subsection{Manifolds and Tangent Spaces}
\\lipsum[11-15]

Let $M$ be a smooth manifold of dimension $n$. For each $p \\in M$, the tangent space $T_p M$ is an $n$-dimensional vector space. The disjoint union of all tangent spaces forms the tangent bundle $TM = \\coprod_{p \\in M} T_p M$.

A vector field $X$ on $M$ is a smooth section of the tangent bundle. We denote the space of smooth vector fields on $M$ by $\\mathfrak{X}(M)$.

\\subsection{Cotangent Bundle}
\\lipsum[16-20]
`;

export const SAMPLE_FORMS_TEX = `\\section{Differential Forms}
\\lipsum[21-23]

A differential form of degree $k$, or a $k$-form, is a smooth section of the $k$-th exterior power of the cotangent bundle, $\\Lambda^k T^*M$.

In local coordinates $(x^1, \\dots, x^n)$, a $k$-form $\\omega$ can be expressed as
\\begin{equation}
    \\omega = \\sum_{1 \\le i_1 < \\dots < i_k \\le n} \\omega_{i_1 \\dots i_k} dx^{i_1} \\wedge \\dots \\wedge dx^{i_k}
\\end{equation}
where $\\omega_{i_1 \\dots i_k}$ are smooth functions.

\\lipsum[24-26]

\\subsection{The Exterior Derivative}
The exterior derivative $d$ is the unique $\\mathbb{R}$-linear map from $k$-forms to $(k+1)$-forms satisfying:
\\begin{enumerate}
    \\item If $f$ is a 0-form (a function), then $df$ is the differential of $f$.
    \\item $d(\\omega \\wedge \\eta) = d\\omega \\wedge \\eta + (-1)^k \\omega \\wedge d\\eta$, where $\\omega$ is a $k$-form.
    \\item $d^2 = 0$.
\\end{enumerate}

\\lipsum[27-30]

Locally, for $\\omega = f \\, dx^{i_1} \\wedge \\dots \\wedge dx^{i_k}$, we have
\\begin{equation}
    d\\omega = df \\wedge dx^{i_1} \\wedge \\dots \\wedge dx^{i_k} = \\sum_{j=1}^n \\frac{\\partial f}{\\partial x^j} dx^j \\wedge dx^{i_1} \\wedge \\dots \\wedge dx^{i_k}.
\\end{equation}

\\begin{table}[h]
\\centering
\\begin{tabular}{@{}lll@{}}
\\toprule
Degree & Form Type & Exterior Derivative \\\\
\\midrule
0 & $f$ & $df = \\sum_i \\frac{\\partial f}{\\partial x^i} dx^i$ \\\\
1 & $\\sum_i \\omega_i dx^i$ & $d\\omega = \\sum_{i<j} (\\frac{\\partial \\omega_j}{\\partial x^i} - \\frac{\\partial \\omega_i}{\\partial x^j}) dx^i \\wedge dx^j$ \\\\
$n-1$ & $\\omega$ & $d\\omega = (\\text{div} \\vec{F}) dx^1 \\wedge \\dots \\wedge dx^n$ \\\\
\\bottomrule
\\end{tabular}
\\caption{Examples of exterior derivatives in $\\mathbb{R}^n$.}
\\end{table}

\\lipsum[31-35]
`;

export const SAMPLE_PROOF_TEX = `\\section{Detailed proof of Stokes' Theorem}
\\lipsum[36-40]

Let $\\mathcal{U} = \\{(U_\\alpha, \\varphi_\\alpha)\\}$ be a locally finite atlas on $M$,
and let $\\{\\rho_\\alpha\\}$ be a partition of unity subordinate to it.
Write $\\omega_\\alpha = \\rho_\\alpha \\omega$, so that $\\omega = \\sum_\\alpha \\omega_\\alpha$
with the sum locally finite. By linearity of the integral and the exterior derivative, it suffices to prove the theorem for each $\\omega_\\alpha$.

\\lipsum[41-45]

Each $\\omega_\\alpha$ has compact support inside $U_\\alpha$. Pulled back along
$\\varphi_\\alpha^{-1}$, it is a smooth $(n-1)$-form on a chart in either
$\\mathbb{R}^n$ or the half-space $\\mathbb{H}^n = \\{ (x^1, \\dots, x^n) \\in \\mathbb{R}^n \\mid x^n \\ge 0 \\}$.

\\begin{lemma}
For an $(n-1)$-form $\\eta$ with compact support in $\\mathbb{R}^n$, we have $\\int_{\\mathbb{R}^n} d\\eta = 0$.
\\end{lemma}
\\begin{proof}
Let $\\eta = \\sum_{j=1}^n (-1)^{j-1} f_j \\, dx^1 \\wedge \\dots \\wedge \\widehat{dx^j} \\wedge \\dots \\wedge dx^n$.
Then $d\\eta = \\left( \\sum_{j=1}^n \\frac{\\partial f_j}{\\partial x^j} \\right) dx^1 \\wedge \\dots \\wedge dx^n$.
By Fubini's theorem, the integral of $\\frac{\\partial f_j}{\\partial x^j}$ with respect to $x^j$ over $\\mathbb{R}$ is zero because $f_j$ has compact support.
\\end{proof}

\\lipsum[46-50]

This reduces Stokes' theorem to the fundamental theorem of calculus in each coordinate. The boundary integral naturally arises from the integration over the half-space $\\mathbb{H}^n$.

\\begin{figure}[ht]
\\begin{verbatim}
Numerical Verification of Stokes' Theorem (Pseudo-code)
-------------------------------------------------------
Require: Manifold M, form omega, mesh T of M
1: Sum1 <- 0
2: Sum2 <- 0
3: for each simplex D in T do
4:     Sum1 <- Sum1 + int_D d(omega)
5: end for
6: for each boundary face F in d(T) do
7:     Sum2 <- Sum2 + int_F omega
8: end for
Ensure: Sum1 ~ Sum2
\\end{verbatim}
\\caption{Numerical Verification of Stokes' Theorem}
\\end{figure}
`;

export const SAMPLE_APPLICATIONS_TEX = `\\section{Applications and Examples}
\\subsection{De Rham Cohomology}
Stokes' theorem implies that the integration map defines a pairing between de Rham cohomology groups $H_{dR}^k(M)$ and singular homology groups $H_k(M)$.

\\lipsum[51-55]

\\subsection{Matrix Representation}
Consider the transformation of coordinates via a Jacobian matrix:
\\begin{equation}
J = \\begin{pmatrix}
\\frac{\\partial y^1}{\\partial x^1} & \\dots & \\frac{\\partial y^1}{\\partial x^n} \\\\
\\vdots & \\ddots & \\vdots \\\\
\\frac{\\partial y^n}{\\partial x^1} & \\dots & \\frac{\\partial y^n}{\\partial x^n}
\\end{pmatrix}
\\end{equation}
The volume form transforms as $dy^1 \\wedge \\dots \\wedge dy^n = \\det(J) \\, dx^1 \\wedge \\dots \\wedge dx^n$.

\\begin{figure}[h]
\\centering
\\begin{tikzpicture}
    \\draw[thick, ->] (0,0) -- (6,0) node[anchor=north west] {$x$};
    \\draw[thick, ->] (0,0) -- (0,6) node[anchor=south east] {$y$};
    \\draw[fill=blue!20, opacity=0.5] (2,2) rectangle (5,5);
    \\node at (3.5, 3.5) {$\\Omega$};
    \\draw[thick, red, ->] (2,2) -- (5,2);
    \\draw[thick, red, ->] (5,2) -- (5,5);
    \\draw[thick, red, ->] (5,5) -- (2,5);
    \\draw[thick, red, ->] (2,5) -- (2,2);
    \\node at (3.5, 1.5) {$\\partial \\Omega$};
\\end{tikzpicture}
\\caption{Integration domain $\\Omega$ and its oriented boundary $\\partial \\Omega$.}
\\end{figure}

\\lipsum[56-60]
`;

export const SAMPLE_ADVANCED_TEX = `\\section{Advanced Topics}
\\subsection{Stokes' Theorem on Manifolds with Corners}
\\lipsum[61-70]

\\subsection{Currents and Geometric Measure Theory}
\\lipsum[71-80]

\\begin{figure}[ht]
\\centering
\\begin{tikzpicture}[scale=1.5]
  \\draw[thick] (0,0) circle (2cm);
  \\fill[gray!30] (0,0) circle (2cm);
  \\draw[thick, ->] (0,0) -- (1.414, 1.414) node[midway, above left] {$r$};
  \\node at (0, -2.5) {Manifold $M$ with boundary $\\partial M$};
\\end{tikzpicture}
\\caption{A simple manifold with boundary.}
\\end{figure}

\\lipsum[81-90]
`;

export const SAMPLE_BIB = `@article{stokes1854,
  author  = {George Gabriel Stokes},
  title   = {On the dynamical theory of diffraction},
  journal = {Transactions of the Cambridge Philosophical Society},
  year    = {1854},
  volume  = {9},
  pages   = {1--62},
}

@book{spivak1965,
  author    = {Michael Spivak},
  title     = {Calculus on Manifolds},
  publisher = {Benjamin},
  year      = {1965},
}

@book{lee2012,
  author    = {John M. Lee},
  title     = {Introduction to Smooth Manifolds},
  publisher = {Springer},
  year      = {2012},
  edition   = {2nd},
}

@book{tu2011,
  author    = {Loring W. Tu},
  title     = {An Introduction to Manifolds},
  publisher = {Springer},
  year      = {2011},
  edition   = {2nd},
}

@article{cartan1945,
  author  = {Élie Cartan},
  title   = {Les systèmes différentiels extérieurs et leurs applications géométriques},
  journal = {Hermann},
  year    = {1945},
}

@book{federer1969,
  author    = {Herbert Federer},
  title     = {Geometric Measure Theory},
  publisher = {Springer},
  year      = {1969},
}

@book{warner1983,
  author    = {Frank W. Warner},
  title     = {Foundations of Differentiable Manifolds and Lie Groups},
  publisher = {Springer},
  year      = {1983},
}

@article{deRham1931,
  author  = {Georges de Rham},
  title   = {Sur l'analysis situs des variétés à $n$ dimensions},
  journal = {Journal de Mathématiques Pures et Appliquées},
  year    = {1931},
  volume  = {10},
  pages   = {115--200},
}
`;

export const SAMPLE_PREAMBLE = `% Custom commands shared across chapters.
\\newcommand{\\R}{\\mathbb{R}}
\\newcommand{\\Z}{\\mathbb{Z}}
\\newcommand{\\diff}{\\mathrm{d}}
\\DeclareMathOperator{\\Tr}{Tr}
\\usepackage{lipsum}
\\usepackage{booktabs}
\\usepackage{hyperref}
`;

export const SAMPLE_README = `# Generalized Stokes' Theorem Notes (Massive Edition)

Local-only OpenDraft project - comprehensive, massive seminar notes on the generalized Stokes' theorem.
This project includes multiple extensive chapters, detailed mathematical proofs, differential forms, complex TikZ figures, algorithms, and numerous references.
Edit, compile, and preview entirely in your browser to explore advanced LaTeX capabilities.
`;
