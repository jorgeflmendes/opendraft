import { useId, useState } from "react";
import { uniqueCompileIssues, type LogEntry } from "@/domain";
import { I } from "@/components/primitives";

interface CompileLogProps {
  entries: readonly LogEntry[];
  /** Called when the user clicks a source-bound entry. */
  onJump: (path: string, line: number, column: number | undefined) => void;
}

/**
 * Slide-down log panel rendered above the editor body whenever
 * the latest compile produced errors or warnings. Info entries
 * are filtered out - they're just the engine's "done in 1.24s"
 * footer noise. Clicking a source-bound entry navigates the
 * editor to that line.
 */
export function CompileLog({ entries, onJump }: CompileLogProps) {
  const relevant = uniqueCompileIssues(entries);
  const [expanded, setExpanded] = useState(true);
  const listId = useId();
  if (relevant.length === 0) return null;

  return (
    <div className="od-log" role="region" aria-label="Compile log">
      <button
        type="button"
        className="od-log-head"
        aria-controls={listId}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        title={expanded ? "Hide compile issues" : "Show compile issues"}
      >
        <I.alert size={12} />
        <span>
          {relevant.length} {relevant.length === 1 ? "issue" : "issues"}
        </span>
        <span className="grow" />
        <I.chevronD
          className={`od-log-chevron${expanded ? " is-expanded" : ""}`}
          size={12}
          aria-hidden="true"
        />
      </button>
      {expanded ? (
        <ul id={listId} className="od-log-list">
          {relevant.map((entry, i) => (
            <LogRow key={i} entry={entry} onJump={onJump} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function LogRow({
  entry,
  onJump,
}: {
  entry: LogEntry;
  onJump: (path: string, line: number, column: number | undefined) => void;
}) {
  const location = entry.filePath
    ? entry.line
      ? `${entry.filePath}:${entry.line}${entry.column ? `:${entry.column}` : ""}`
      : entry.filePath
    : "";

  const interactive = entry.filePath !== undefined && entry.line !== undefined;
  const cls = ["od-log-row", `od-log-row--${entry.level}`].join(" ");
  const handler = interactive
    ? () => onJump(entry.filePath!, entry.line!, entry.column)
    : undefined;

  return (
    <li>
      <button
        type="button"
        className={cls}
        onClick={handler}
        disabled={!interactive}
        title={interactive ? `Jump to ${location}` : undefined}
      >
        <span className="od-log-badge">{entry.level === "error" ? "ERROR" : "WARN"}</span>
        <span className="od-log-msg">{entry.message}</span>
        {location && <span className="od-log-loc">{location}</span>}
      </button>
    </li>
  );
}
