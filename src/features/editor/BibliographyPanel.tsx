import { useMemo, useState, useEffect, type ReactElement } from "react";
import { I, Button } from "@/components/primitives";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import { bibEntrySummary } from "@/lib/bibtex/parse";
import { useBibStore } from "./useBibStore";

// Uses the same bibliography index as citation autocomplete.

interface BibliographyPanelProps {
  open: boolean;
  onClose: () => void;
  onInsert: (key: string) => void;
}

export function BibliographyPanel({
  open,
  onClose,
  onInsert,
}: BibliographyPanelProps): ReactElement | null {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const entries = useBibStore((s) => s.entries);
  const origins = useBibStore((s) => s.origins);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.map((entry, i) => ({ entry, origin: origins[i]! }));
    return entries
      .map((entry, i) => ({ entry, origin: origins[i]! }))
      .filter(({ entry }) => {
        if (entry.key.toLowerCase().includes(q)) return true;
        if (entry.fields.title?.toLowerCase().includes(q)) return true;
        if (entry.fields.author?.toLowerCase().includes(q)) return true;
        if (entry.fields.year?.toLowerCase().includes(q)) return true;
        return false;
      });
  }, [entries, origins, query]);

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

  const handlePick = (key: string) => {
    onInsert(key);
    onClose();
  };

  return (
    <div
      className="od-diff-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Project bibliography"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="od-bib-panel" ref={trapRef} tabIndex={-1}>
        <header className="od-bib-head">
          <I.search size={14} style={{ color: "var(--od-muted)" }} />
          <input
            type="text"
            autoFocus
            spellCheck={false}
            className="od-quickopen-input"
            placeholder="Filter by key, title, author, year..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            aria-label="Filter bibliography"
          />
          <span className="od-bib-count">
            {filtered.length}/{entries.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Close bibliography"
            onClick={onClose}
            leadingIcon={<I.x size={12} />}
          >
            Close
          </Button>
        </header>
        <div className="od-bib-body">
          {entries.length === 0 ? (
            <p className="od-bib-empty">
              No <code>.bib</code> files in this project - add one to populate the bibliography.
            </p>
          ) : filtered.length === 0 ? (
            <p className="od-bib-empty">No entries match the filter.</p>
          ) : (
            <ul className="od-bib-list" aria-label="Bibliography entries">
              {filtered.map(({ entry, origin }) => (
                <li
                  key={`${origin}-${entry.key}-${entry.line}`}
                  className="od-bib-entry"
                  onClick={() => handlePick(entry.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handlePick(entry.key);
                    }
                  }}
                  aria-label={`Insert \\cite{${entry.key}}`}
                >
                  <div className="od-bib-entry-row">
                    <code className="od-bib-key">{entry.key}</code>
                    <span className="od-bib-type">{entry.type}</span>
                    <span className="grow" />
                    <span className="od-bib-origin">{origin}</span>
                  </div>
                  <div className="od-bib-summary">{bibEntrySummary(entry)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="od-bib-foot">
          <span>Pick an entry to insert {`\\cite{key}`} at the cursor.</span>
        </footer>
      </div>
    </div>
  );
}
