import { useEffect, useLayoutEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";
import type { FileKind } from "@/domain";
import { shortcutDefaults, type ShortcutBindingMap } from "@/features/shortcuts/shortcut-registry";
import { ExternalPatch, buildEditorState, editorShortcutCompartment } from "./codemirror-setup";
import { setEditorDiagnostics, type EditorDiagnostic } from "./editor-diagnostics";
import { editorShortcutExtension } from "./editor-shortcuts";

export interface JumpTarget {
  line: number;
  column?: number | undefined;
  /** Distinguishes repeated requests for the same location. */
  requestId: number;
}

interface CodeMirrorEditorProps {
  /** Changing this identity rebuilds state, including history and language mode. */
  documentKey: string;
  value: string;
  kind: FileKind | undefined;
  shortcutBindings?: ShortcutBindingMap;
  onChange: (next: string) => void;
  jumpTo?: JumpTarget;
  onCursorChange?: (line: number, column: number) => void;
  /** Return true after consuming pasted files to suppress normal paste handling. */
  onPasteFiles?: (files: File[]) => boolean;
  diagnostics?: readonly EditorDiagnostic[];
}

/**
 * React lifecycle adapter for one CodeMirror view. Document switches rebuild
 * state; external updates to the same document are patched in place.
 */
export function CodeMirrorEditor({
  documentKey,
  value,
  kind,
  shortcutBindings = shortcutDefaults(),
  onChange,
  jumpTo,
  onCursorChange,
  onPasteFiles,
  diagnostics = [],
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const loadedDocumentKeyRef = useRef<string | null>(null);
  const loadedKindRef = useRef<FileKind | undefined>(undefined);
  const latestDocumentRef = useRef({ documentKey, value, kind });
  const latestShortcutBindingsRef = useRef(shortcutBindings);
  const lastNotifiedRef = useRef<string | null>(null);

  // Stable listeners keep the view alive while React callbacks change identity.
  const onChangeRef = useRef((next: string) => {
    lastNotifiedRef.current = next;
    onChange(next);
  });
  const onCursorChangeRef = useRef(onCursorChange);
  const onPasteFilesRef = useRef(onPasteFiles);

  useLayoutEffect(() => {
    latestDocumentRef.current = { documentKey, value, kind };
    latestShortcutBindingsRef.current = shortcutBindings;
    onChangeRef.current = (next: string) => {
      lastNotifiedRef.current = next;
      onChange(next);
    };
    onCursorChangeRef.current = onCursorChange;
    onPasteFilesRef.current = onPasteFiles;
  }, [documentKey, value, kind, shortcutBindings, onChange, onCursorChange, onPasteFiles]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initial = latestDocumentRef.current;
    const view = new EditorView({
      state: buildEditorState({
        content: initial.value,
        kind: initial.kind,
        shortcutBindings: latestShortcutBindingsRef.current,
        onChange: (next) => onChangeRef.current(next),
        onCursorChange: (line, col) => onCursorChangeRef.current?.(line, col),
        onPasteFiles: (files) => onPasteFilesRef.current?.(files) ?? false,
      }),
      parent: host,
    });
    loadedDocumentKeyRef.current = initial.documentKey;
    loadedKindRef.current = initial.kind;
    view.scrollDOM.tabIndex = 0;
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
      loadedDocumentKeyRef.current = null;
      loadedKindRef.current = undefined;
    };
  }, []);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (loadedDocumentKeyRef.current !== documentKey || loadedKindRef.current !== kind) {
      view.setState(
        buildEditorState({
          content: value,
          kind,
          shortcutBindings: latestShortcutBindingsRef.current,
          onChange: (next) => onChangeRef.current(next),
          onCursorChange: (line, col) => onCursorChangeRef.current?.(line, col),
          onPasteFiles: (files) => onPasteFilesRef.current?.(files) ?? false,
        }),
      );
      loadedDocumentKeyRef.current = documentKey;
      loadedKindRef.current = kind;
      lastNotifiedRef.current = null;
      return;
    }
    const normalizedValue = value.replace(/\r\n/g, "\n");
    if (lastNotifiedRef.current === normalizedValue) {
      lastNotifiedRef.current = null;
      return;
    }
    const current = view.state.doc.toString();
    if (current === normalizedValue) return;

    // A minimal patch lets CodeMirror preserve selections outside the changed range.
    const patch = minimalChange(current, normalizedValue);
    view.dispatch({
      changes: patch,
      annotations: ExternalPatch.of(true),
    });
    lastNotifiedRef.current = null;
  }, [documentKey, value, kind]);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editorShortcutCompartment.reconfigure(editorShortcutExtension(shortcutBindings)),
    });
  }, [shortcutBindings]);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (view) setEditorDiagnostics(view, diagnostics);
  }, [documentKey, diagnostics]);

  const jumpRequestId = jumpTo?.requestId;
  const jumpLine = jumpTo?.line;
  const jumpColumn = jumpTo?.column;
  const lastProcessedJumpIdRef = useRef<number | null>(null);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || jumpRequestId === undefined || jumpLine === undefined) return;
    if (lastProcessedJumpIdRef.current === jumpRequestId) return;

    lastProcessedJumpIdRef.current = jumpRequestId;

    const doc = view.state.doc;
    const line = Math.max(1, Math.min(doc.lines || 1, jumpLine));
    const lineInfo = doc.line(line);
    const col = Math.max(1, jumpColumn ?? 1);
    const pos = Math.min(lineInfo.from + (col - 1), lineInfo.to);
    view.dispatch({
      selection: { anchor: pos },
      scrollIntoView: true,
    });
    view.focus();
  }, [jumpRequestId, jumpLine, jumpColumn]);

  return <div ref={hostRef} className="od-cm-host" data-testid="codemirror-host" />;
}

/**
 * Compute a single minimal replacement in coordinates of the old document.
 */
function minimalChange(from: string, to: string): { from: number; to: number; insert: string } {
  const oldLen = from.length;
  const newLen = to.length;
  const maxPrefix = Math.min(oldLen, newLen);

  let prefix = 0;
  while (prefix < maxPrefix && from.charCodeAt(prefix) === to.charCodeAt(prefix)) {
    prefix++;
  }

  // Do not let the common suffix overlap the prefix in either string.
  const maxSuffix = Math.min(oldLen - prefix, newLen - prefix);
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    from.charCodeAt(oldLen - 1 - suffix) === to.charCodeAt(newLen - 1 - suffix)
  ) {
    suffix++;
  }

  return {
    from: prefix,
    to: oldLen - suffix,
    insert: to.slice(prefix, newLen - suffix),
  };
}
