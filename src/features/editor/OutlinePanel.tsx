import { useMemo } from "react";
import { I } from "@/components/primitives";
import type { Project } from "@/domain";
import { parseOutline, type OutlineNode } from "./outline";
import { useFileContent } from "./selectors";

// document outline panel.
//
// Renders the section tree of the active file, indented by depth.
// Clicking a row asks the editor to jump to that line. The panel
// reads through useFileContent so it tracks unsaved edits live -
// new \sections appear as soon as the user finishes typing the
// closing brace.

interface OutlinePanelProps {
  project: Project;
  activePath: string | null;
  /** Caller routes through CodeMirror's jump-to-line. */
  onJump: (path: string, line: number) => void;
}

export function OutlinePanel({ project, activePath, onJump }: OutlinePanelProps) {
  const file = activePath ? project.files[activePath] : undefined;
  // useFileContent returns the in-memory edit when present, else the
  // persisted content. Either way we render whatever the user is
  // currently looking at, so the outline tracks unsaved edits.
  const editedSource = useFileContent(activePath);
  const source = editedSource ?? "";

  const nodes = useMemo<OutlineNode[]>(() => parseOutline(source), [source]);

  if (!activePath || !file) {
    return (
      <div className="od-outline-empty" aria-label="Document outline">
        Open a file to see its outline.
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="od-outline-empty" aria-label="Document outline">
        No <code>\section</code>-style commands in this file.
      </div>
    );
  }

  return (
    <ul className="od-outline-list" aria-label="Document outline" role="tree">
      {nodes.map((node, i) => (
        <li
          key={`${node.line}-${i}`}
          role="treeitem"
          aria-level={node.depth + 1}
          className="od-outline-row"
          style={{ paddingLeft: 8 + node.depth * 12 }}
        >
          <button
            type="button"
            onClick={() => onJump(activePath, node.line)}
            className="od-outline-btn"
            aria-label={`Jump to ${node.kind} ${node.title || "(untitled)"} on line ${node.line}`}
            title={`Line ${node.line}`}
          >
            <I.chevronR
              size={9}
              style={{ opacity: 0.5, transform: "rotate(90deg)", flex: "0 0 9px" }}
            />
            <span className={`od-outline-kind od-outline-kind--${node.kind}`}>{node.kind}</span>
            <span className="od-outline-title">
              {node.title || <em style={{ opacity: 0.6 }}>(untitled)</em>}
              {node.starred ? <span className="od-outline-star">*</span> : null}
            </span>
            <span className="od-outline-line">{node.line}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
