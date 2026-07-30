import { useDeferredValue, useMemo, useState, useEffect, type ReactElement } from "react";
import { I, Button } from "@/components/primitives";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import type { Project } from "@/domain";
import { findInProject, replaceInString, type FindFileResult } from "./find-in-files";
import { useTabsStore } from "./useTabsStore";
import { useProjectsStore } from "@/features/projects/useProjectsStore";

// Search includes unsaved buffers from the tabs store.

interface FindInFilesPanelProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  onJump: (path: string, line: number) => void;
}

export function FindInFilesPanel({
  open,
  onClose,
  project,
  onJump,
}: FindInFilesPanelProps): ReactElement | null {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const edits = useTabsStore((s) => s.edits);
  const updateContent = useTabsStore((s) => s.updateContent);
  const saveFiles = useProjectsStore((s) => s.saveActive);
  const [query, setQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const results = useMemo<FindFileResult[]>(() => {
    if (deferredQuery.length === 0) return [];
    return findInProject(project, deferredQuery, {
      regex,
      caseInsensitive: !caseSensitive,
      edits,
    });
  }, [project, deferredQuery, regex, caseSensitive, edits]);

  const hitCount = useMemo(() => results.reduce((sum, r) => sum + r.hits.length, 0), [results]);

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

  const handleReplaceAll = async () => {
    if (deferredQuery.length === 0 || results.length === 0) return;

    const replacements: Record<string, string> = {};
    for (const fileResult of results) {
      const path = fileResult.path;
      const file = project.files[path];
      if (!file) continue;

      const currentSource = edits[path] ?? file.content;
      if (typeof currentSource !== "string") continue;

      const newSource = replaceInString(currentSource, deferredQuery, replaceQuery, {
        regex,
        caseInsensitive: !caseSensitive,
      });

      if (newSource !== currentSource) {
        replacements[path] = newSource;
        updateContent(path, newSource);
      }
    }

    const changedPaths = Object.keys(replacements);
    if (changedPaths.length > 0) await saveFiles(changedPaths, replacements);
  };

  if (!open) return null;

  return (
    <div
      className="od-diff-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Find and replace in files"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="od-findinfiles" ref={trapRef} tabIndex={-1}>
        <header
          className="od-findinfiles-head"
          style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Toggle replace mode"
              onClick={() => setShowReplace(!showReplace)}
              title={showReplace ? "Hide replace" : "Show replace"}
            >
              {showReplace ? <I.chevronD size={12} /> : <I.chevronR size={12} />}
            </Button>
            <I.search size={14} style={{ color: "var(--od-muted)" }} />
            <input
              type="text"
              autoFocus
              spellCheck={false}
              className="od-quickopen-input"
              placeholder="Search across all files..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  onClose();
                }
              }}
              aria-label="Find query"
              style={{ flex: 1 }}
            />
            <label className="od-findinfiles-toggle" title="Toggle regex mode">
              <input
                type="checkbox"
                checked={regex}
                onChange={(e) => setRegex(e.target.checked)}
                aria-label="Regex"
              />
              <code>.*</code>
            </label>
            <label className="od-findinfiles-toggle" title="Match case">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                aria-label="Match case"
              />
              <span>Aa</span>
            </label>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close find in files"
              onClick={onClose}
              leadingIcon={<I.x size={12} />}
            >
              Close
            </Button>
          </div>

          {showReplace && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: 24 }}>
              <input
                type="text"
                spellCheck={false}
                className="od-quickopen-input"
                placeholder="Replace with..."
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    onClose();
                  } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void handleReplaceAll();
                  }
                }}
                aria-label="Replace query"
                style={{ flex: 1 }}
              />
              <Button
                variant="soft"
                size="sm"
                onClick={() => void handleReplaceAll()}
                disabled={query.length === 0 || results.length === 0}
                title="Replace all occurrences (Cmd/Ctrl+Enter)"
              >
                Replace All
              </Button>
            </div>
          )}
        </header>

        <div className="od-findinfiles-summary" role="status" aria-live="polite">
          {query.length === 0 ? (
            <span className="od-diff-subtle">Type to search every text file in the project.</span>
          ) : deferredQuery !== query ? (
            <span className="od-diff-subtle">Searching...</span>
          ) : results.length === 0 ? (
            <span className="od-diff-subtle">No matches.</span>
          ) : (
            <span>
              {hitCount} match{hitCount === 1 ? "" : "es"} in {results.length} file
              {results.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="od-findinfiles-body">
          {results.map((file) => (
            <section key={file.path} className="od-findinfiles-file">
              <h4 className="od-findinfiles-filename">
                <span>{file.path}</span>
                <span className="od-findinfiles-count">{file.hits.length}</span>
              </h4>
              <ul>
                {file.hits.map((hit, i) => (
                  <li
                    key={`${file.path}-${hit.line}-${i}`}
                    className="od-findinfiles-hit"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      onJump(file.path, hit.line);
                      onClose();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onJump(file.path, hit.line);
                        onClose();
                      }
                    }}
                  >
                    <span className="od-findinfiles-line">{hit.line}</span>
                    <HighlightedLine text={hit.text} start={hit.columnStart} end={hit.columnEnd} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function HighlightedLine({ text, start, end }: { text: string; start: number; end: number }) {
  // Clip very long lines so a 5000-char minified blob doesn't tank
  // the render. Centre the match in the visible window.
  const MAX = 220;
  let prefix = text.slice(0, start);
  const match = text.slice(start, end);
  let suffix = text.slice(end);
  if (prefix.length > 60) prefix = "..." + prefix.slice(-60);
  if (suffix.length > MAX - 60 - match.length)
    suffix = suffix.slice(0, MAX - 60 - match.length) + "...";
  return (
    <code className="od-findinfiles-snippet">
      {prefix}
      <mark className="od-findinfiles-mark">{match}</mark>
      {suffix}
    </code>
  );
}
