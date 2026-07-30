import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Button, I, Pill } from "@/components/primitives";
import { useProjectsStore } from "@/features/projects";
import { useTabsStore } from "@/features/editor";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import { useDiffStore } from "./useDiffStore";
import { diffProject, type FileDiff } from "./project-diff";

export function DiffPanel() {
  const open = useDiffStore((s) => s.open);
  const close = useDiffStore((s) => s.closeDiff);
  const active = useProjectsStore((s) => s.active);
  const edits = useTabsStore((s) => s.edits);

  const summary = useMemo(
    () => (open && active ? diffProject(active, edits) : null),
    [open, active, edits],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  // Preserve selection across recomputations, falling back when its file disappears.
  useEffect(() => {
    if (!summary) return;
    if (selected && summary.files.some((f) => f.path === selected)) return;
    setSelected(summary.files[0]?.path ?? null);
  }, [summary, selected]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!open) return null;
  if (!summary) return null;

  const selectedFile = summary.files.find((f) => f.path === selected) ?? null;

  return (
    <div
      className="od-diff-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Diff against last saved"
    >
      <div className="od-diff-modal" ref={trapRef} tabIndex={-1}>
        <header className="od-diff-header">
          <strong>Diff</strong>
          <span className="od-diff-subtle">vs. last saved</span>
          <span className="grow" />
          <DiffTotals
            added={summary.totals.added}
            removed={summary.totals.removed}
            changed={summary.changedCount}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label="Close diff"
            onClick={close}
            leadingIcon={<I.x size={12} />}
          >
            Close
          </Button>
        </header>
        {summary.files.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="od-diff-body">
            <aside className="od-diff-files">
              {summary.files.map((f) => (
                <DiffFileRow
                  key={f.path}
                  file={f}
                  active={f.path === selected}
                  onClick={() => setSelected(f.path)}
                />
              ))}
            </aside>
            <section className="od-diff-pane">
              {selectedFile ? (
                <UnifiedDiffView file={selectedFile} />
              ) : (
                <p className="od-diff-subtle" style={{ padding: 16 }}>
                  Select a file on the left.
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function DiffTotals({
  added,
  removed,
  changed,
}: {
  added: number;
  removed: number;
  changed: number;
}): ReactElement {
  return (
    <span className="od-diff-totals" aria-label={`${changed} files changed`}>
      <span className="od-diff-totals-count">{changed} files</span>
      <span className="od-diff-totals-add">+{added}</span>
      <span className="od-diff-totals-del">-{removed}</span>
    </span>
  );
}

function DiffFileRow({
  file,
  active,
  onClick,
}: {
  file: FileDiff;
  active: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={`od-diff-file-row${active ? " active" : ""}`}
      onClick={onClick}
      aria-current={active ? "true" : undefined}
    >
      <span className="od-diff-file-name">{file.path}</span>
      <span className="od-diff-file-meta">
        <StatusPill status={file.status} />
        {file.isBinary && <Pill>binary</Pill>}
        {!file.isBinary && (
          <>
            <span className="od-diff-totals-add">+{file.stats.added}</span>
            <span className="od-diff-totals-del">-{file.stats.removed}</span>
          </>
        )}
      </span>
    </button>
  );
}

function StatusPill({ status }: { status: FileDiff["status"] }): ReactElement {
  if (status === "added") return <Pill tone="ok">added</Pill>;
  if (status === "deleted") return <Pill tone="err">deleted</Pill>;
  if (status === "modified") return <Pill tone="info">modified</Pill>;
  return <Pill>unchanged</Pill>;
}

function UnifiedDiffView({ file }: { file: FileDiff }): ReactElement {
  if (file.isBinary) {
    return (
      <p className="od-diff-subtle" style={{ padding: 16 }}>
        Binary file - no inline diff.
      </p>
    );
  }
  if (file.ops.length === 0) {
    return (
      <p className="od-diff-subtle" style={{ padding: 16 }}>
        No differences in <code>{file.path}</code>.
      </p>
    );
  }
  return (
    <pre className="od-diff-unified" aria-label={`Diff of ${file.path}`}>
      {file.ops.map((op, i) => {
        const cls =
          op.kind === "insert"
            ? "od-diff-line added"
            : op.kind === "delete"
              ? "od-diff-line removed"
              : "od-diff-line context";
        const sign = op.kind === "insert" ? "+" : op.kind === "delete" ? "-" : " ";
        const oldNo = op.oldLine !== undefined ? op.oldLine + 1 : "";
        const newNo = op.newLine !== undefined ? op.newLine + 1 : "";
        return (
          <span key={`${op.kind}-${i}`} className={cls}>
            <span className="od-diff-gutter">{String(oldNo).padStart(4, " ")}</span>
            <span className="od-diff-gutter">{String(newNo).padStart(4, " ")}</span>
            <span className="od-diff-sign">{sign}</span>
            <span className="od-diff-text">{op.text || " "}</span>
          </span>
        );
      })}
    </pre>
  );
}

function EmptyState(): ReactElement {
  return (
    <div className="od-diff-empty">
      <div className="od-preview-empty-icon" aria-hidden="true">
        <I.diff size={28} />
      </div>
      <h3 className="od-h3" style={{ marginBottom: 6 }}>
        No changes since the last save
      </h3>
      <p style={{ color: "var(--od-muted)", fontSize: 13, margin: 0 }}>
        Edit any file (or use Cmd/Ctrl+S to refresh the baseline) and the diff will show here.
      </p>
    </div>
  );
}
