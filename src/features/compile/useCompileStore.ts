import { create } from "zustand";
import type { CompileResult, CompileStatus } from "@/domain";
import { getCompileService, type CompileInput, type CompileProgress } from "@/services";
import { parseSynctex, type SyncTexIndex } from "@/services/synctex";
import { errorMessage } from "@/lib/errors";

/** Transient compile state, intentionally independent of persisted project data. */
interface CompileState {
  status: CompileStatus;
  result: CompileResult | null;
  progress: CompileProgress | null;
  /** Parsed index for the current result; navigation is disabled while absent. */
  synctex: SyncTexIndex | null;
  /** Input snapshot used to detect whether the displayed PDF is stale. */
  compiledInput: CompileInput | null;

  compile: (input: CompileInput) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export const useCompileStore = create<CompileState>((set, get) => {
  let abortCtrl: AbortController | null = null;

  return {
    status: "idle",
    result: null,
    progress: null,
    synctex: null,
    compiledInput: null,

    compile: async (input) => {
      // Only the newest invocation may publish progress or results.
      abortCtrl?.abort();
      const ctrl = new AbortController();
      abortCtrl = ctrl;

      set({ status: "compiling", progress: null });
      try {
        const service = await getCompileService();
        const result = await service.compile(input, {
          signal: ctrl.signal,
          onProgress: (progress) => {
            if (ctrl.signal.aborted) return;
            set({ progress });
          },
        });
        if (ctrl.signal.aborted) return;
        // Never expose the previous document's source map with a new result.
        set({ status: result.status, result, progress: null, synctex: null, compiledInput: input });
        if (result.synctex) {
          try {
            const idx = await parseSynctex(result.synctex);
            // Parsing is asynchronous; publish only if this result is still current.
            if (get().result === result && idx) set({ synctex: idx });
          } catch {
            // SyncTeX is optional; a malformed index must not hide a valid PDF.
          }
        }
      } catch (e) {
        if (ctrl.signal.aborted) return;
        set({
          status: "error",
          progress: null,
          synctex: null,
          result: {
            status: "error",
            engine: get().result?.engine ?? "unknown",
            log: [{ level: "error", message: errorMessage(e) }],
          },
          compiledInput: input,
        });
      } finally {
        if (abortCtrl === ctrl) abortCtrl = null;
      }
    },

    cancel: () => {
      abortCtrl?.abort();
      abortCtrl = null;
      set({ status: "idle", progress: null });
    },

    reset: () => {
      abortCtrl?.abort();
      abortCtrl = null;
      set({ status: "idle", result: null, progress: null, synctex: null, compiledInput: null });
    },
  };
});
