import type { FileKind, FileNode } from "@/domain";
import { I } from "@/components/primitives";
import { memo } from "react";

interface EditorTabsProps {
  tabs: string[];
  activeTab: string | null;
  /** Lookup map: path -> FileNode. We pass the whole map so the strip
   *  can render names + modified state without an extra prop per tab. */
  files: Record<string, FileNode>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

const iconForKind = (kind: FileKind | undefined) => {
  if (kind === "tex") return <I.tex size={12} />;
  if (kind === "bib") return <I.bib size={12} />;
  return <I.file size={12} />;
};

export const EditorTabs = memo(function EditorTabs({
  tabs,
  activeTab,
  files,
  onSelect,
  onClose,
}: EditorTabsProps) {
  return (
    <nav className="od-tabs" aria-label="Open files">
      {tabs.map((path) => {
        const file = files[path];
        const isActive = path === activeTab;
        return (
          <div key={path} role="presentation" className={`od-tab${isActive ? " is-active" : ""}`}>
            <button
              type="button"
              aria-current={isActive ? "page" : undefined}
              className="od-tab-target"
              onClick={() => onSelect(path)}
            >
              {iconForKind(file?.kind)}
              <span>{file?.name ?? path}</span>
              {file?.modified && <span className="dirty" title="Modified" aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="od-tab-close"
              aria-label={`Close ${file?.name ?? path}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(path);
              }}
            >
              <I.x size={11} />
            </button>
          </div>
        );
      })}
      <div className="od-tabs-fill" aria-hidden="true" />
    </nav>
  );
});
