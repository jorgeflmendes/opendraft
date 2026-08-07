import { activeFilePaths, type CompileResult, type LogEntry, type Project } from "@/domain";
import { assetUrl } from "@/lib/asset-url";
import { dirname } from "./path-utils";
import type { CompileInput, CompileProgress, CompileService } from "./compile-service";
import { generateClassicBibtexBbl } from "./classic-bibtex";
import { CtanFetcher } from "./ctan-fetcher";
import { analyseServerlessCompatibility } from "./latex-compatibility";
import { combineLatexLogs, runLatexBuild } from "./latex-build-orchestrator";
import { SwiftLaTeXEngine } from "./swiftlatex-engine";

// SwiftLaTeX service backed by a lazily initialized, CTAN-aware pdfTeX worker.

const MAX_LATEX_PASSES = 5;

const SETUP_STEPS = ["Loading LaTeX engine", "Writing project files"] as const;

interface SwiftLaTeXCompileOptions {
  workerUrl?: string;
  fmtUrl?: string;
  pdftexMapUrl?: string;
  ctanIndexUrl?: string;
  engine?: string;
  maxPasses?: number;
  freshEnginePerCompile?: boolean;
  createEngine?: () => SwiftLaTeXEngine;
}

export class SwiftLaTeXCompileService implements CompileService {
  private engine: SwiftLaTeXEngine | null = null;
  private readonly workerUrl: string;
  private readonly fmtUrl: string;
  private readonly pdftexMapUrl: string;
  private readonly ctanIndexUrl: string;
  private readonly engineLabel: string;
  private readonly maxPasses: number;
  private readonly freshEnginePerCompile: boolean;
  private readonly factory: () => SwiftLaTeXEngine;
  private inflight: Promise<unknown> = Promise.resolve();

  constructor(options: SwiftLaTeXCompileOptions = {}) {
    this.workerUrl = options.workerUrl ?? assetUrl("engine/swiftlatexpdftex.worker.js");
    this.fmtUrl = options.fmtUrl ?? assetUrl("engine/swiftlatexpdftex.fmt");
    this.pdftexMapUrl = options.pdftexMapUrl ?? assetUrl("engine/pdftex.map");
    this.ctanIndexUrl = options.ctanIndexUrl ?? assetUrl("engine/texlive-index.json");
    this.engineLabel = options.engine ?? "pdfTeX · WASM (CTAN-fetching)";
    this.maxPasses = options.maxPasses ?? MAX_LATEX_PASSES;
    this.freshEnginePerCompile = options.freshEnginePerCompile ?? false;
    this.factory =
      options.createEngine ??
      (() =>
        new SwiftLaTeXEngine({
          workerUrl: this.workerUrl,
          fmtUrl: this.fmtUrl,
          pdftexMapUrl: this.pdftexMapUrl,
          ctanFetcher: new CtanFetcher({ indexUrl: this.ctanIndexUrl }),
        }));
  }

  async compile(
    input: CompileInput,
    options: { onProgress?: (p: CompileProgress) => void; signal?: AbortSignal } = {},
  ): Promise<CompileResult> {
    const previous = this.inflight;
    let resolveCurrent: () => void = () => {};
    this.inflight = new Promise<void>((resolve) => {
      resolveCurrent = resolve;
    });
    try {
      await previous;
    } catch {
      // Queue continuity is independent from the previous result.
    }
    try {
      return await this.compileWithEngine(input, options);
    } finally {
      if (this.freshEnginePerCompile) this.disposeEngine();
      resolveCurrent();
    }
  }

