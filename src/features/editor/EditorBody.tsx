import { isTextContent, type FileNode } from "@/domain";
import { memo, useMemo } from "react";
import { CodeMirrorEditor, type JumpTarget } from "./CodeMirrorEditor";
import { useFileContent } from "./selectors";
import { useTabsStore } from "./useTabsStore";
import type { EditorDiagnostic } from "./editor-diagnostics";
import { effectiveShortcutBindings, useShortcutStore } from "@/store/shortcuts";

interface EditorBodyProps {
  file: FileNode | undefined;
  /** Programmatic jump (compile-log click). Forwarded to CodeMirror
   *  only when the target file matches the active one. */
  jumpTo?: JumpTarget & { path: string };
  /** Fires on cursor moves with (path, line, col). */
  onCursorChange?: (path: string, line: number, column: number) => void;
  /** Image / file paste handler. Returning true tells CodeMirror to swallow the paste. */
  onPasteFiles?: (files: File[]) => boolean;
  diagnostics?: readonly EditorDiagnostic[];
}

/**
 * Wires the active file into the CodeMirror adapter:
 *   value     = edit or original               (selector)
 *   onChange  = useTabsStore.updateContent      (action)
 *   key       = file.path                        (document identity)
 *
 * When there's no active file we render an empty-state instead. The
 * CodeMirror instance is unmounted in that case so we don't carry a
 * detached EditorView between project switches.
 */
export const EditorBody = memo(function EditorBody({
  file,
  jumpTo,
  onCursorChange,
  onPasteFiles,
  diagnostics = [],
}: EditorBodyProps) {
  const content = useFileContent(file?.path ?? null);
  const updateContent = useTabsStore((s) => s.updateContent);
  const shortcutOverrides = useShortcutStore((state) => state.overrides);
  const shortcutBindings = useMemo(
    () => effectiveShortcutBindings(shortcutOverrides),
    [shortcutOverrides],
  );

  if (!file) return <EmptyState />;

  const matchedJump: JumpTarget | undefined =
    jumpTo && jumpTo.path === file.path
      ? {
          line: jumpTo.line,
          ...(jumpTo.column !== undefined ? { column: jumpTo.column } : {}),
          requestId: jumpTo.requestId,
        }
      : undefined;

  // Binary files (images, PDFs) don't have an editable text view.
  // We render a friendly placeholder instead of dropping a
  // Uint8Array into CodeMirror. One narrow on the file.content
  // serves both the binary fallback render and the typed value we
  // pass into CodeMirror below.
  if (!isTextContent(file.content)) {
    return <BinaryPlaceholder file={file} />;
  }

  return (
    <CodeMirrorEditor
      documentKey={file.path}
      value={content ?? file.content}
      kind={file.kind}
      shortcutBindings={shortcutBindings}
      diagnostics={diagnostics}
      onChange={(next) => updateContent(file.path, next)}
      {...(matchedJump ? { jumpTo: matchedJump } : {})}
      {...(onCursorChange
        ? { onCursorChange: (line, column) => onCursorChange(file.path, line, column) }
        : {})}
      {...(onPasteFiles ? { onPasteFiles } : {})}
    />
  );
});

function BinaryPlaceholder({ file }: { file: FileNode }) {
  const size = file.content instanceof Uint8Array ? file.content.byteLength : 0;
  const kb = (size / 1024).toFixed(1);
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        color: "var(--od-muted)",
        fontSize: 13,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div>
        <div style={{ marginBottom: 4 }}>
          Binary file <code>{file.path}</code>
        </div>
        <div style={{ fontSize: 12 }}>
          {file.kind} / {kb} KB / referenced from .tex via \includegraphics
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        color: "var(--od-muted)",
        fontSize: 13,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div>
        <div style={{ marginBottom: 4 }}>No file open.</div>
        <div style={{ fontSize: 12 }}>Pick one from the tree on the left.</div>
      </div>
    </div>
  );
}
