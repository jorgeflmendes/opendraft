import { getFileExtension } from "@/services/path-utils";
import type { FileNode, Project, ProjectFolder, ProjectSummary } from "@/domain";
import { makeStokesNotes } from "./project";
import { SAMPLE_BIB, SAMPLE_PREAMBLE } from "./sample-tex";

// Multi-project fixture catalogue used by the picker and the
// fixture ProjectService. Each entry pairs a lightweight summary (for
// the picker) with a factory that materialises the full Project on
// demand (for the editor).
//
// Adding a project? Append a new MockProjectEntry. The summary must
// be self-consistent (texFileCount and fileCount agree with the
// factory's output), but the test suite verifies that for us.

// -- Helpers (private) --------------------------------------------

const inferKind = (path: string): FileNode["kind"] => {
  const name = path.split("/").pop() ?? path;
  const ext = getFileExtension(name);
  if (ext === "tex") return "tex";
  if (ext === "bib") return "bib";
  if (ext === "sty") return "sty";
  if (ext === "yml" || ext === "yaml") return "yml";
  if (ext === "md") return "md";
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "svg") return "img";
  if (
    ["txt", "makefile", "license", "dockerfile", "gitignore", "editorconfig", "env"].includes(ext)
  )
    return "txt";
  return "other";
};

const mkFile = (idPrefix: string, path: string, content: string, modified?: boolean): FileNode => {
  const name = path.split("/").pop() ?? path;
  return {
    id: `${idPrefix}-${path.replace(/[^a-z0-9]/gi, "-")}`,
    path,
    name,
    kind: inferKind(path),
    content,
    ...(modified ? { modified: true } : {}),
  };
};

const mkFolder = (path: string, expanded = false): ProjectFolder => ({
  path,
  name: path.split("/").pop() ?? path,
  expanded,
});

const filesToMap = (files: FileNode[]): Record<string, FileNode> =>
  Object.fromEntries(files.map((f) => [f.path, f]));

const foldersToMap = (folders: ProjectFolder[]): Record<string, ProjectFolder> =>
  Object.fromEntries(folders.map((f) => [f.path, f]));

// -- Project factories --------------------------------------------

function makeThesis2025(): Project {
  const idp = "thesis";
  const files = [
    mkFile(
      idp,
      "main.tex",
      `\\documentclass[12pt,oneside]{memoir}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{geometry}
\\usepackage{graphicx}
\\usepackage{lipsum}
\\usepackage{algorithm}
\\usepackage{algorithmic}
\\usepackage{booktabs}
\\usepackage{hyperref}
\\input{preamble.sty}

\\title{Approximation Algorithms for Stochastic Bandits\\\\ \\Large A Massive Doctoral Dissertation}
\\author{Eleanor Hart}

\\begin{document}
\\maketitle
\\tableofcontents
\\listoffigures
\\listoftables
\\include{chapters/01-intro}
\\include{chapters/02-prelims}
\\include{chapters/03-bandits}
\\include{chapters/04-regret}
\\include{chapters/05-experiments}
\\include{chapters/06-conclusion}
\\bibliography{references}
\\end{document}
`,
    ),
    mkFile(idp, "preamble.sty", SAMPLE_PREAMBLE),
    mkFile(idp, "references.bib", SAMPLE_BIB),
    mkFile(
      idp,
      "chapters/01-intro.tex",
      "\\chapter{Introduction}\n\\lipsum[1-20]\nWe study sequential decisions under partial feedback; classical mathematical references such as \\cite{spivak1965} fix the notation used throughout.\n\\lipsum[21-40]\n",
    ),
    mkFile(
      idp,
      "chapters/02-prelims.tex",
      "\\chapter{Preliminaries}\n\\lipsum[41-60]\nThis chapter fixes notation for filtrations, rewards, and policies.\n\\lipsum[61-80]\n",
    ),
    mkFile(
      idp,
      "chapters/03-bandits.tex",
      "\\chapter{Bandit framework}\n\\lipsum[81-100]\nThe model exposes one reward sample per selected arm and round.\n\\lipsum[101-120]\n",
      true,
    ),
    mkFile(
      idp,
      "chapters/04-regret.tex",
      "\\chapter{Regret bounds}\n\\lipsum[121-140]\nRegret compares the learner with the best fixed action in hindsight.\n\\lipsum[141-150]\n",
    ),
    mkFile(
      idp,
      "chapters/05-experiments.tex",
      "\\chapter{Experiments}\n\\lipsum[1-20]\nSynthetic benchmarks report mean regret with confidence intervals.\n\\lipsum[21-40]\n",
    ),
    mkFile(
      idp,
      "chapters/06-conclusion.tex",
      "\\chapter{Conclusion}\n\\lipsum[41-60]\nThe final chapter summarizes the guarantees and limitations.\n\\lipsum[61-80]\n",
    ),
  ];
  const folders = [mkFolder("chapters", true), mkFolder("figures")];
  return {
    id: "p-thesis-2025-v2",
    name: "Thesis 2025",
    entry: "main.tex",
    files: filesToMap(files),
    folders: foldersToMap(folders),
    createdAt: "2025-01-12T09:00:00Z",
  };
}

