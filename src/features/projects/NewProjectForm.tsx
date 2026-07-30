import { useEffect, useRef, useState } from "react";
import { Button, I } from "@/components/primitives";

interface NewProjectFormProps {
  onCancel: () => void;
  onSubmit: (name: string) => Promise<void> | void;
  busy?: boolean;
}

export function NewProjectForm({ onCancel, onSubmit, busy = false }: NewProjectFormProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = name.trim();
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!trimmed || busy) return;
    await onSubmit(trimmed);
    setName("");
  };

  return (
    <form onSubmit={submit} className="od-new-project-form" aria-label="New project">
      <I.plus className="od-new-project-form-icon" size={14} />
      <input
        ref={inputRef}
        className="od-input od-new-project-input"
        type="text"
        placeholder="Project name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        aria-label="Project name"
        disabled={busy}
      />
      <Button type="submit" variant="primary" size="sm" disabled={!trimmed || busy}>
        Create
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
    </form>
  );
}
