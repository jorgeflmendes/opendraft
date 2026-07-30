import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FileKind, Project, FileNode } from "@/domain";
import { I } from "@/components/primitives";
import { buildFileTree, type TreeNode } from "./file-tree-builder";

interface FileTreeProps {
  project: Project;
  /** Path of the file currently focused in the editor - gets the active style. */
  activePath: string | null;
  /** Called when the user clicks a file entry. */
  onOpenFile: (path: string) => void;
  /** Rename request from a row's kebab menu. */
  onRenameFile?: ((oldPath: string, newPath: string) => Promise<boolean> | boolean) | undefined;
  /** Delete request from a row's kebab menu. */
  onDeleteFile?: ((path: string) => Promise<boolean> | boolean) | undefined;
  /** Restore request from a row's kebab menu (in trash). */
  onRestoreFile?: ((path: string) => Promise<boolean> | boolean) | undefined;
  onContextMenu?: (e: React.MouseEvent, path: string, isFolder: boolean) => void;
}

const iconForKind = (kind: FileKind): ReactNode => {
  if (kind === "tex") return <I.tex size={14} />;
  if (kind === "bib") return <I.bib size={14} />;
  if (kind === "img") return <I.img size={14} />;
  return <I.file size={14} />;
};

/**
 * Recursive file tree. Folder expand/collapse is local component
 * state, scoped to a project by the parent component. The tree is materialised once
 * per project via useMemo so re-renders from a tab switch don't
 * re-walk the project graph.
 */
