import { memo, type MouseEvent, useEffect, useRef } from "react";
import type { CompileStatus } from "@/domain";
import { ThemeToggle, TopBar } from "@/components/chrome";
import { Button, I } from "@/components/primitives";
import { formatCombo, isMacPlatform } from "@/lib/keymap";
import { useShortcutBindings } from "@/store/shortcuts";

interface EditorToolbarProps {
  projectName: string;
  filePath: string;
  compileStatus: CompileStatus;
  compileProgress?: string | undefined;
  pdfCurrent: boolean;
  hasPdf: boolean;
  folderSupported: boolean;
  folderSyncing: boolean;
  hasDirtyFiles: boolean;
  canSync: boolean;
  sidebarOpen?: boolean;
  onHome: () => void;
  onToggleSidebar?: () => void;
  onCompile: () => void;
  onDownloadPdf: () => void;
  onExport: () => void;
  onSaveToFolder: () => void;
  onDiff: () => void;
  onSync: () => void;
  onBibliography: () => void;
  onShortcuts?: () => void;
  onBackToProjects: () => void;
}

const COMPILE_LABELS: Record<CompileStatus, string> = {
  idle: "Compile",
  compiling: "Compiling...",
  success: "Compile",
  warning: "Recompile",
  error: "Recompile",
};

export const EditorToolbar = memo(function EditorToolbar({
  projectName,
  filePath,
  compileStatus,
  compileProgress,
  pdfCurrent,
  hasPdf,
  folderSupported,
  folderSyncing,
  hasDirtyFiles,
  canSync,
  sidebarOpen,
  onHome,
  onToggleSidebar,
  onCompile,
  onDownloadPdf,
  onExport,
  onSaveToFolder,
  onDiff,
  onSync,
  onBibliography,
  onShortcuts,
  onBackToProjects,
}: EditorToolbarProps) {
  const pdfTitle = pdfCurrent
    ? "Download compiled PDF"
    : hasPdf
      ? "Source changed - recompile before downloading"
      : "Compile to enable PDF download";

  return (
    <TopBar
      onHome={onHome}
      project={projectName}
      filePath={filePath}
      left={
        <div className="od-sidebar-toggle">
          <Button
            variant="ghost"
            onClick={onToggleSidebar}
            disabled={!onToggleSidebar}
            aria-expanded={sidebarOpen}
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
          >
            <I.sidebar size={14} />
          </Button>
        </div>
      }
      right={
        <>
          <CompileButton status={compileStatus} progress={compileProgress} onCompile={onCompile} />
          <Button
            leadingIcon={<I.download size={13} />}
            onClick={onDownloadPdf}
            disabled={!pdfCurrent}
            title={pdfTitle}
            aria-label="Download compiled PDF"
          >
            <span className="od-download-full">Download PDF</span>
            <span className="od-download-short" aria-hidden="true">
              PDF
            </span>
          </Button>
          <EditorMoreMenu
            folderSupported={folderSupported}
            folderSyncing={folderSyncing}
            hasDirtyFiles={hasDirtyFiles}
            canSync={canSync}
            onExport={onExport}
            onSaveToFolder={onSaveToFolder}
            onDiff={onDiff}
            onSync={onSync}
            onBibliography={onBibliography}
            {...(onShortcuts ? { onShortcuts } : {})}
          />
          <ThemeToggle />
          <Button
            variant="ghost"
            onClick={onBackToProjects}
            aria-label="Back to projects"
            title="Back to projects"
          >
            <I.arrowL size={14} />
          </Button>
        </>
      }
    />
  );
});

function CompileButton({
  status,
  progress,
  onCompile,
}: {
  status: CompileStatus;
  progress?: string | undefined;
  onCompile: () => void;
}) {
  const label = COMPILE_LABELS[status];
  const busy = status === "compiling";
  const busyLabel = busy && progress ? `${label} - ${progress}` : undefined;
  const compileShortcuts = useShortcutBindings("workspace.compile");
  const isMac = isMacPlatform(typeof navigator !== "undefined" ? navigator : {});
  const shortcutTitle = compileShortcuts.map((combo) => formatCombo(combo, isMac)).join(", ");
  return (
    <Button
      className="od-compile-button"
      variant={busy ? "soft" : "primary"}
      leadingIcon={busy ? <I.cpu size={12} /> : <I.play size={11} />}
      onClick={onCompile}
      disabled={busy}
      title={busyLabel ?? (shortcutTitle ? `Compile (${shortcutTitle})` : "Compile")}
      aria-label={busyLabel ?? "Compile project"}
    >
      <span className="od-compile-label">{label}</span>
    </Button>
  );
}

interface EditorMoreMenuProps {
  folderSupported: boolean;
  folderSyncing: boolean;
  hasDirtyFiles: boolean;
  canSync: boolean;
  onExport: () => void;
  onSaveToFolder: () => void;
  onDiff: () => void;
  onSync: () => void;
  onBibliography: () => void;
  onShortcuts?: () => void;
}

function EditorMoreMenu(props: EditorMoreMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const onShortcuts = props.onShortcuts;

  const run = (action: () => void) => {
    action();
    detailsRef.current?.removeAttribute("open");
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        detailsRef.current?.removeAttribute("open");
      }
    };
    const handleClickOutside = (e: MouseEvent | globalThis.MouseEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(e.target as Node)) {
        detailsRef.current.removeAttribute("open");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  return (
    <details className="od-toolbar-menu" ref={detailsRef}>
      <summary
        className="od-btn od-btn--ghost"
        role="button"
        aria-label="More editor actions"
        title="More actions"
        aria-haspopup="menu"
      >
        <I.dots size={14} />
      </summary>
      <div className="od-toolbar-menu-popover" role="menu" aria-label="Editor actions">
        <MenuAction onClick={() => run(props.onExport)}>Export OpenDraft project</MenuAction>
        {props.folderSupported ? (
          <MenuAction disabled={props.folderSyncing} onClick={() => run(props.onSaveToFolder)}>
            {props.folderSyncing ? "Writing to folder..." : "Save to local folder"}
          </MenuAction>
        ) : null}
        <MenuAction disabled={!props.hasDirtyFiles} onClick={() => run(props.onDiff)}>
          Show unsaved changes
        </MenuAction>
        <MenuAction disabled={!props.canSync} onClick={() => run(props.onSync)}>
          Sync PDF to cursor
        </MenuAction>
        <MenuAction onClick={() => run(props.onBibliography)}>Open bibliography</MenuAction>
        {onShortcuts ? (
          <MenuAction onClick={() => run(onShortcuts)}>Keyboard shortcuts...</MenuAction>
        ) : null}
      </div>
    </details>
  );
}

function MenuAction({
  children,
  disabled,
  onClick,
}: {
  children: string;
  disabled?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
