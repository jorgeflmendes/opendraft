import { useEffect, useRef, useState } from "react";
import { Button, I } from "@/components/primitives";

interface NewFileFormProps {
  /** Optional path prefix - used when invoked from a folder's
   *  context. E.g. "chapters/" means the user types only the file
   *  name after that. */
  prefix?: string;
  onCancel: () => void;
  onSubmit: (path: string) => Promise<void> | void;
  busy?: boolean;
}

/**
 * Inline path-entry form rendered by the file tree when the user
 * clicks "+". Validation is done at submit time by the service
 * (validatePath) - this component just collects keystrokes.
 */
export function NewFileForm({ prefix = "", onCancel, onSubmit, busy = false }: NewFileFormProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = name.trim();
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!trimmed || busy) return;
    await onSubmit(prefix + trimmed);
    setName("");
  };

  return (
    <form
      onSubmit={submit}
      aria-label="New file"
      style={{
        display: "flex",
        gap: 6,
        padding: "8px 10px",
        margin: "4px 10px 6px",
        background: "var(--od-paper-2)",
        border: "1px solid var(--od-border)",
        borderRadius: 7,
        alignItems: "center",
      }}
    >
      <I.plus size={12} style={{ color: "var(--od-coral)" }} />
      {prefix && (
        <span style={{ fontSize: 11, color: "var(--od-muted)", fontFamily: "var(--od-mono)" }}>
          {prefix}
        </span>
      )}
      <input
        ref={inputRef}
        className="od-input"
        style={{ flex: 1, height: 26, fontSize: 12, fontFamily: "var(--od-mono)" }}
        type="text"
        placeholder="path/to/file.tex"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        aria-label="File path"
        disabled={busy}
      />
      <Button type="submit" variant="primary" size="sm" disabled={!trimmed || busy}>
        Create
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCancel}
        disabled={busy}
        aria-label="Cancel new file"
      >
        <I.x size={11} />
      </Button>
    </form>
  );
}
