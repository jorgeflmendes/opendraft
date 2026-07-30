import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DefaultStatus } from "@/components/chrome";
import { useScreen } from "@/store/screen";
import { useProjectsStore } from "@/features/projects/useProjectsStore";
import {
  EditorBody,
  EditorSidebar,
  EditorTabs,
  EditorToolbar,
  EDITOR_FILE_TREE_WIDTH,
  downloadBytes,
  downloadText,
  editorResultLabel,
  editorStatusLabel,
  insertAtCursor,
  readFileForProject,
  uniqueUploadPath,
  useDirtyPaths,
  useEditorFeedback,
  useProjectSourceIndex,
  useResizablePanel,
  MIN_EDITOR_WIDTH,
  RESIZER_WIDTH,
  useTabsStore,
} from "@/features/editor";
import { CompileLog, useCompileStore } from "@/features/compile";
import { PreviewPanel, useSyncStore } from "@/features/preview";
import { useDiffStore } from "@/features/diff/useDiffStore";
import { ErrorBoundary } from "@/components/system/ErrorBoundary";
import { LiveAnnouncer } from "@/components/system/LiveAnnouncer";
import { resolveProjectPath } from "@/services/path-utils";
import { ShortcutSettingsDialog } from "@/features/shortcuts";
import { useShortcutBindings } from "@/store/shortcuts";

// Editor-only overlays stay out of the initial editor chunk.
const DiffPanel = lazy(() =>
  import("@/features/diff/DiffPanel").then((m) => ({ default: m.DiffPanel })),
);

const QuickOpenDialog = lazy(() =>
  import("@/features/editor/QuickOpenDialog").then((m) => ({ default: m.QuickOpenDialog })),
);
const FindInFilesPanel = lazy(() =>
  import("@/features/editor/FindInFilesPanel").then((m) => ({ default: m.FindInFilesPanel })),
);
const BibliographyPanel = lazy(() =>
  import("@/features/editor/BibliographyPanel").then((m) => ({ default: m.BibliographyPanel })),
);
import type { JumpTarget } from "@/features/editor";
import type { EditorDiagnostic } from "@/features/editor/editor-diagnostics";
import { useKeyboardShortcut } from "@/lib/keymap";
import {
  isFolderPickerCancellation,
  saveProjectToLocalFolder,
  supportsLocalFolderAccess,
} from "@/services";

