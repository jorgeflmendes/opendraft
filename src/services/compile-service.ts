import type { CompileResult, Project } from "@/domain";

export interface CompileInput {
  project: Project;
  /** Overlay edits: path -> in-memory content. When a path is
   *  present here it shadows the project's stored content for the
   *  duration of this compile. Lets us compile against unsaved
   *  edits without forcing a save first. */
  edits?: Record<string, string>;
}

export interface CompileProgress {
  label: string;
  index: number;
  total: number;
}

export interface CompileService {
  /**
   * Run a compile. Resolves with the final CompileResult - success,
   * warning, or error. `onProgress` is invoked between steps so
   * the UI can render an active step. `signal` lets a long-running
   * engine bail out when the user cancels.
   */
  compile(
    input: CompileInput,
    options?: { onProgress?: (p: CompileProgress) => void; signal?: AbortSignal },
  ): Promise<CompileResult>;
}