  private async compileWithEngine(
    { project, edits }: CompileInput,
    options: { onProgress?: (p: CompileProgress) => void; signal?: AbortSignal } = {},
  ): Promise<CompileResult> {
    const start = Date.now();
    const progressTotal = SETUP_STEPS.length + this.maxPasses + 1;
    const fire = (label: string, index: number) =>
      options.onProgress?.({ label, index, total: progressTotal });

    const compatibilityIssues = analyseServerlessCompatibility(project, edits);
    if (compatibilityIssues.length > 0) {
      return {
        status: "error",
        durationMs: Date.now() - start,
        durationLabel: formatDuration(Date.now() - start),
        engine: this.engineLabel,
        log: [
          ...compatibilityIssues,
          {
            level: "info",
            message: "Compile stopped before engine boot to keep execution fully serverless.",
          },
        ],
      };
    }

    fire(SETUP_STEPS[0]!, 0);
    if (options.signal?.aborted) return abortedResult(this.engineLabel, start);
    try {
      if (!this.engine) this.engine = this.factory();
      if (!this.engine.isReady()) await this.engine.load();
    } catch (e) {
      this.disposeEngine();
      return engineErrorResult(this.engineLabel, start, e);
    }

    fire(SETUP_STEPS[1]!, 1);
    if (options.signal?.aborted) {
      this.disposeEngine();
      return abortedResult(this.engineLabel, start);
    }
    const generatedBibliography = generateClassicBibtexBbl(project, edits);
    await writeProjectFiles(this.engine, project, edits);
    if (generatedBibliography) {
      const dir = dirname(generatedBibliography.path);
      if (dir) this.engine.makeMemFSFolder(dir);
      this.engine.writeMemFSFile(generatedBibliography.path, generatedBibliography.content);
    }
    this.engine.setEngineMainFile(project.entry);

    let build;
    try {
      build = await runLatexBuild({
        maxPasses: this.maxPasses,
        progressStartIndex: SETUP_STEPS.length,
        progressTotal,
        onProgress: options.onProgress,
        signal: options.signal,
        runPass: () => this.engine!.compileLaTeX(),
      });
    } catch (e) {
      this.disposeEngine();
      return engineErrorResult(this.engineLabel, start, e);
    }
    if (build.stopReason === "aborted") {
      this.disposeEngine();
      return abortedResult(this.engineLabel, start);
    }
    const response = build.response;
    if (!response) {
      this.disposeEngine();
      return engineErrorResult(this.engineLabel, start, "No pdfTeX response");
    }

    fire("Reading PDF output", progressTotal - 1);
    const durationMs = Date.now() - start;
    const durationLabel = formatDuration(durationMs);
    const parsedLogSource = response.result === "ok" ? response.log : combineLatexLogs(build.logs);
    const log = parseEngineLog(parsedLogSource, project.entry);
    const convergenceLog: LogEntry[] =
      build.stopReason === "max-passes"
        ? [
            {
              level: "warn",
              message: `Stopped after ${this.maxPasses} pdfTeX passes; references may still be unstable.`,
              filePath: project.entry,
            },
          ]
        : [];

    if (response.result !== "ok") {
      // If the parser didn't match a known pdfTeX pattern (some
      // failures emit just an Emscripten "Engine crashed" or a bare
      // stderr trace), surface the raw tail of the log so the user
      // isn't staring at "no log".
      const fallback: LogEntry[] =
        log.length > 0
          ? log
          : response.log
            ? [{ level: "error", message: tailOfLog(response.log) }]
            : [{ level: "error", message: "Compile failed (no log)" }];
      const result: CompileResult = {
        status: "error",
        durationMs,
        durationLabel,
        engine: this.engineLabel,
        log: [...fallback, ...convergenceLog],
      };
      this.disposeEngine();
      return result;
    }

    const extraLog = generatedBibliography?.log ?? [];
    const warningCount = [...log, ...convergenceLog, ...extraLog].filter(
      (l) => l.level === "warn",
    ).length;
    const status = warningCount > 0 ? "warning" : "success";
    const passLabel = `${build.passCount} pdfTeX ${build.passCount === 1 ? "pass" : "passes"}`;
    return {
      status,
      durationMs,
      durationLabel,
      engine: this.engineLabel,
      log: [
        ...log,
        ...convergenceLog,
        ...extraLog,
        { level: "info", message: `Local compile finished in ${durationLabel} after ${passLabel}` },
      ],
      pdf: new Uint8Array(response.pdf),
      // This SwiftLaTeX worker does not expose main.synctex.gz in
      // its response, so this backend compiles without source-to-PDF
      // navigation. BusyTeX provides SyncTeX in the primary path.
    };
  }

  private disposeEngine(): void {
    if (!this.engine) return;
    try {
      this.engine.close();
    } catch {
      // The worker may already have terminated after a runtime failure.
    }
    this.engine = null;
  }
}

// -- Internals --------------------------------------------------

