import { uniqueCompileIssues, type CompileStatus, type LogEntry } from "@/domain";

interface EditorStatusInput {
  flashError: string | null;
  flashNotice: string | null;
  savedAt: number | null;
  autoSavedAt: number | null;
  compileStatus: CompileStatus;
  compileProgress: string | undefined;
}

interface CompileResultSummary {
  durationLabel?: string | undefined;
  log: LogEntry[];
}

export function editorStatusLabel({
  flashError,
  flashNotice,
  savedAt,
  autoSavedAt,
  compileStatus,
  compileProgress,
}: EditorStatusInput): string {
  if (flashError) return `Save failed: ${flashError}`;
  if (flashNotice) return flashNotice;
  if (savedAt) return "Saved (local)";
  if (autoSavedAt) return "Auto-saved";

  switch (compileStatus) {
    case "compiling":
      return compileProgress ? `Compiling / ${compileProgress}` : "Compiling...";
    case "success":
      return "Compiled / success";
    case "warning":
      return "Compiled / with warnings";
    case "error":
      return "Compile failed";
    default:
      return "Ln 1, Col 1";
  }
}

export function editorResultLabel(
  status: CompileStatus,
  result: CompileResultSummary | null,
  dirtyCount: number,
): string {
  if (dirtyCount > 0) return `${dirtyCount} unsaved`;
  if (status === "compiling") return "compiling...";
  if (!result) return "Not compiled";

  const issues = uniqueCompileIssues(result.log);
  const errors = issues.filter((entry) => entry.level === "error").length;
  const warnings = issues.filter((entry) => entry.level === "warn").length;
  if (errors > 0) return `${errors} error${errors === 1 ? "" : "s"}`;
  if (warnings > 0) return `${warnings} warning${warnings === 1 ? "" : "s"}`;
  return result.durationLabel ?? "-";
}
