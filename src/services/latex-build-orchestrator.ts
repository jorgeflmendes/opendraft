import type { CompileProgress } from "./compile-service";

export type LatexPassResponse =
  | {
      result: "ok";
      log: string;
      status: number;
      pdf: ArrayBuffer;
    }
  | {
      result: "failed";
      log: string;
      status: number;
    };

export type LatexBuildStopReason = "stable" | "failed" | "max-passes" | "aborted";

export interface LatexBuildResult {
  response: LatexPassResponse | null;
  passCount: number;
  logs: string[];
  stopReason: LatexBuildStopReason;
}

interface RunLatexBuildOptions {
  maxPasses?: number;
  progressStartIndex?: number;
  progressTotal?: number;
  onProgress?: ((p: CompileProgress) => void) | undefined;
  signal?: AbortSignal | undefined;
  runPass: (pass: number) => Promise<LatexPassResponse>;
}

const DEFAULT_MAX_PASSES = 5;

const RERUN_PATTERNS = [
  /Rerun to get cross-references right/i,
  /Label\(s\) may have changed\.?\s*Rerun/i,
  /There were undefined references/i,
  /Package rerunfilecheck Warning: File .+ has changed/i,
  /No file .+\.(aux|toc|lof|lot|out|nav|snm)\b/i,
] as const;

export async function runLatexBuild({
  maxPasses = DEFAULT_MAX_PASSES,
  progressStartIndex = 0,
  progressTotal = maxPasses,
  onProgress,
  signal,
  runPass,
}: RunLatexBuildOptions): Promise<LatexBuildResult> {
  const logs: string[] = [];
  let lastResponse: LatexPassResponse | null = null;

  for (let pass = 1; pass <= maxPasses; pass++) {
    if (signal?.aborted) {
      return { response: lastResponse, passCount: pass - 1, logs, stopReason: "aborted" };
    }

    onProgress?.({
      label: `Running pdfTeX (pass ${pass}/${maxPasses})`,
      index: progressStartIndex + pass - 1,
      total: progressTotal,
    });

    const response = await runWithAbort(runPass(pass), signal);
    lastResponse = response;
    logs.push(response.log);

    if (signal?.aborted) {
      return { response: lastResponse, passCount: pass, logs, stopReason: "aborted" };
    }

    if (response.result !== "ok") {
      return { response, passCount: pass, logs, stopReason: "failed" };
    }

    if (!latexLogRequestsRerun(response.log)) {
      return { response, passCount: pass, logs, stopReason: "stable" };
    }
  }

  return {
    response: lastResponse,
    passCount: maxPasses,
    logs,
    stopReason: "max-passes",
  };
}

async function runWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw new DOMException("Compile cancelled", "AbortError");

  let settled = false;
  let abortHandler: (() => void) | null = null;
  const abortPromise = new Promise<T>((_, reject) => {
    abortHandler = () => {
      if (settled) return;
      reject(new DOMException("Compile cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abortHandler, { once: true });
  });

  try {
    return await Promise.race([promise, abortPromise]);
  } finally {
    settled = true;
    if (abortHandler) signal.removeEventListener("abort", abortHandler);
    promise.catch(() => {});
  }
}

export function latexLogRequestsRerun(log: string): boolean {
  return RERUN_PATTERNS.some((pattern) => pattern.test(log));
}

export function combineLatexLogs(logs: string[]): string {
  return logs.filter(Boolean).join("\n\n");
}
