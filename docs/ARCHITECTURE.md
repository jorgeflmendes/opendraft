# OpenDraft Architecture

OpenDraft is a local-first browser application for editing and compiling
LaTeX projects. The app is intentionally static-hostable: project files
live in browser storage and TeX runs in Web Workers.

## Runtime Shape

```txt
React app
  screens/
    Landing, Projects, Editor
  features/
    editor, projects, compile, preview, diff, shortcuts
  services/
    project persistence, compile engines, project I/O, CTAN fetcher
  domain/
    Project and compile result types
```

The UI is split by workflow. Screens compose feature modules and own
navigation-level wiring; feature folders own the interactive surfaces and
stores for their workflow. Services isolate persistence, compilation,
import/export, local-folder access, and TeX support utilities.

## Project Model

Projects are path-keyed collections of files and folders:

- text files store UTF-8 strings,
- binary assets store `Uint8Array` or `Blob` pointers,
- the entry file selects the root document supplied to the TeX engine.

## Persistence and Memory Sharding

The default project service combines a built-in sample catalogue with an
IndexedDB-backed project store. Persisted projects win over sample entries
with the same id, so editing a sample effectively creates a local shadow.

Because users often upload dozens of high-resolution images, storing the entire
Project object in a single IndexedDB record leads to UI blocking and out-of-memory
crashes. OpenDraft implements **File-Level Sharding**:

- The project metadata is stored in one record.
- Each file (text or binary) is stored in its own separate IndexedDB record (e.g. `file:projectID:path`).
- Content-only saves update project metadata and the changed file shards in one
  IndexedDB transaction.
- Project-list summaries are stored with metadata, so listing projects does not
  read every file body.

## Compilation

`getCompileService()` resolves the best available compile engine:

1. BusyTeX, when the browser worker assets are installed.
2. SwiftLaTeX, when the fallback worker is installed and BusyTeX cannot
   load a runtime file.
3. An explicit unavailable-engine error when no real engine assets exist.

The compile store owns lifecycle state, progress, logs, PDF bytes, and
the parsed SyncTeX index for the latest run. The preview pane renders only
real engine-produced PDF output through PDF.js.

## CTAN

On-demand TeX Live package downloads use a same-origin `/ctan/*` rewrite.
This keeps browser requests CORS-safe while preserving the invariant that
OpenDraft never uploads project files to a compile server.

## Editor

CodeMirror is wrapped behind `CodeMirrorEditor`. The wrapper handles:

- document identity and state rebuilds,
- external document patches,
- cursor reporting,
- file paste routing,
- LaTeX language setup, code folding, smart spellcheck, search, completions, and math hover.

The editor screen owns cross-panel workflows: file tree operations,
uploads, paste-to-project, compile, source/PDF sync, bibliography insert,
diff, and autosave. Multiple open tabs running the same application
in different windows share only project-list metadata through
`BroadcastChannel`. The active project, open tabs, and unsaved edits remain
session-local so two tabs cannot overwrite each other's editor state.

## Keyboard shortcuts

Shortcut definitions live in a feature-level registry while persisted user
bindings live in the shortcuts store. Components consume semantic command IDs,
which keeps platform-specific key combinations and user overrides out of
workflow code.

## Publication Boundary

This repository is curated for public review as an academic prototype / proof of concept.

- Proprietary assets, API keys, and sensitive environment bindings are excluded.
- The compiled WASM engines (`BusyTeX` and `SwiftLaTeX`) and PDF.js bundles are ignored from version control due to their size and upstream licensing; they must be downloaded independently via the setup script.
- Generated build outputs, local caches, engine binaries, and credentials are excluded from version control.

## Testing

Vitest covers stores, services, pure transforms, and components in jsdom.
Playwright covers the production bundle, browser workers, real BusyTeX
compile, PDF.js worker loading, and non-blank canvas rendering.

The merge gate is defined in `docs/QUALITY.md`.
