import type { CompileResult, LogEntry, Project } from "@/domain";
import type { CompileInput, CompileProgress, CompileService } from "./compile-service";

// Deterministic compile test double. It inspects effective entry-file content
// and synthesizes predictable diagnostics:
//   - unbalanced \begin{}...\end{}  -> error at the unmatched opener
//   - any \error{...} marker      -> error at that line
//   - any \todo{...} marker        -> warning at that line
//   - otherwise                    -> success
//
export interface MockCompileOptions {
  stepDelayMs?: number;
  engine?: string;
}

const DEFAULT_STEPS = [
  "Loading TeX Live",
  "Resolving packages",
  "Running XeLaTeX (pass 1/2)",
  "Running XeLaTeX (pass 2/2)",
  "Rendering pages",
] as const;

const DEFAULT_DELAY = 120;

export class MockCompileService implements CompileService {
  private readonly delay: number;
  private readonly engine: string;

  constructor(options: MockCompileOptions = {}) {
    this.delay = options.stepDelayMs ?? DEFAULT_DELAY;
    this.engine = options.engine ?? "Local preview engine";
  }

  async compile(
    { project, edits }: CompileInput,
    options: { onProgress?: (p: CompileProgress) => void; signal?: AbortSignal } = {},
  ): Promise<CompileResult> {
    const start = Date.now();
    const steps = [...DEFAULT_STEPS];
    for (let i = 0; i < steps.length; i++) {
      if (options.signal?.aborted) return aborted(this.engine, start);
      options.onProgress?.({ label: steps[i]!, index: i, total: steps.length });
      await sleep(this.delay, options.signal);
    }

    const content = effectiveContent(project, edits);
    const issues = analyseSource(project.entry, content);
    const durationMs = Date.now() - start;
    const durationLabel = formatDuration(durationMs);

    if (issues.errors.length > 0) {
      return {
        status: "error",
        durationMs,
        durationLabel,
        engine: this.engine,
        log: [...issues.errors, ...issues.warnings, ...infoFooter(durationMs)],
      };
    }
    if (issues.warnings.length > 0) {
      return {
        status: "warning",
        durationMs,
        durationLabel,
        engine: this.engine,
        log: [...issues.warnings, ...infoFooter(durationMs)],
        pdf: new Uint8Array([37, 80, 68, 70]),
      };
    }
    return {
      status: "success",
      durationMs,
      durationLabel,
      engine: this.engine,
      log: infoFooter(durationMs),
      pdf: new Uint8Array([37, 80, 68, 70]),
    };
  }
}

export const mockCompileService = new MockCompileService();

// -- Internals --------------------------------------------------

function effectiveContent(project: Project, edits: Record<string, string> | undefined): string {
  const entry = project.entry;
  const edit = edits?.[entry];
  if (edit !== undefined) return edit;
  const content = project.files[entry]?.content;
  return typeof content === "string" ? content : "";
}

interface Issues {
  errors: LogEntry[];
  warnings: LogEntry[];
}

/**
 * Pure source-analysis helper. Exported so tests can poke at it
 * without spinning up the whole compile lifecycle.
 */
export function analyseSource(filePath: string, content: string): Issues {
  const errors: LogEntry[] = [];
  const warnings: LogEntry[] = [];
  const stack: Array<{ env: string; line: number; column: number }> = [];

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;

    // Explicit markers let UI tests target deterministic source locations.
    const errMark = /\\error\{([^}]*)\}/.exec(line);
    if (errMark) {
      errors.push({
        level: "error",
        message: errMark[1] ?? "Explicit \\error marker",
        filePath,
        line: lineNo,
        column: errMark.index + 1,
      });
    }
    const todoMark = /\\todo\{([^}]*)\}/.exec(line);
    if (todoMark) {
      warnings.push({
        level: "warn",
        message: `TODO: ${todoMark[1] ?? "unspecified"}`,
        filePath,
        line: lineNo,
        column: todoMark.index + 1,
      });
    }

    // Naive \begin/\end balance - does not respect comments or
    // verbatim. Browser TeX engines handle richer diagnostics.
    const beginRe = /\\begin\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = beginRe.exec(line))) {
      stack.push({ env: m[1]!, line: lineNo, column: m.index + 1 });
    }
    const endRe = /\\end\{([^}]+)\}/g;
    while ((m = endRe.exec(line))) {
      const env = m[1]!;
      const top = stack[stack.length - 1];
      if (!top) {
        errors.push({
          level: "error",
          message: `\\end{${env}} without matching \\begin`,
          filePath,
          line: lineNo,
          column: m.index + 1,
        });
      } else if (top.env !== env) {
        errors.push({
          level: "error",
          message: `Mismatched environment: expected \\end{${top.env}}, got \\end{${env}}`,
          filePath,
          line: lineNo,
          column: m.index + 1,
        });
        stack.pop();
      } else {
        stack.pop();
      }
    }
  }

  for (const open of stack) {
    errors.push({
      level: "error",
      message: `Unclosed environment \\begin{${open.env}}`,
      filePath,
      line: open.line,
      column: open.column,
    });
  }

  return { errors, warnings };
}

function infoFooter(durationMs: number): LogEntry[] {
  return [{ level: "info", message: `Local compile finished in ${formatDuration(durationMs)}` }];
}

function aborted(engine: string, start: number): CompileResult {
  const durationMs = Date.now() - start;
  return {
    status: "idle",
    durationMs,
    durationLabel: formatDuration(durationMs),
    engine,
    log: [{ level: "info", message: "Compile cancelled" }],
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}
