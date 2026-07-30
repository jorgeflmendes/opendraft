import { useEffect, useRef, useState } from "react";
import type { ProjectSummary } from "@/domain";
import { Button, I } from "@/components/primitives";

interface ProjectListItemProps {
  summary: ProjectSummary;
  active?: boolean;
  onOpen: (id: string) => void;
  onDelete?: (id: string) => void | Promise<void>;
  onDuplicate?: (id: string) => void | Promise<void>;
  onRestore?: (id: string) => void | Promise<void>;
  onHardDelete?: (id: string) => void | Promise<void>;
}

export function ProjectListItem({
  summary,
  active = false,
  onOpen,
  onDelete,
  onDuplicate,
  onRestore,
  onHardDelete,
}: ProjectListItemProps) {
  const [relativeTime, setRelativeTime] = useState("");

  useEffect(() => {
    const updateRelativeTime = () => {
      try {
        setRelativeTime(formatDistance(new Date(summary.lastOpenedAt)));
      } catch {
        setRelativeTime("");
      }
    };
    updateRelativeTime();
    const timer = setInterval(updateRelativeTime, 60_000);
    return () => clearInterval(timer);
  }, [summary.lastOpenedAt]);

  return (
    <div
      className={`od-list-row${active ? " is-active" : ""}`}
      data-testid={`project-row-${summary.id}`}
    >
      <button
        className="od-project-open-target"
        type="button"
        onClick={() => onOpen(summary.id)}
        aria-label={`Open ${summary.name}`}
      >
        <ProjectGlyph active={active} />
        <div className="od-project-summary-main">
          <div className="od-project-title-row">
            <span className="od-project-name">{summary.name}</span>
          </div>
          <div className="meta od-project-description">{summary.description}</div>
        </div>
        <div className="meta od-project-summary-meta">
          <div>{summary.texFileCount} .tex</div>
          <div className="od-project-last-opened">{relativeTime}</div>
        </div>
      </button>
      {!summary.deleted && (onDelete || onDuplicate) && (
        <RowKebab summary={summary} onDelete={onDelete} onDuplicate={onDuplicate} />
      )}
      {summary.deleted ? (
        <div className="od-project-deleted-actions">
          {onRestore && (
            <Button size="sm" variant="ghost" onClick={() => onRestore(summary.id)}>
              Restore
            </Button>
          )}
          {onHardDelete && (
            <Button
              size="sm"
              variant="soft"
              onClick={() => onHardDelete(summary.id)}
              className="od-btn--danger"
            >
              Delete forever
            </Button>
          )}
        </div>
      ) : active ? (
        <Button
          variant="primary"
          size="sm"
          trailingIcon={<I.arrowR size={11} />}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(summary.id);
          }}
        >
          Open
        </Button>
      ) : (
        <I.chevronR className="od-project-chevron" size={13} />
      )}
    </div>
  );
}

function RowKebab({
  summary,
  onDelete,
  onDuplicate,
}: {
  summary: ProjectSummary;
  onDelete?: ((id: string) => void | Promise<void>) | undefined;
  onDuplicate?: ((id: string) => void | Promise<void>) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Confirmation is scoped to one menu session to prevent accidental deletion.
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (!menuRef.current || !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setOpen(false);
    setConfirming(false);
    if (onDelete) void onDelete(summary.id);
  };

  const handleDuplicateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    if (onDuplicate) void onDuplicate(summary.id);
  };

  return (
    <div ref={menuRef} className="od-project-row-menu">
      <button
        type="button"
        className="od-btn od-btn--ghost od-btn--sm od-project-menu-trigger"
        aria-label={`More actions for ${summary.name}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
          setConfirming(false);
        }}
      >
        <I.dots size={14} />
      </button>
      {open && (
        <div
          className="od-project-row-menu-popover"
          role="menu"
          aria-label={`Actions for ${summary.name}`}
        >
          {onDuplicate && (
            <button type="button" role="menuitem" onClick={handleDuplicateClick}>
              Duplicate project
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={handleDeleteClick}
              className={confirming ? "is-confirming" : undefined}
            >
              {confirming ? `Delete ${summary.name}? Click to confirm` : "Delete project"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectGlyph({ active }: { active: boolean }) {
  return (
    <span className={`od-project-glyph${active ? " is-active" : ""}`} aria-hidden="true">
      TeX
    </span>
  );
}

function formatDistance(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}
