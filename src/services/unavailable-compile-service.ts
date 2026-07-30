import type { CompileResult } from "@/domain";
import type { CompileInput, CompileProgress, CompileService } from "./compile-service";

export class UnavailableCompileService implements CompileService {
  async compile(
    _input: CompileInput,
    _options: { onProgress?: (p: CompileProgress) => void; signal?: AbortSignal } = {},
  ): Promise<CompileResult> {
    return {
      status: "error",
      engine: "Browser TeX engine unavailable",
      log: [
        {
          level: "error",
          message:
            "No browser TeX engine assets were found. Run npm run setup:engine or deploy /core/busytex/ and /engine/ assets before compiling.",
        },
      ],
    };
  }
}

export const unavailableCompileService = new UnavailableCompileService();
