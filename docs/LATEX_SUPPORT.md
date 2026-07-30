# LaTeX Support Matrix

OpenDraft stays serverless: document compilation runs in the browser,
engine files are static assets, and CTAN access is a same-origin
edge/serverless archive relay only.

## Supported

- BusyTeX TeX Live 2026 can run as the preferred serverless backend
  when `/core/busytex` assets are installed. It provides browser/WASM
  pdfLaTeX, XeLaTeX, LuaLaTeX, BibTeX via `bibtex8`, MakeIndex,
  SyncTeX, multi-file projects, and reruns.
- BusyTeX preloads the bundled TeX Live `basic`, `recommended`, and
  `extra` data packages so package support is broad TeX Live support,
  not a one-off bibliography path.
- pdfTeX runs in a browser Worker.
- The SwiftLaTeX fallback can fetch CTAN packages on demand from TeX
  Live archives.
- `pdftex.map` starts from a local static base and is extended in memory
  with package map fragments discovered during CTAN fetches.
- The compile service now performs latexmk-like pdfTeX reruns until the
  log stops requesting another pass, capped at five passes.
- Legacy SwiftLaTeX installs still get a limited serverless `.bbl`
  generated from bundled `.bib` files before pdfTeX runs. BusyTeX is
  the primary path for `.bst`-accurate BibTeX.
- Unsupported workflows are detected before engine boot so the app does
  not silently pretend to support non-serverless features.
- Compatibility checks now scan `.tex`, `.ltx`, `.sty`, `.cls`, `.clo`,
  `.def`, `.cfg`, `.fd`, `.bib`, `.bst`, `.bbx`, `.cbx`, `.lbx`, and
  `.ist` files; `\RequirePackage` is treated like `\usepackage`.
- `biblatex` is accepted when it uses a BibTeX/BibTeX8 backend, `backend=none`,
  or a generated `.bbl` is already present. No-index or pregenerated
  glossary outputs, frozen minted caches, and preconverted SVG
  companions are allowed without external tools.

## Requires Preprocessing

- PythonTeX, gnuplottex, Asymptote, biber, shell-escape workflows, and
  non-frozen minted require outputs generated before import.
- SVG/EPS workflows require checked-in PDF or PDF+TeX companions.
- Projects that rely on external index or glossary tools should include
  generated outputs, or use no-index glossary modes.

## Test Gate

Coverage thresholds are 90% for statements, functions, and lines, with an
82% branch ratchet. Any new support surface must include tests before it is
wired into the production compile path.
