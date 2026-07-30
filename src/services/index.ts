export type { CompileInput, CompileProgress } from "./compile-service";
export { ProjectNotFoundError } from "./errors";
export { CompositeProjectService } from "./composite-project-service";
export {
  isFolderPickerCancellation,
  pickLocalLatexProject,
  saveProjectToLocalFolder,
  supportsLocalFolderAccess,
} from "./local-folder-service";
export { MockCompileService, mockCompileService } from "./mock-compile-service";
export {
  InvalidImportError,
  parseExportedProject,
  serializeProject,
  serializeProjectToZip,
  parseImportedZip,
} from "./project-io";
export { MemoryKVStore, PersistenceProjectStore, type SavedProject } from "./persistence";

import type { ProjectService } from "./project-service";
import type { CompileService } from "./compile-service";
import { CompositeProjectService } from "./composite-project-service";
import { IDBKVStore, PersistenceProjectStore, type SavedProject } from "./persistence";

const RETIRED_DEMO_PROJECT_IDS = [
  "p-stokes-notes-v3",
  "p-thesis-2025-v2",
  "p-quantum-lectures-v2",
  "p-cv-v2",
  "p-icml-submission-v2",
] as const;

let projectOverride: ProjectService | null = null;
let projectCached: ProjectService | null = null;

/**
 * Returns the active ProjectService binding. The default binding builds a
 * persisted-only catalogue over IndexedDB on first call. Tests should call
 * `setProjectService()` with a memory-backed instance for deterministic
 * behaviour.
 */
export function getProjectService(): ProjectService {
  if (projectOverride) return projectOverride;
  if (!projectCached) projectCached = createDefaultProjectService();
  return projectCached;
}

/**
 * Test-only: swap the binding. Pass `null` to restore the default
 * and let the next call rebuild from scratch.
 */
export function setProjectService(svc: ProjectService | null): void {
  projectOverride = svc;
  if (svc === null) projectCached = null;
}

function createDefaultProjectService(): ProjectService {
  const kv = new IDBKVStore<SavedProject>();
  const store = new PersistenceProjectStore(kv);
  return new CompositeProjectService([], store, {
    retiredProjectIds: RETIRED_DEMO_PROJECT_IDS,
  });
}

// -- CompileService binding -------------------------------------

import { SwiftLaTeXCompileService } from "./swiftlatex-compile-service";
import { BusyTexCompileService } from "./busytex-compile-service";
import {
  FallbackCompileService,
  shouldFallbackForMissingRuntimeFile,
} from "./fallback-compile-service";
import { unavailableCompileService } from "./unavailable-compile-service";

let compileOverride: CompileService | null = null;
let compileResolved: CompileService | null = null;
let compileResolving: Promise<CompileService> | null = null;
/** URL probed once on first getCompileService(); presence indicates
 *  the user ran `npm run setup:engine` and the worker is available. */
const BUSYTEX_PROBE_URL = "/core/busytex/busytex_worker.js";
const SWIFTLATEX_PROBE_URL = "/engine/swiftlatexpdftex.worker.js";

/**
 * Returns the active CompileService binding. Order of precedence:
 *   1. Test override (setCompileService)
 *   2. BusyTeX, if the TeX Live WASM worker is reachable
 *   3. SwiftLaTeX, if the older pdfTeX worker is reachable
 *   4. An honest unavailable-engine service when no real engine assets exist
 *
 * Async by design: the first call HEAD-probes the engine and waits
 * for the result so the very first compile uses the real engine
 * when it's installed.
 */
export async function getCompileService(): Promise<CompileService> {
  if (compileOverride) return compileOverride;
  if (compileResolved) return compileResolved;
  if (compileResolving) return compileResolving;

  compileResolving = (async () => {
    try {
      if (typeof window === "undefined" || typeof fetch === "undefined") {
        return unavailableCompileService;
      }

      const [busyAvailable, swiftAvailable] = await Promise.all([
        probeCompileAsset(BUSYTEX_PROBE_URL),
        probeCompileAsset(SWIFTLATEX_PROBE_URL),
      ]);
      const busy = busyAvailable
        ? new BusyTexCompileService({ freshRunnerPerCompile: true })
        : null;
      const swift = swiftAvailable
        ? new SwiftLaTeXCompileService({ freshEnginePerCompile: true })
        : null;

      let chosen: CompileService;
      if (busy && swift) {
        chosen = new FallbackCompileService(busy, swift, shouldFallbackForMissingRuntimeFile);
      } else {
        chosen = busy ?? swift ?? unavailableCompileService;
      }

      // A missing asset can be a transient dev-server or deployment
      // condition. Cache real engines, but let a later compile probe
      // again instead of pinning the session to an unavailable state.
      if (chosen !== unavailableCompileService) compileResolved = chosen;
      return chosen;
    } finally {
      compileResolving = null;
    }
  })();
  return compileResolving;
}

async function probeCompileAsset(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    // SPA fallback handlers commonly answer missing asset requests with
    // index.html and HTTP 200. Treat that as unavailable: passing HTML to a
    // Worker produces an opaque startup error that looks like an engine fault.
    return (
      response.ok && (contentType.includes("javascript") || contentType.includes("ecmascript"))
    );
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Test-only: swap the compile binding. Pass null to clear cache. */
export function setCompileService(svc: CompileService | null): void {
  compileOverride = svc;
  if (svc === null) {
    compileResolved = null;
    compileResolving = null;
  }
}
