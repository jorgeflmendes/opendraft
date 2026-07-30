import { forwardRef, memo } from "react";
import type { CompileStatus, Project } from "@/domain";
import { LocalChip } from "@/components/chrome";
import { Button, I, Pill } from "@/components/primitives";
import { useCompileStore } from "@/features/compile";
import { useTabsStore } from "@/features/editor";
import { PdfRenderer } from "./PdfRenderer";
import { useSyncStore } from "./useSyncStore";

interface PreviewPanelProps {
  project: Project;
  width: number;
  stale?: boolean;
}

const PreviewPanelBase = forwardRef<HTMLDivElement, PreviewPanelProps>(function PreviewPanel(
  { project, width, stale = false },
  ref,
) {
  const status = useCompileStore((s) => s.status);
  const result = useCompileStore((s) => s.result);
  const progress = useCompileStore((s) => s.progress);
  const synctex = useCompileStore((s) => s.synctex);
  const compile = useCompileStore((s) => s.compile);
  const compileCurrentProject = () => compile({ project, edits: useTabsStore.getState().edits });
  const highlights = useSyncStore((s) => s.highlights);
  const jumpToPage = useSyncStore((s) => s.jumpToPage);
  const forwardRequestId = useSyncStore((s) => s.forwardRequestId);
  const reverse = useSyncStore((s) => s.reverse);
  const handleCanvasClick = (page: number, xPt: number, yPt: number) => {
    if (stale || !synctex) return;
    const hit = synctex.reverse(page, xPt, yPt);
    if (hit) reverse(hit.path, hit.line);
  };

  const handlePopOut = () => {
    if (result?.pdf) {
      const blob = new Blob([new Uint8Array(result.pdf)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  };

  return (
    <div ref={ref} className="od-panel" style={{ flex: `0 0 ${width}px` }}>
      <div className="od-panel-head">
        <span>Preview</span>
        <span className="grow" />
        {result?.pdf && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePopOut}
            title="Pop out into new tab"
            aria-label="Pop out into new tab"
            leadingIcon={<I.externalLink size={12} />}
          >
            Pop-out
          </Button>
        )}
        <StatusPill status={status} stale={stale} />
      </div>
      <div className="od-panel-body od-preview-body">
        {status === "compiling" ? (
          <CompilingCard label={progress?.label} />
        ) : status === "error" ? (
          <FailureCard onRetry={() => void compileCurrentProject()} />
        ) : (status === "success" || status === "warning") && result ? (
          result.pdf ? (
            <div className="od-preview-canvas">
              <PdfRenderer
                pdf={result.pdf}
                highlights={highlights}
                {...(jumpToPage !== null ? { jumpToPage } : {})}
                jumpRequestId={forwardRequestId}
                {...(!stale && synctex ? { onCanvasClick: handleCanvasClick } : {})}
              />
              {result.durationLabel && (
                <div className="od-preview-footer">
                  <LocalChip ms={result.durationLabel} />
                </div>
              )}
            </div>
          ) : (
            <NoPdfCard onRetry={() => void compileCurrentProject()} />
          )
        ) : (
          <IdleCard onRun={() => void compileCurrentProject()} />
        )}
      </div>
    </div>
  );
});

export const PreviewPanel = memo(PreviewPanelBase);
PreviewPanel.displayName = "PreviewPanel";

function StatusPill({ status, stale }: { status: CompileStatus; stale: boolean }) {
  if (status === "compiling") return <Pill tone="info">Compiling</Pill>;
  if (stale) return <Pill tone="warn">Outdated</Pill>;
  if (status === "success")
    return (
      <Pill tone="ok" dot>
        Compiled
      </Pill>
    );
  if (status === "warning")
    return (
      <Pill tone="warn" dot>
        Warnings
      </Pill>
    );
  if (status === "error")
    return (
      <Pill tone="err" dot>
        Error
      </Pill>
    );
  return <Pill>Idle</Pill>;
}

function IdleCard({ onRun }: { onRun: () => void }) {
  return (
    <div className="od-preview-empty">
      <div className="od-preview-empty-icon" aria-hidden="true">
        <I.cpu size={28} />
      </div>
      <h3 className="od-h3" style={{ marginBottom: 6 }}>
        Preview is empty
      </h3>
      <p style={{ color: "var(--od-muted)", fontSize: 13, margin: "0 0 14px" }}>
        Run Compile (Cmd/Ctrl+Enter) to render the entry file. Output is rendered locally - nothing
        leaves your device.
      </p>
      <Button variant="primary" onClick={onRun} leadingIcon={<I.play size={11} />}>
        Run Compile
      </Button>
    </div>
  );
}

function CompilingCard({ label }: { label: string | undefined }) {
  return (
    <div className="od-preview-empty">
      <div className="od-preview-empty-icon" aria-hidden="true">
        <I.cpu size={28} />
      </div>
      <h3 className="od-h3" style={{ marginBottom: 6 }}>
        Compiling locally...
      </h3>
      <p style={{ color: "var(--od-muted)", fontSize: 13, margin: 0 }}>{label ?? "Working..."}</p>
    </div>
  );
}

function FailureCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="od-preview-empty">
      <div
        className="od-preview-empty-icon"
        aria-hidden="true"
        style={{ background: "var(--od-err-wash)", color: "var(--od-err)" }}
      >
        <I.alert size={26} />
      </div>
      <h3 className="od-h3" style={{ marginBottom: 6 }}>
        Compile failed
      </h3>
      <p style={{ color: "var(--od-muted)", fontSize: 13, margin: "0 0 14px" }}>
        Open the log in the editor panel to jump to the source. Fix and recompile.
      </p>
      <Button variant="default" onClick={onRetry} leadingIcon={<I.refresh size={12} />}>
        Try again
      </Button>
    </div>
  );
}

function NoPdfCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="od-preview-empty">
      <div
        className="od-preview-empty-icon"
        aria-hidden="true"
        style={{ background: "var(--od-warn-wash)", color: "var(--od-warn)" }}
      >
        <I.alert size={26} />
      </div>
      <h3 className="od-h3" style={{ marginBottom: 6 }}>
        No real PDF was produced
      </h3>
      <p style={{ color: "var(--od-muted)", fontSize: 13, margin: "0 0 14px" }}>
        OpenDraft only shows engine-produced PDF output here. Install the browser TeX assets and
        recompile instead of using an approximate HTML preview.
      </p>
      <Button variant="default" onClick={onRetry} leadingIcon={<I.refresh size={12} />}>
        Try again
      </Button>
    </div>
  );
}