function makeQuantumLectures(): Project {
  const idp = "qi";
  const lecture = (n: number, title: string) =>
    mkFile(
      idp,
      `lecture-${String(n).padStart(2, "0")}.tex`,
      `\\section*{Lecture ${n}: ${title}}\n\\lipsum[${n * 10}-${n * 10 + 20}]\nKey definitions and examples for the lecture.\n\\lipsum[${n * 10 + 21}-${n * 10 + 30}]\n`,
    );
  const files = [
    mkFile(
      idp,
      "main.tex",
      `\\documentclass[11pt]{article}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{geometry}
\\usepackage{tikz}
\\usepackage{lipsum}
\\title{Quantum Information --- 8.371 \\\\ \\Large Massive Extended Lecture Notes}
\\author{OpenDraft Sample}
\\begin{document}
\\maketitle
\\tableofcontents
\\input{lecture-01}
\\input{lecture-02}
\\input{lecture-03}
\\input{lecture-04}
\\end{document}
`,
    ),
    lecture(1, "States and measurements"),
    lecture(2, "Entanglement"),
    lecture(3, "Quantum operations"),
    lecture(4, "Channel capacities"),
    mkFile(
      idp,
      "README.md",
      "# Lecture notes - Quantum Information (8.371)\n\nMassive expanded lecture notes.\n",
    ),
  ];
  return {
    id: "p-quantum-lectures-v2",
    name: "Lecture notes - Quantum Information",
    entry: "main.tex",
    files: filesToMap(files),
    folders: foldersToMap([mkFolder("figures")]),
    createdAt: "2024-09-08T08:00:00Z",
  };
}

function makeCv(): Project {
  const idp = "cv";
  const files = [
    mkFile(
      idp,
      "cv.tex",
      `\\documentclass[11pt,a4paper,sans]{moderncv}
\\moderncvstyle{classic}
\\moderncvcolor{orange}
\\usepackage{lipsum}
\\name{Eleanor}{Hart}
\\begin{document}
\\makecvtitle
\\section{Education}
\\cventry{2022--present}{PhD candidate}{University X}{}{}{Algorithms group. \\lipsum[1-2]}
\\section{Experience}
\\cventry{2020--2022}{Research Assistant}{Institute Y}{}{}{Worked on massive projects. \\lipsum[3-5]}
\\section{Publications}
\\cvitem{2024}{Hart, E. et al. Massive Paper on Algorithms. \\lipsum[6]}
\\section{Skills}
\\cvitem{Languages}{Python, C++, Rust, LaTeX}
\\cvitem{Tools}{Git, Docker, OpenDraft}
\\end{document}
`,
    ),
  ];
  return {
    id: "p-cv-v2",
    name: "CV",
    entry: "cv.tex",
    files: filesToMap(files),
    folders: {},
    createdAt: "2024-11-02T12:30:00Z",
  };
}

