import { memo, useRef, useState, forwardRef } from "react";
import { activeFileEntries, type Project } from "@/domain";
import { usePreferences } from "@/store/preferences";
import { Button, I } from "@/components/primitives";
import { FileTree } from "./FileTree";
import { NewFileForm } from "./NewFileForm";
import { OutlinePanel } from "./OutlinePanel";

export const EDITOR_FILE_TREE_WIDTH = 280;

interface EditorSidebarProps {
  project: Project;
  activePath: string | null;
  folderSupported: boolean;
  folderSyncing: boolean;
  hasDirtyFiles: boolean;
  canSync: boolean;
  onOpenFile: (path: string) => void;
  onJumpToLine: (path: string, line: number) => void;
  onCreateFile: (path: string) => Promise<boolean>;
  onUploadFiles: (files: File[]) => Promise<void>;
  onRenameFile: (oldPath: string, newPath: string) => Promise<boolean>;
  onDeleteFile: (path: string) => Promise<boolean>;
  onRestoreFile?: ((path: string) => Promise<boolean>) | undefined;
  onExport: () => void;
  onSaveToFolder: () => void;
  onDiff: () => void;
  onSync: () => void;
  onBibliography: () => void;
}

export const EditorSidebar = memo(
  forwardRef<HTMLDivElement, EditorSidebarProps>(function EditorSidebar(
    {
      project,
      activePath,
      folderSupported,
      folderSyncing,
      hasDirtyFiles,
      canSync,
      onOpenFile,
      onJumpToLine,
      onCreateFile,
      onUploadFiles,
      onRenameFile,
      onDeleteFile,
      onRestoreFile,
      onExport,
      onSaveToFolder,
      onDiff,
      onSync,
      onBibliography,
    },
    ref,
  ) {
    const [creating, setCreating] = useState(false);
    const [dragDepth, setDragDepth] = useState(0);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const upload = async (files: FileList | null) => {
      if (files?.length) await onUploadFiles(Array.from(files));
    };

    return (
      <div
        ref={ref}
        className={`od-panel od-editor-sidebar${dragDepth > 0 ? " od-tree-drop" : ""}`}
        onDragEnter={(event) => {
          if (!event.dataTransfer?.types.includes("Files")) return;
          event.preventDefault();
          setDragDepth((depth) => depth + 1);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer?.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => setDragDepth((depth) => Math.max(0, depth - 1))}
        onDrop={(event) => {
          event.preventDefault();
          setDragDepth(0);
          void upload(event.dataTransfer?.files ?? null);
        }}
      >
        <div className="od-panel-head">
          <h2 className="od-panel-title">Files</h2>
          <span className="grow" />
          <Button
            variant="ghost"
            size="sm"
            aria-label="Upload files"
            onClick={() => fileInputRef.current?.click()}
            title="Upload one or more files (or drag and drop into this sidebar)"
          >
            <I.upload size={12} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="New file"
            onClick={() => setCreating((visible) => !visible)}
          >
            <I.plus size={12} />
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          aria-label="Upload project files"
          onChange={(event) => {
            void upload(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="od-panel-body od-editor-sidebar-body">
          <div className="od-editor-sidebar-project">
            <I.folder size={13} />
            <strong>{project.name}</strong>
            <AutoSaveSelect />
          </div>
          <div className="od-editor-sidebar-count">
            {activeFileEntries(project).length} files / local
          </div>
          <div className="od-editor-sidebar-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={onExport}
              title="Export this project as JSON"
              aria-label="Export project"
            >
              <I.download size={12} />
            </Button>
            {folderSupported ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSaveToFolder}
                disabled={folderSyncing}
                title="Write the current project to a folder on this computer"
                aria-label="Save project to local folder"
              >
                <I.folderOpen size={12} />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={onDiff}
              disabled={!hasDirtyFiles}
              title={hasDirtyFiles ? "Show unsaved changes vs. last saved" : "No unsaved changes"}
              aria-label="Show unsaved changes"
            >
              <I.diff size={12} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSync}
              disabled={!canSync}
              title={
                canSync
                  ? "Jump the preview to the current cursor line (Cmd/Ctrl+J)"
                  : "Compile the current source with SyncTeX to enable source-to-PDF sync"
              }
              aria-label="Sync PDF preview to cursor"
            >
              <I.zap size={12} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onBibliography}
              title="Browse project bibliography (Cmd/Ctrl+Shift+B)"
              aria-label="Open bibliography"
            >
              <I.bib size={12} />
            </Button>
          </div>
          <div className="od-editor-sidebar-rule" />
          {creating ? (
            <NewFileForm
              onCancel={() => setCreating(false)}
              onSubmit={async (path) => {
                if (await onCreateFile(path)) setCreating(false);
              }}
            />
          ) : null}
          <FileTree
            key={project.id}
            project={project}
            activePath={activePath}
            onOpenFile={onOpenFile}
            onRenameFile={onRenameFile}
            onDeleteFile={onDeleteFile}
            {...(onRestoreFile ? { onRestoreFile } : {})}
          />
          <div className="od-sidebar-section">
            <h3 className="od-sidebar-section-head">Outline</h3>
            <OutlinePanel project={project} activePath={activePath} onJump={onJumpToLine} />
          </div>
        </div>
        {dragDepth > 0 ? (
          <div className="od-tree-drop-overlay" aria-hidden="true">
            <div className="od-tree-drop-card">
              <I.upload size={18} />
              <div className="od-tree-drop-title">Drop to upload</div>
              <div className="od-tree-drop-sub">
                Images, PDFs and text files land at the project root
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }),
);

function AutoSaveSelect() {
  const autoSave = usePreferences((state) => state.autoSave);
  const setAutoSave = usePreferences((state) => state.setAutoSave);
  return (
    <label
      className="od-autosave-select"
      title="Auto-save cadence - periodically saves every dirty file"
    >
      <span className="od-sr-only">Auto-save cadence</span>
      <select
        value={autoSave}
        onChange={(event) => setAutoSave(event.target.value as typeof autoSave)}
        aria-label="Auto-save cadence"
      >
        <option value="off">Auto-save: off</option>
        <option value="5s">Auto-save: 5s</option>
        <option value="15s">Auto-save: 15s</option>
        <option value="30s">Auto-save: 30s</option>
      </select>
    </label>
  );
}
