import type { CompileResult } from "@/domain";
import type { CompileInput, CompileProgress, CompileService } from "./compile-service";

const RUNTIME_FILE_PATTERN =
  /(?:file\s+[`'"]?|can't find file\s+[`'"]?)([^`'"\s]+\.(?:sty|cls|clo|def|fd|cfg|bst|tfm))\b/i;

export function shouldFallbackForMissingRuntimeFile(result: CompileResult): boolean {
  return (
    result.status === "error" &&
    result.log.some((entry) => RUNTIME_FILE_PATTERN.test(entry.message))
  );
}

export class FallbackCompileService implements CompileService {
  constructor(
    private readonly primary: CompileService,
    private readonly fallback: CompileService,
    private readonly shouldFallback: (result: CompileResult) => boolean,
  ) {}

  async compile(
    input: CompileInput,
    options: { onProgress?: (progress: CompileProgress) => void; signal?: AbortSignal } = {},
  ): Promise<CompileResult> {
    const primaryResult = await this.primary.compile(input, options);
    if (!this.shouldFallback(primaryResult) || options.signal?.aborted) return primaryResult;

    options.onProgress?.({
      label: "Retrying with fallback LaTeX engine",
      index: 0,
      total: 1,
    });
    const fallbackResult = await this.fallback.compile(input, options);
    const transition = {
      level: "info" as const,
      message: `Retried with ${fallbackResult.engine ?? "the fallback LaTeX engine"} after the primary engine could not load a runtime file.`,
    };

    if (fallbackResult.status === "success" || fallbackResult.status === "warning") {
      return {
        ...fallbackResult,
        log: [transition, ...fallbackResult.log],
      };
    }

    const primarySummary = {
      level: "info" as const,
      message: `The primary engine (${primaryResult.engine ?? "unknown"}) failed before fallback: ${primaryResult.log.map((entry) => entry.message).join(" / ")}`,
    };
    return {
      ...fallbackResult,
      log: [transition, ...fallbackResult.log, primarySummary],
    };
  }
}