export function EditorScreen() {
  const go = useScreen((s) => s.go);
  const routeScreen = useScreen((s) => s.current);
  const routeProjectId = useScreen((s) => s.projectId);

  const project = useProjectsStore((s) => s.active);
  const projectError = useProjectsStore((s) => s.error);
  const closeProject = useProjectsStore((s) => s.closeProject);
  const saveActive = useProjectsStore((s) => s.saveActive);
  const createFile = useProjectsStore((s) => s.createFile);
  const renameFile = useProjectsStore((s) => s.renameFile);
  const removeFile = useProjectsStore((s) => s.removeFile);
  const restoreFile = useProjectsStore((s) => s.restoreFile);

  const openTabs = useTabsStore((s) => s.openTabs);
  const activeTab = useTabsStore((s) => s.activeTab);
  const openTab = useTabsStore((s) => s.open);
  const openManyTabs = useTabsStore((s) => s.openMany);
  const closeTab = useTabsStore((s) => s.close);
  const setActiveTab = useTabsStore((s) => s.setActive);
  const edits = useTabsStore((s) => s.edits);
  const dirtyPaths = useDirtyPaths();

  const compileStatus = useCompileStore((s) => s.status);
  const compileResult = useCompileStore((s) => s.result);
  const compiledInput = useCompileStore((s) => s.compiledInput);
  const openDiff = useDiffStore((s) => s.openDiff);
  const diffOpen = useDiffStore((s) => s.open);

  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [bibOpen, setBibOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const compileProgress = useCompileStore((s) => s.progress);
  const compile = useCompileStore((s) => s.compile);
  const sidebar = useResizablePanel({
    defaultWidth: EDITOR_FILE_TREE_WIDTH,
    minWidth: 200,
    direction: "left",
    getMaxWidth: () => window.innerWidth - 300 - MIN_EDITOR_WIDTH - RESIZER_WIDTH * 2,
  });

  const preview = useResizablePanel({
    defaultWidth: 460,
    minWidth: 300,
    direction: "right",
    getMaxWidth: () => window.innerWidth - sidebar.width - MIN_EDITOR_WIDTH - RESIZER_WIDTH * 2,
  });

  // App hydrates direct editor URLs; invalid routes return to the picker.
  useEffect(() => {
    if (routeScreen !== "editor") return;
    if (project) return;
    if (!routeProjectId || projectError) go("projects");
  }, [go, project, projectError, routeProjectId, routeScreen]);

  const { feedback, flashMessage, flashSaved, showError } = useEditorFeedback();
  const [folderSyncing, setFolderSyncing] = useState(false);
  const saveOne = useCallback(async () => {
    if (!activeTab) return;
    const saved = await saveActive([activeTab]);
    if (saved.length > 0) flashSaved();
    else {
      const error = useProjectsStore.getState().error;
      if (error) showError(error);
    }
  }, [activeTab, saveActive, flashSaved, showError]);
  const saveAll = useCallback(async () => {
    const saved = await saveActive();
    if (saved.length > 0) flashSaved();
    else {
      const error = useProjectsStore.getState().error;
      if (error) showError(error);
    }
  }, [saveActive, flashSaved, showError]);
  const handleLeaveProject = useCallback(
    async (destination: "landing" | "projects") => {
      if (Object.keys(useTabsStore.getState().edits).length > 0) {
        await saveActive();
        if (Object.keys(useTabsStore.getState().edits).length > 0) {
          const errorMsg = useProjectsStore.getState().error ?? "Could not save all changes";
          if (!window.confirm(`${errorMsg}\n\nDiscard unsaved changes and leave?`)) {
            showError(errorMsg);
            return;
          }
        }
      }
      closeProject();
      go(destination);
    },
    [closeProject, go, saveActive, showError],
  );
  const handleGoHome = useCallback(() => void handleLeaveProject("landing"), [handleLeaveProject]);
  const handleBackToProjects = useCallback(
    () => void handleLeaveProject("projects"),
    [handleLeaveProject],
  );
  const handleOpenBibliography = useCallback(() => setBibOpen(true), []);
  useEffect(() => {
    if (dirtyPaths.length === 0) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirtyPaths.length]);
  // CodeMirror is contentEditable, so editor shortcuts must allow input targets.
  const saveShortcut = useShortcutBindings("workspace.save");
  const saveAllShortcut = useShortcutBindings("workspace.saveAll");
  useKeyboardShortcut(saveShortcut, saveOne, {
    allowInInputs: true,
    enabled: !shortcutsOpen,
  });
  useKeyboardShortcut(saveAllShortcut, saveAll, {
    allowInInputs: true,
    enabled: !shortcutsOpen,
  });

  const updateContent = useTabsStore((s) => s.updateContent);
  useProjectSourceIndex(project, edits);

  // Cursor updates must not re-render the editor on every selection change.
  const cursorRef = useRef<{ path: string; line: number; col: number } | null>(null);
  const handleCursorChange = useCallback((path: string, line: number, col: number) => {
    cursorRef.current = { path, line, col };
  }, []);

  // A missing cursor falls back to appending the citation to the active file.
  const handleInsertCite = useCallback(
    (key: string) => {
      const cur = cursorRef.current;
      const targetPath = cur?.path ?? activeTab ?? project?.entry;
      if (!targetPath || !project) return;
      const file = project.files[targetPath];
      if (!file) return;
      const fallback = typeof file.content === "string" ? file.content : "";
      const current = useTabsStore.getState().edits[targetPath] ?? fallback;
      const snippet = `\\cite{${key}}`;
      if (!cur || cur.path !== targetPath) {
        updateContent(targetPath, current + snippet);
        return;
      }
      const { next } = insertAtCursor(current, cur.line, cur.col, snippet);
      updateContent(targetPath, next);
    },
    [project, activeTab, updateContent],
  );

  const handlePasteFiles = useCallback(
    (files: File[]): boolean => {
      if (!project || files.length === 0) return false;
      const targetPath = cursorRef.current?.path ?? activeTab ?? project.entry;
      const target = project.files[targetPath];
      const targetText =
        target?.kind === "tex" && typeof target.content === "string" ? target.content : null;
      const taken = Object.keys(project.files);

      void (async () => {
        try {
          const inserted: string[] = [];
          const pathsToOpen: string[] = [];
          for (const file of files) {
            const path = uniqueUploadPath(file.name, taken);
            taken.push(path);
            const content = await readFileForProject(file);
            const created = await createFile(path, content);
            if (!created) {
              throw new Error(useProjectsStore.getState().error ?? `Could not create ${path}`);
            }
            const includable =
              file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|pdf)$/i.test(path);
            if (targetText !== null && includable) inserted.push(`\\includegraphics{${path}}`);
            if (typeof content === "string") pathsToOpen.push(path);
          }
          if (pathsToOpen.length > 0) openManyTabs(pathsToOpen);

          if (targetText !== null && inserted.length > 0) {
            const current = useTabsStore.getState().edits[targetPath] ?? targetText;
            const snippet = `\n${inserted.join("\n")}\n`;
            const cur = cursorRef.current;
            const next =
              cur && cur.path === targetPath
                ? insertAtCursor(current, cur.line, cur.col, snippet).next
                : current + snippet;
            updateContent(targetPath, next);
          }
        } catch (e) {
          showError(e);
        }
      })();

      return true;
    },
    [activeTab, createFile, openManyTabs, project, showError, updateContent],
  );

  const handleExport = useCallback(() => {
    void (async () => {
      if (!project) return;
      const safeName = project.name.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();

      const useZip = window.confirm("Export as ZIP? (Cancel for JSON)");

      if (useZip) {
        const zipBlob = await useProjectsStore.getState().exportActiveZip();
        if (zipBlob) {
          downloadBytes(
            `${safeName}.zip`,
            new Uint8Array(await zipBlob.arrayBuffer()),
            "application/zip",
          );
        }
      } else {
        const json = await useProjectsStore.getState().exportActive();
        if (json) {
          downloadText(`${safeName}.opendraft.json`, json, "application/json");
        }
      }
    })();
  }, [project]);
  const handleDownloadPdf = useCallback(() => {
    const currentEdits = useTabsStore.getState().edits;
    if (
      !compileResult?.pdf ||
      !project ||
      compileStatus === "compiling" ||
      compiledInput?.project !== project ||
      compiledInput.edits !== currentEdits
    )
      return;
    const safeName = project.name.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
    downloadBytes(`${safeName}.pdf`, compileResult.pdf, "application/pdf");
  }, [compileResult, compileStatus, compiledInput, project]);
  const handleSaveToFolder = useCallback(async () => {
    if (!project || folderSyncing) return;
    setFolderSyncing(true);
    try {
      const count = await saveProjectToLocalFolder(project, useTabsStore.getState().edits);
      flashMessage(`${count} file${count === 1 ? "" : "s"} written to folder`);
    } catch (cause) {
      if (!isFolderPickerCancellation(cause)) {
        showError(cause);
      }
    } finally {
      setFolderSyncing(false);
    }
  }, [flashMessage, folderSyncing, project, showError]);

  const handleCompile = useCallback(() => {
    if (!project) return;
    void compile({ project, edits: useTabsStore.getState().edits });
  }, [project, compile]);
  const compileShortcut = useShortcutBindings("workspace.compile");
  const quickOpenShortcut = useShortcutBindings("workspace.quickOpen");
  const findInFilesShortcut = useShortcutBindings("workspace.findInFiles");
  const bibliographyShortcut = useShortcutBindings("workspace.bibliography");
  const shortcutSettingsShortcut = useShortcutBindings("workspace.shortcuts");
  useKeyboardShortcut(compileShortcut, handleCompile, {
    allowInInputs: true,
    enabled: !shortcutsOpen,
  });
  useKeyboardShortcut(quickOpenShortcut, () => setQuickOpenOpen(true), {
    allowInInputs: true,
    enabled: !shortcutsOpen,
  });
  useKeyboardShortcut(findInFilesShortcut, () => setFindOpen(true), {
    allowInInputs: true,
    enabled: !shortcutsOpen,
  });
  useKeyboardShortcut(bibliographyShortcut, () => setBibOpen(true), {
    allowInInputs: true,
    enabled: !shortcutsOpen,
  });
  useKeyboardShortcut(shortcutSettingsShortcut, () => setShortcutsOpen(true), {
    allowInInputs: true,
    enabled: !shortcutsOpen,
  });

  // requestId lets repeated clicks on the same diagnostic re-run the jump.
  const [jumpTo, setJumpTo] = useState<(JumpTarget & { path: string }) | undefined>();
  const jumpReqRef = useRef(0);
  const handleJump = useCallback(
    (path: string, line: number, column: number | undefined) => {
      openTab(path);
      jumpReqRef.current += 1;
      setJumpTo({
        path,
        line,
        ...(column !== undefined ? { column } : {}),
        requestId: jumpReqRef.current,
      });
    },
    [openTab],
  );

  const syncStoreForward = useSyncStore((s) => s.forward);
  const syncStoreReverseTarget = useSyncStore((s) => s.reverseTarget);
  const syncStoreClearReverse = useSyncStore((s) => s.clearReverse);
  const syncIndex = useCompileStore((s) => s.synctex);
  const handleForwardSync = useCallback(() => {
    const cur = cursorRef.current;
    const currentProject = useProjectsStore.getState().active;
    const currentEdits = useTabsStore.getState().edits;
    const input = useCompileStore.getState().compiledInput;
    if (
      !cur ||
      !syncIndex ||
      !currentProject ||
      input?.project !== currentProject ||
      input.edits !== currentEdits
    ) {
      return;
    }
    const rects = syncIndex.forward(cur.path, cur.line);
    if (rects.length > 0) syncStoreForward(rects);
  }, [syncIndex, syncStoreForward]);
  const syncPdfShortcut = useShortcutBindings("workspace.syncPdf");
  useKeyboardShortcut(syncPdfShortcut, handleForwardSync, {
    allowInInputs: true,
    enabled: !shortcutsOpen,
  });

  // Consume reverse-sync targets once so repeated PDF clicks remain distinct events.
  useEffect(() => {
    if (!syncStoreReverseTarget) return;
    const activeProject = useProjectsStore.getState().active;
    const path = activeProject
      ? resolveProjectPath(syncStoreReverseTarget.path, Object.keys(activeProject.files))
      : null;
    if (path) handleJump(path, syncStoreReverseTarget.line, undefined);
    syncStoreClearReverse();
  }, [syncStoreReverseTarget, handleJump, syncStoreClearReverse]);

  const handleSidebarCreate = useCallback(
    async (path: string) => {
      const created = await createFile(path);
      if (!created) {
        showError(useProjectsStore.getState().error ?? `Could not create ${path}`);
        return false;
      }
      openTab(created);
      return true;
    },
    [createFile, openTab, showError],
  );

  const handleSidebarUpload = useCallback(
    async (uploads: File[]) => {
      if (!project) return;
      try {
        const taken = Object.keys(project.files);
        const pathsToOpen: string[] = [];
        for (const file of uploads) {
          const path = uniqueUploadPath(file.name, taken);
          taken.push(path);
          const content = await readFileForProject(file);
          const created = await createFile(path, content);
          if (!created) {
            throw new Error(useProjectsStore.getState().error ?? `Could not create ${path}`);
          }
          if (typeof content === "string") pathsToOpen.push(created);
        }
        if (pathsToOpen.length > 0) openManyTabs(pathsToOpen);
      } catch (cause) {
        showError(cause);
      }
    },
    [createFile, openManyTabs, project, showError],
  );

  const handleSidebarJump = useCallback(
    (path: string, line: number) => handleJump(path, line, undefined),
    [handleJump],
  );

  const activeDiagnostics = useMemo<EditorDiagnostic[]>(() => {
    if (
      !activeTab ||
      !project ||
      !compileResult ||
      compiledInput?.project !== project ||
      compiledInput.edits !== edits
    ) {
      return [];
    }
    const projectPaths = Object.keys(project.files);
    return compileResult.log.flatMap((entry) => {
      if (entry.level === "info" || !entry.filePath || !entry.line) return [];
      const path = resolveProjectPath(entry.filePath, projectPaths);
      if (path !== activeTab) return [];
      return [{ line: entry.line, severity: entry.level, message: entry.message }];
    });
  }, [activeTab, project, compileResult, compiledInput, edits]);

  if (!project) return null;

  const activeFile = activeTab ? project.files[activeTab] : undefined;
  const breadcrumbPath = activeTab ?? project.entry;
  const compiledPdfIsCurrent = Boolean(
    compileResult?.pdf &&
    compileStatus !== "compiling" &&
    compiledInput?.project === project &&
    compiledInput.edits === edits,
  );

  return (
    <ErrorBoundary
      label="the editor screen"
      fallback={() => (
        <div className="od-card od-card-pad" style={{ margin: 40 }}>
          <h2>Editor crashed</h2>
          <p>Something went wrong.</p>
          <button onClick={() => go("projects")} className="od-btn od-btn--primary">
            Back to projects
          </button>
        </div>
      )}
    >
      <div className="od-window od-editor-window">
        <EditorToolbar
          onHome={handleGoHome}
          projectName={project.name}
          filePath={breadcrumbPath}
          compileStatus={compileStatus}
          compileProgress={compileProgress?.label}
          pdfCurrent={compiledPdfIsCurrent}
          hasPdf={Boolean(compileResult?.pdf)}
          folderSupported={supportsLocalFolderAccess()}
          folderSyncing={folderSyncing}
          hasDirtyFiles={dirtyPaths.length > 0}
          canSync={Boolean(syncIndex && compiledPdfIsCurrent)}
          onCompile={handleCompile}
          onDownloadPdf={handleDownloadPdf}
          onExport={handleExport}
          onSaveToFolder={handleSaveToFolder}
          onDiff={openDiff}
          onSync={handleForwardSync}
          onBibliography={handleOpenBibliography}
          onShortcuts={() => setShortcutsOpen(true)}
          onBackToProjects={handleBackToProjects}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
        />

        <div className={`od-body${sidebarOpen ? " od-body--sidebar-open" : ""}`}>
          {sidebarOpen ? (
            <div
              className="od-sidebar-backdrop"
              aria-hidden="true"
              onClick={() => setSidebarOpen(false)}
            />
          ) : null}
          <EditorSidebar
            ref={sidebar.panelRef}
            project={project}
            activePath={activeTab}
            folderSupported={supportsLocalFolderAccess()}
            folderSyncing={folderSyncing}
            hasDirtyFiles={dirtyPaths.length > 0}
            canSync={Boolean(syncIndex && compiledPdfIsCurrent)}
            onOpenFile={openTab}
            onJumpToLine={handleSidebarJump}
            onCreateFile={handleSidebarCreate}
            onUploadFiles={handleSidebarUpload}
            onRenameFile={renameFile}
            onDeleteFile={removeFile}
            onRestoreFile={restoreFile}
            onExport={handleExport}
            onSaveToFolder={handleSaveToFolder}
            onDiff={openDiff}
            onSync={handleForwardSync}
            onBibliography={handleOpenBibliography}
          />
          <div
            className="od-panel-resizer"
            role="separator"
            aria-label="Resize sidebar and editor panels"
            aria-orientation="vertical"
            aria-valuemin={sidebar.minWidth}
            aria-valuemax={sidebar.maxWidth()}
            aria-valuenow={Math.round(sidebar.width)}
            tabIndex={0}
            onPointerDown={sidebar.start}
            onPointerMove={sidebar.move}
            onPointerUp={sidebar.finish}
            onPointerCancel={sidebar.finish}
            onLostPointerCapture={sidebar.finish}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const delta = event.key === "ArrowLeft" ? -16 : 16;
              sidebar.resizeBy(delta);
            }}
          />
          <div className="od-panel" style={{ flex: 1, minWidth: 0 }}>
            <EditorTabs
              tabs={openTabs}
              activeTab={activeTab}
              files={project.files}
              onSelect={setActiveTab}
              onClose={closeTab}
            />
            {compileResult && (compileStatus === "error" || compileStatus === "warning") && (
              <CompileLog entries={compileResult.log} onJump={handleJump} />
            )}
            <div className="od-panel-body">
              <ErrorBoundary label="the editor pane">
                <EditorBody
                  file={activeFile}
                  diagnostics={activeDiagnostics}
                  {...(jumpTo ? { jumpTo } : {})}
                  onCursorChange={handleCursorChange}
                  onPasteFiles={handlePasteFiles}
                />
              </ErrorBoundary>
            </div>
          </div>
          <div
            className="od-panel-resizer"
            role="separator"
            aria-label="Resize editor and preview panels"
            aria-orientation="vertical"
            aria-valuemin={preview.minWidth}
            aria-valuemax={preview.maxWidth()}
            aria-valuenow={Math.round(preview.width)}
            tabIndex={0}
            onPointerDown={preview.start}
            onPointerMove={preview.move}
            onPointerUp={preview.finish}
            onPointerCancel={preview.finish}
            onLostPointerCapture={preview.finish}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const delta = event.key === "ArrowLeft" ? 16 : -16;
              preview.resizeBy(delta);
            }}
          />
          <ErrorBoundary label="the preview pane">
            <PreviewPanel
              ref={preview.panelRef}
              project={project}
              width={preview.width}
              stale={Boolean(compileResult?.pdf && !compiledPdfIsCurrent)}
            />
          </ErrorBoundary>
        </div>

        <DefaultStatus
          file={`${activeTab ?? "-"}${activeTab && dirtyPaths.includes(activeTab) ? " *" : ""}`}
          cursor={editorStatusLabel({
            ...feedback,
            compileStatus,
            compileProgress: compileProgress?.label,
          })}
          engine={compileResult?.engine ?? "Local TeX engine"}
          time={editorResultLabel(compileStatus, compileResult, dirtyPaths.length)}
        />
        <LiveAnnouncer />
        {diffOpen ? (
          <ErrorBoundary label="the diff overlay">
            <Suspense fallback={null}>
              <DiffPanel />
            </Suspense>
          </ErrorBoundary>
        ) : null}
        {quickOpenOpen ? (
          <Suspense fallback={null}>
            <QuickOpenDialog
              open={quickOpenOpen}
              onClose={() => setQuickOpenOpen(false)}
              project={project}
              activePath={activeTab}
              onPick={(path) => openTab(path)}
            />
          </Suspense>
        ) : null}
        {findOpen ? (
          <Suspense fallback={null}>
            <FindInFilesPanel
              open={findOpen}
              onClose={() => setFindOpen(false)}
              project={project}
              onJump={(path, line) => handleJump(path, line, undefined)}
            />
          </Suspense>
        ) : null}
        {bibOpen ? (
          <Suspense fallback={null}>
            <BibliographyPanel
              open={bibOpen}
              onClose={() => setBibOpen(false)}
              onInsert={handleInsertCite}
            />
          </Suspense>
        ) : null}
        <ShortcutSettingsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </div>
    </ErrorBoundary>
  );
}
