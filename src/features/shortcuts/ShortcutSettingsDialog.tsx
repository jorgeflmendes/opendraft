import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button, I } from "@/components/primitives";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import { comboFromKeyboardEvent, formatCombo, isMacPlatform } from "@/lib/keymap";
import {
  effectiveShortcutBindings,
  findShortcutConflict,
  useShortcutStore,
} from "@/store/shortcuts";
import { SHORTCUT_CATEGORIES, SHORTCUT_DEFINITIONS, type ShortcutId } from "./shortcut-registry";

interface ShortcutSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface RecordingTarget {
  id: ShortcutId;
  index: number | null;
}

export function ShortcutSettingsDialog({ open, onClose }: ShortcutSettingsDialogProps) {
  const overrides = useShortcutStore((state) => state.overrides);
  const setBindings = useShortcutStore((state) => state.setBindings);
  const resetBinding = useShortcutStore((state) => state.resetBinding);
  const resetAll = useShortcutStore((state) => state.resetAll);
  const bindings = useMemo(() => effectiveShortcutBindings(overrides), [overrides]);
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<RecordingTarget | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const isMac = isMacPlatform(typeof navigator !== "undefined" ? navigator : {});

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (recording) {
        setRecording(null);
        setRecordingError(null);
      } else {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, open, recording]);

  useEffect(() => {
    if (open) return;
    setQuery("");
    setRecording(null);
    setRecordingError(null);
  }, [open]);

  const visibleDefinitions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return SHORTCUT_DEFINITIONS;
    return SHORTCUT_DEFINITIONS.filter((definition) =>
      `${definition.label} ${definition.description} ${definition.category}`
        .toLowerCase()
        .includes(needle),
    );
  }, [query]);

  if (!open) return null;

  const beginRecording = (target: RecordingTarget) => {
    setRecording(target);
    setRecordingError(null);
  };

  const captureBinding = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecording(null);
      setRecordingError(null);
      return;
    }
    const combo = comboFromKeyboardEvent(event.nativeEvent, isMac);
    if (!combo) return;
    const conflict = findShortcutConflict(
      bindings,
      recording.id,
      combo,
      recording.index ?? undefined,
    );
    if (conflict) {
      setRecordingError(`${formatCombo(combo, isMac)} is already assigned to ${conflict.label}.`);
      return;
    }

    const next = [...bindings[recording.id]];
    if (recording.index === null) next.push(combo);
    else next[recording.index] = combo;
    setBindings(recording.id, next);
    setRecording(null);
    setRecordingError(null);
  };

  return (
    <div
      className="od-shortcuts-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="od-shortcuts-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="od-shortcuts-modal" ref={trapRef} tabIndex={-1}>
        <header className="od-shortcuts-header">
          <div>
            <p className="od-shortcuts-eyebrow">Preferences</p>
            <h2 id="od-shortcuts-title">Keyboard shortcuts</h2>
            <p>Choose a binding to replace it, or add another binding to the same action.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Close keyboard shortcuts"
            onClick={onClose}
            leadingIcon={<I.x size={12} />}
          >
            Close
          </Button>
        </header>

        <div className="od-shortcuts-tools">
          <label className="od-shortcuts-search">
            <I.search size={14} aria-hidden="true" />
            <span className="od-sr-only">Search shortcuts</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search actions"
            />
          </label>
          <Button variant="ghost" size="sm" onClick={resetAll}>
            Restore all defaults
          </Button>
        </div>

        <div className="od-shortcuts-content">
          {SHORTCUT_CATEGORIES.map((category) => {
            const definitions = visibleDefinitions.filter(
              (definition) => definition.category === category,
            );
            if (definitions.length === 0) return null;
            const headingId = `shortcut-category-${category.toLowerCase().replace(/\s+/g, "-")}`;
            return (
              <section key={category} className="od-shortcuts-group" aria-labelledby={headingId}>
                <h3 id={headingId}>{category}</h3>
                <div className="od-shortcuts-list">
                  {definitions.map((definition) => {
                    const actionBindings = bindings[definition.id];
                    const customized = overrides[definition.id] !== undefined;
                    return (
                      <div className="od-shortcut-row" key={definition.id}>
                        <div className="od-shortcut-copy">
                          <div className="od-shortcut-title">
                            <strong>{definition.label}</strong>
                            {customized ? <span>Modified</span> : null}
                          </div>
                          <p>{definition.description}</p>
                        </div>
                        <div className="od-shortcut-bindings">
                          {actionBindings.map((binding, index) => {
                            const isRecording =
                              recording?.id === definition.id && recording.index === index;
                            return (
                              <span className="od-shortcut-binding" key={`${binding}-${index}`}>
                                <button
                                  type="button"
                                  className={`od-shortcut-key${isRecording ? " is-recording" : ""}`}
                                  onClick={() => beginRecording({ id: definition.id, index })}
                                  onKeyDown={isRecording ? captureBinding : undefined}
                                  autoFocus={isRecording}
                                  aria-label={`Change ${definition.label}: ${formatCombo(binding, isMac)}`}
                                >
                                  {isRecording ? "Press keys…" : formatCombo(binding, isMac)}
                                </button>
                                <button
                                  type="button"
                                  className="od-shortcut-remove"
                                  aria-label={`Remove ${formatCombo(binding, isMac)} from ${definition.label}`}
                                  onClick={() =>
                                    setBindings(
                                      definition.id,
                                      actionBindings.filter((_, candidate) => candidate !== index),
                                    )
                                  }
                                >
                                  <I.x size={10} />
                                </button>
                              </span>
                            );
                          })}
                          <button
                            type="button"
                            className="od-shortcut-add"
                            onClick={() => beginRecording({ id: definition.id, index: null })}
                            onKeyDown={
                              recording?.id === definition.id && recording.index === null
                                ? captureBinding
                                : undefined
                            }
                            autoFocus={recording?.id === definition.id && recording.index === null}
                          >
                            {recording?.id === definition.id && recording.index === null
                              ? "Press keys…"
                              : actionBindings.length === 0
                                ? "Assign shortcut"
                                : "Add"}
                          </button>
                          {customized ? (
                            <button
                              type="button"
                              className="od-shortcut-reset"
                              onClick={() => resetBinding(definition.id)}
                              aria-label={`Restore default bindings for ${definition.label}`}
                            >
                              Reset
                            </button>
                          ) : null}
                        </div>
                        {recording?.id === definition.id && recordingError ? (
                          <p className="od-shortcut-conflict" role="alert">
                            {recordingError}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {visibleDefinitions.length === 0 ? (
            <div className="od-shortcuts-empty">
              No shortcut actions match <strong>{query}</strong>.
            </div>
          ) : null}
        </div>

        <footer className="od-shortcuts-footer">
          <span>Saved on this device. Clipboard and pointer gestures remain system-managed.</span>
          <span>{SHORTCUT_DEFINITIONS.length} configurable actions</span>
        </footer>
      </div>
    </div>
  );
}