async function writeProjectFiles(
  engine: SwiftLaTeXEngine,
  project: Project,
  edits: Record<string, string> | undefined,
): Promise<void> {
  const paths = new Set(activeFilePaths(project, edits));
  const folders = new Set<string>();
  for (const path of paths) {
    const dir = dirname(path);
    if (dir && !folders.has(dir)) {
      const parts = dir.split("/");
      let current = "";
      for (const part of parts) {
        if (!part) continue;
        current = current ? `${current}/${part}` : part;
        if (!folders.has(current)) {
          folders.add(current);
          engine.makeMemFSFolder(current);
        }
      }
    }
    let content = edits?.[path] ?? project.files[path]?.content ?? "";
    if (content instanceof Blob) {
      content = new Uint8Array(await content.arrayBuffer());
    }
    engine.writeMemFSFile(path, content);
  }
}

/**
 * Lightweight pdfTeX log parser. Pulls error / warning lines into
 * LogEntry, mapping line numbers when present. Anything we don't
 * recognise falls through as a single info entry per chunk.
 *
 * pdfTeX errors look like:
 *   ! Undefined control sequence.
 *   l.14 \omegaa
 * Warnings look like:
 *   LaTeX Warning: Reference `foo' on page 1 undefined on input line 14.
 */
export function parseEngineLog(raw: string, defaultPath: string): LogEntry[] {
  if (!raw) return [];
  const out: LogEntry[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // pdfTeX errors come in three flavours:
    //   `! Undefined control sequence.`        (LaTeX-level, with l.N follow-up)
    //   `!pdfTeX error:  (file foo): ...`     (engine-level, no space, no l.N)
    //   `==> Fatal error occurred, ...`        (cascade footer)
    const isClassicErr = line.startsWith("! ");
    const isPdftexErr = line.startsWith("!pdfTeX error");
    const isFatalErr = line.startsWith("==> Fatal error") || line.includes("Engine crashed");
    if (isClassicErr || isPdftexErr || isFatalErr) {
      const message = isClassicErr
        ? line.slice(2).trim()
        : isPdftexErr
          ? line.replace(/^!pdfTeX error:\s*/, "").trim()
          : line.replace(/^==>\s*/, "").trim();
      // Look ahead a few lines for the "l.<N> ..." line number marker.
      let lineNo: number | undefined;
      if (isClassicErr) {
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const probe = lines[j] ?? "";
          const m = /^l\.(\d+)\b/.exec(probe);
          if (m) {
            lineNo = Number(m[1]);
            break;
          }
        }
      }
      out.push({
        level: "error",
        message,
        filePath: defaultPath,
        ...(lineNo !== undefined ? { line: lineNo } : {}),
      });
      continue;
    }
    const warn = /(LaTeX|Package \w+) Warning:\s*(.+?)(?:\s+on input line (\d+))?\.?$/i.exec(line);
    if (warn) {
      const lineNo = warn[3] ? Number(warn[3]) : undefined;
      out.push({
        level: "warn",
        message: `${warn[1]}: ${warn[2]}`,
        filePath: defaultPath,
        ...(lineNo !== undefined ? { line: lineNo } : {}),
      });
    }
  }
  return out;
}

function abortedResult(engine: string, start: number): CompileResult {
  const durationMs = Date.now() - start;
  return {
    status: "idle",
    durationMs,
    durationLabel: formatDuration(durationMs),
    engine,
    log: [{ level: "info", message: "Compile cancelled" }],
  };
}

function engineErrorResult(engine: string, start: number, e: unknown): CompileResult {
  const durationMs = Date.now() - start;
  return {
    status: "error",
    durationMs,
    durationLabel: formatDuration(durationMs),
    engine,
    log: [
      {
        level: "error",
        message:
          e instanceof Error
            ? `Engine failed to load: ${e.message}`
            : `Engine failed to load: ${String(e)}`,
      },
    ],
  };
}

function tailOfLog(raw: string): string {
  // Surface the last ~1200 chars - that's where pdfTeX prints its
  // actual error context, after thousands of lines of package noise.
  const trimmed = raw.trimEnd();
  if (trimmed.length <= 1200) return trimmed;
  return "...\n" + trimmed.slice(-1200);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