export const FileTree = memo(function FileTree({
  project,
  activePath,
  onOpenFile,
  onRenameFile,
  onDeleteFile,
  onRestoreFile,
  onContextMenu: FileTreeProps_onContextMenu,
}: FileTreeProps) {
  const { tree, deletedFiles } = useMemo(() => {
    const activeFiles: Record<string, FileNode> = {};
    const deletedFiles: FileNode[] = [];
    for (const [path, file] of Object.entries(project.files)) {
      if (file.deletedAt) {
        deletedFiles.push(file);
      } else {
        activeFiles[path] = file;
      }
    }
    const tree = buildFileTree({ ...project, files: activeFiles });
    return { tree, deletedFiles };
  }, [project]);
  const [trashExpanded, setTrashExpanded] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const f of Object.values(project.folders)) {
      if (f.expanded) initial.add(f.path);
    }
    return initial;
  });
  const [renaming, setRenaming] = useState<string | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    path: string;
    isFolder: boolean;
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, path: string, isFolder: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ path, isFolder, x: e.clientX, y: e.clientY });
    if (FileTreeProps_onContextMenu) {
      FileTreeProps_onContextMenu(e, path, isFolder);
    }
  };

  useEffect(() => {
    if (!contextMenu) return;
    const off = () => setContextMenu(null);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [contextMenu]);

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <nav className="od-tree" aria-label={`${project.name} files`}>
      {tree.map((node) => (
        <TreeNodeRow
          key={node.type === "folder" ? `f:${node.path}` : `p:${node.path}`}
          node={node}
          depth={0}
          activePath={activePath}
          expanded={expanded}
          onToggleFolder={toggleFolder}
          onOpenFile={onOpenFile}
          {...(onRenameFile ? { onRenameFile } : {})}
          {...(onDeleteFile ? { onDeleteFile } : {})}
          renaming={renaming}
          setRenaming={setRenaming}
          onContextMenu={handleContextMenu}
        />
      ))}

      {contextMenu && (
        <div
          role="menu"
          aria-label="Context menu"
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            background: "var(--od-paper)",
            border: "1px solid var(--od-border-strong)",
            borderRadius: 8,
            boxShadow: "var(--od-shadow-lg)",
            padding: 4,
            minWidth: 160,
            zIndex: 50,
            fontSize: 12,
          }}
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {onRenameFile && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setContextMenu(null);
                setRenaming(contextMenu.path);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setContextMenu(null);
                  setRenaming(contextMenu.path);
                }
              }}
              style={menuItemStyle()}
            >
              Rename
            </button>
          )}
          {onDeleteFile && (
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setContextMenu(null);
                if (window.confirm(`Are you sure you want to delete ${contextMenu.path}?`)) {
                  await onDeleteFile(contextMenu.path);
                }
              }}
              onKeyDown={async (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setContextMenu(null);
                  if (window.confirm(`Are you sure you want to delete ${contextMenu.path}?`)) {
                    await onDeleteFile(contextMenu.path);
                  }
                }
              }}
              style={menuItemStyle(true)}
            >
              Delete
            </button>
          )}
        </div>
      )}

      {deletedFiles.length > 0 && (
        <>
          <button
            type="button"
            className="od-tree-row"
            onClick={() => setTrashExpanded(!trashExpanded)}
            style={{ marginTop: 16 }}
          >
            <span className="od-tree-icon">
              {trashExpanded ? <I.chevronD size={12} /> : <I.chevronR size={12} />}
            </span>
            <span className="od-tree-icon">
              <I.trash size={14} />
            </span>
            <span className="od-tree-name">Trash</span>
          </button>
          {trashExpanded &&
            deletedFiles.map((file) => (
              <div
                key={`trash:${file.path}`}
                className="od-tree-row"
                style={{ paddingRight: 4, opacity: 0.7 }}
              >
                <div
                  style={{
                    all: "unset",
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    minWidth: 0,
                  }}
                >
                  <span style={{ width: 14 }} />
                  <span className="od-tree-icon">{iconForKind(file.kind)}</span>
                  <span className="od-tree-name" style={{ textDecoration: "line-through" }}>
                    {file.name}
                  </span>
                </div>
                {onRestoreFile && (
                  <button
                    type="button"
                    className="od-btn od-btn--ghost od-btn--sm"
                    title="Restore"
                    aria-label={`Restore ${file.path}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestoreFile(file.path);
                    }}
                    style={{ paddingLeft: 4, paddingRight: 4, height: 22 }}
                  >
                    <I.refresh size={12} />
                  </button>
                )}
              </div>
            ))}
        </>
      )}
    </nav>
  );
});

interface RowProps {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  expanded: Set<string>;
  onToggleFolder: (path: string) => void;
  onOpenFile: (path: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => Promise<boolean> | boolean;
  onDeleteFile?: (path: string) => Promise<boolean> | boolean;
  renaming: string | null;
  setRenaming: (path: string | null) => void;
  onContextMenu?: (e: React.MouseEvent, path: string, isFolder: boolean) => void;
}

function TreeNodeRow(props: RowProps) {
  const {
    node,
    depth,
    activePath,
    expanded,
    onToggleFolder,
    onOpenFile,
    renaming,
    setRenaming,
    onContextMenu,
  } = props;

  if (node.type === "folder") {
    const isOpen = expanded.has(node.path);
    return (
      <>
        <button
          type="button"
          aria-expanded={isOpen}
          className="od-tree-row"
          onClick={() => onToggleFolder(node.path)}
          onContextMenu={(e) => onContextMenu?.(e, node.path, true)}
        >
          <span style={{ width: depth * 12 }} />
          <span className="od-tree-icon">
            {isOpen ? <I.chevronD size={12} /> : <I.chevronR size={12} />}
          </span>
          <span className="od-tree-icon">
            {isOpen ? <I.folderOpen size={14} /> : <I.folder size={14} />}
          </span>
          <span className="od-tree-name">{node.name}</span>
        </button>
        {isOpen && (
          <div>
            {node.children.map((child) => (
              <TreeNodeRow
                {...props}
                node={child}
                depth={depth + 1}
                key={child.type === "folder" ? `f:${child.path}` : `p:${child.path}`}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  const file = node.file;
  const isActive = activePath === file.path;
  const isRenaming = renaming === file.path;
  const cls = ["od-tree-row", isActive && "is-active", file.modified && "is-mod"]
    .filter(Boolean)
    .join(" ");

  if (isRenaming && props.onRenameFile) {
    return (
      <RenameInline
        currentPath={file.path}
        depth={depth}
        onCommit={async (newPath) => {
          if (newPath === file.path) {
            setRenaming(null);
            return;
          }
          const ok = await props.onRenameFile!(file.path, newPath);
          if (ok) setRenaming(null);
        }}
        onCancel={() => setRenaming(null)}
      />
    );
  }

  return (
    <div className={cls} style={{ paddingRight: 4 }}>
      <button
        type="button"
        aria-current={isActive ? "page" : undefined}
        onClick={() => onOpenFile(file.path)}
        onContextMenu={(e) => onContextMenu?.(e, file.path, false)}
        style={{
          all: "unset",
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          minWidth: 0,
        }}
      >
        <span style={{ width: depth * 12 + 14 }} />
        <span className="od-tree-icon">{iconForKind(file.kind)}</span>
        <span className="od-tree-name">{node.name}</span>
        {file.modified && (
          <span className="badge" title="Modified">
            M
          </span>
        )}
      </button>
      {(props.onRenameFile || props.onDeleteFile) && (
        <RowKebab
          fileName={file.path}
          {...(props.onRenameFile ? { onRename: () => setRenaming(file.path) } : {})}
          {...(props.onDeleteFile ? { onDelete: () => props.onDeleteFile!(file.path) } : {})}
        />
      )}
    </div>
  );
}

function RowKebab({
  fileName,
  onRename,
  onDelete,
}: {
  fileName: string;
  onRename?: () => void;
  onDelete?: () => Promise<boolean> | boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (!wrapRef.current || !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="od-btn od-btn--ghost od-btn--sm"
        aria-label={`Actions for ${fileName}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
          setConfirming(false);
        }}
        style={{ paddingLeft: 4, paddingRight: 4, height: 22 }}
      >
        <I.dots size={12} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "var(--od-paper)",
            border: "1px solid var(--od-border-strong)",
            borderRadius: 8,
            boxShadow: "var(--od-shadow-lg)",
            padding: 4,
            minWidth: 160,
            zIndex: 20,
            fontSize: 12,
          }}
        >
          {onRename && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onRename();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(false);
                  onRename();
                }
              }}
              style={menuItemStyle()}
            >
              Rename
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                setOpen(false);
                setConfirming(false);
                await onDelete();
              }}
              onKeyDown={async (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!confirming) {
                    setConfirming(true);
                    return;
                  }
                  setOpen(false);
                  setConfirming(false);
                  await onDelete();
                }
              }}
              style={menuItemStyle(confirming)}
            >
              {confirming ? "Click again to delete" : "Delete"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function menuItemStyle(danger = false): React.CSSProperties {
  return {
    all: "unset",
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 10px",
    borderRadius: 5,
    fontFamily: "inherit",
    fontSize: 12,
    cursor: "pointer",
    color: danger ? "var(--od-err)" : "var(--od-ink)",
    background: danger ? "var(--od-err-wash)" : "transparent",
  };
}

function RenameInline({
  currentPath,
  depth,
  onCommit,
  onCancel,
}: {
  currentPath: string;
  depth: number;
  onCommit: (newPath: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(currentPath);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <form
      className="od-tree-row"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed) onCommit(trimmed);
      }}
    >
      <span style={{ width: depth * 12 + 14 }} />
      <input
        ref={ref}
        className="od-input"
        style={{ flex: 1, height: 24, fontSize: 12, fontFamily: "var(--od-mono)" }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        aria-label={`Rename ${currentPath}`}
      />
    </form>
  );
}
