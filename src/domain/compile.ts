// Compile lifecycle domain types. The interface is shaped so engine
// implementations can be swapped without touching consumers.

export type CompileStatus = "idle" | "compiling" | "success" | "warning" | "error";

export interface CompileResult {
  status: CompileStatus;
  durationMs?: number;
  /** Preformatted duration for status UI. */
  durationLabel?: string;
  engine?: string;
  log: LogEntry[];
  /** Absent when compilation fails; preview never synthesizes replacement output. */
  pdf?: Uint8Array;
  /** Raw `.synctex.gz` bytes; parsed lazily for bidirectional navigation. */
  synctex?: Uint8Array;
}

export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  /** Missing for diagnostics that cannot be tied to source. */
  filePath?: string;
  line?: number;
  column?: number;
}

export function uniqueCompileIssues(entries: readonly LogEntry[]): LogEntry[] {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    if (entry.level === "info") return false;

    const key = JSON.stringify([
      entry.level,
      entry.message,
      entry.filePath ?? null,
      entry.line ?? null,
      entry.column ?? null,
    ]);
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}