function makeIcmlSubmission(): Project {
  const idp = "icml";
  const files = [
    mkFile(
      idp,
      "main.tex",
      `\\documentclass[twocolumn]{article}
\\usepackage{amsmath,amssymb}
\\usepackage{lipsum}
\\usepackage{graphicx}
\\usepackage{algorithm}
\\usepackage{algorithmic}
\\usepackage{booktabs}
\\title{Sparse Decoders for Discrete Diffusion \\\\ \\Large Massive Submission Version}
\\author{OpenDraft Sample}
\\begin{document}
\\maketitle
\\input{sections/01-intro}
\\input{sections/02-method}
\\input{sections/03-experiments}
\\bibliographystyle{plain}
\\bibliography{references}
\\end{document}
`,
      true,
    ),
    mkFile(
      idp,
      "sections/01-intro.tex",
      "\\section{Introduction}\n\\lipsum[1-15]\nWe include a placeholder citation \\cite{spivak1965} so the sample bibliography renders.\n\\lipsum[16-25]\n",
    ),
    mkFile(
      idp,
      "sections/02-method.tex",
      "\\section{Method}\n\\lipsum[26-45]\nWe train with a regularized objective and report ablations over the encoder.\n\\lipsum[46-60]\n",
      true,
    ),
    mkFile(
      idp,
      "sections/03-experiments.tex",
      "\\section{Experiments}\n\\lipsum[61-80]\nResults compare accuracy, calibration, and inference cost across baselines.\n\\lipsum[81-100]\n",
    ),
    mkFile(idp, "references.bib", SAMPLE_BIB),
  ];
  return {
    id: "p-icml-submission-v2",
    name: "ICML 2025 submission",
    entry: "main.tex",
    files: filesToMap(files),
    folders: foldersToMap([mkFolder("sections", true), mkFolder("figures")]),
    createdAt: "2025-04-22T17:45:00Z",
  };
}

// -- Catalogue ----------------------------------------------------

export interface MockProjectEntry {
  summary: ProjectSummary;
  factory: () => Project;
}

const ENTRIES: MockProjectEntry[] = [
  {
    summary: {
      id: "p-stokes-notes-v3",
      name: "Stokes Notes",
      description: "Differential topology seminar - massive extended notes on Stokes' theorem.",
      texFileCount: 7,
      fileCount: 10,
      lastOpenedAt: "2026-05-22T22:00:00Z",
    },
    factory: makeStokesNotes,
  },
  {
    summary: {
      id: "p-thesis-2025-v2",
      name: "Thesis 2025",
      description: "PhD thesis - massive approximation algorithms for stochastic bandits.",
      texFileCount: 7,
      fileCount: 9,
      lastOpenedAt: "2026-05-21T18:30:00Z",
    },
    factory: makeThesis2025,
  },
  {
    summary: {
      id: "p-quantum-lectures-v2",
      name: "Lecture notes - Quantum Information",
      description: "Massive lecture notes for 8.371, including channel capacities.",
      texFileCount: 5,
      fileCount: 6,
      lastOpenedAt: "2026-05-19T10:00:00Z",
    },
    factory: makeQuantumLectures,
  },
  {
    summary: {
      id: "p-cv-v2",
      name: "CV",
      description: "Personal CV - moderncv massive template, classic style.",
      texFileCount: 1,
      fileCount: 1,
      lastOpenedAt: "2026-05-15T09:00:00Z",
    },
    factory: makeCv,
  },
  {
    summary: {
      id: "p-icml-submission-v2",
      name: "ICML 2025 submission",
      description: "Camera-ready - massive sparse decoders for discrete diffusion.",
      texFileCount: 4,
      fileCount: 5,
      lastOpenedAt: "2026-05-08T11:00:00Z",
    },
    factory: makeIcmlSubmission,
  },
];

/** Read-only catalogue of fixture projects, in newest-first order. */
export const MOCK_PROJECT_ENTRIES: ReadonlyArray<MockProjectEntry> = ENTRIES;
