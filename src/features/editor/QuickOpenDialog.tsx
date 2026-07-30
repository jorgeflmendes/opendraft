import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { I } from "@/components/primitives";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import { rankByFuzzy } from "@/lib/fuzzy/match";
import { activeFileEntries, type Project } from "@/domain";

// quick-open palette (Cmd+P / Ctrl+P).
//
// Universal-editor convention: a single modal input that fuzzy-
// matches across every file in the active project, sorted by score,
// with arrow-key navigation and Enter to open. No file-tree
// scrolling required when you know the name.

interface QuickOpenDialogProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  /** Path of the file currently in the active tab. We bubble it
   *  to the top of the empty-query list so reopening from
   *  another window goes back to where you left off. */
  activePath?: string | null;
  /** Called with the chosen path. The caller routes through
   *  useTabsStore.open + (optional) jump-to-line. */
  onPick: (path: string) => void;
}

interface Hit {
  path: string;
  matchIndices: number[];
}

export function QuickOpenDialog({
  open,
  onClose,
  project,
  activePath,
  onPick,
}: QuickOpenDialogProps): ReactElement | null {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Reset state every time the dialog opens so a stale filter from
  // a previous open doesn't leak.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const paths = activeFileEntries(project)
      .map(([path]) => path)
      .sort();
    if (deferredQuery.length === 0) {
      // No query: show every file, but float the currently-active
      // one to the top so power users can re-open it without
      // typing anything.
      const ordered =
        activePath && paths.includes(activePath)
          ? [activePath, ...paths.filter((p) => p !== activePath)]
          : paths;
      return ordered.map((path) => ({ path, matchIndices: [] }));
    }
    return rankByFuzzy(paths, deferredQuery, (p) => p).map((r) => ({
      path: r.item,
      matchIndices: r.match.indices,
    }));
  }, [project, deferredQuery, activePath]);

  // Keep selection within bounds when the result list shrinks.
  useEffect(() => {
    if (selected >= hits.length) setSelected(Math.max(0, hits.length - 1));
  }, [hits.length, selected]);

  // Scroll the selected row into view when navigation moves it
  // past the visible window. JSDOM doesn't implement
  // scrollIntoView so we feature-test before calling.
  useEffect(() => {
    if (!listRef.current) return;
    const row = listRef.current.querySelector<HTMLLIElement>(`[data-index="${selected}"]`);
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(hits.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[selected];
      if (hit) {
        onPick(hit.path);
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="od-diff-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Quick open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="od-quickopen" ref={trapRef} tabIndex={-1}>
        <div className="od-quickopen-input-row">
          <I.search size={14} style={{ color: "var(--od-muted)" }} />
          <input
            type="text"
            autoFocus
            spellCheck={false}
            className="od-quickopen-input"
            placeholder="Go to file..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={handleKeyDown}
            aria-label="Quick open query"
            aria-controls="od-quickopen-list"
            aria-activedescendant={`od-quickopen-row-${selected}`}
          />
          <kbd className="od-quickopen-hint">↑↓ navigate · ↵ open · esc close</kbd>
        </div>
        {hits.length === 0 ? (
          <div className="od-quickopen-empty">No files match.</div>
        ) : (
          <ul
            id="od-quickopen-list"
            ref={listRef}
            className="od-quickopen-list"
            role="listbox"
            aria-label="Matching files"
          >
            {hits.slice(0, 50).map((hit, i) => (
              <li
                key={hit.path}
                id={`od-quickopen-row-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === selected}
                className={i === selected ? "od-quickopen-row is-active" : "od-quickopen-row"}
                onMouseEnter={() => setSelected(i)}
                onClick={() => {
                  onPick(hit.path);
                  onClose();
                }}
              >
                <HighlightedPath path={hit.path} indices={hit.matchIndices} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HighlightedPath({ path, indices }: { path: string; indices: number[] }) {
  if (indices.length === 0) return <span>{path}</span>;
  const out: ReactElement[] = [];
  let cursor = 0;
  for (const idx of indices) {
    if (idx > cursor) out.push(<span key={`p-${cursor}`}>{path.slice(cursor, idx)}</span>);
    out.push(
      <mark key={`m-${idx}`} className="od-quickopen-hit">
        {path[idx]}
      </mark>,
    );
    cursor = idx + 1;
  }
  if (cursor < path.length) out.push(<span key={`t-${cursor}`}>{path.slice(cursor)}</span>);
  return <>{out}</>;
}
