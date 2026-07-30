import { useEffect, useMemo, useRef, useState } from "react";
import { Button, I, Pill } from "@/components/primitives";
import { useProjectsStore } from "./useProjectsStore";
import { ProjectListItem } from "./ProjectListItem";
import { NewProjectForm } from "./NewProjectForm";
import { filterSummaries, mostRecent } from "./picker-helpers";
import {
  isFolderPickerCancellation,
  pickLocalLatexProject,
  supportsLocalFolderAccess,
} from "@/services";
import { errorMessage } from "@/lib/errors";

interface ProjectPickerProps {
  onOpened: (id: string) => void;
}

/** Project discovery, creation, import, and local-folder entry point. */
export function ProjectPicker({ onOpened }: ProjectPickerProps) {
  const summaries = useProjectsStore((s) => s.summaries);
  const loading = useProjectsStore((s) => s.loading);
  const error = useProjectsStore((s) => s.error);
  const loadSummaries = useProjectsStore((s) => s.loadSummaries);
  const openProject = useProjectsStore((s) => s.openProject);
  const createProject = useProjectsStore((s) => s.createProject);
  const removeProject = useProjectsStore((s) => s.removeProject);
  const importProject = useProjectsStore((s) => s.importProject);
  const adoptProject = useProjectsStore((s) => s.adoptProject);

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [folderOpening, setFolderOpening] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!fetchedRef.current && summaries.length === 0 && !loading) {
      fetchedRef.current = true;
      void loadSummaries();
    }
  }, [summaries.length, loading, loadSummaries]);

  const [showTrash, setShowTrash] = useState(false);
  const deletedSummaries = useMemo(() => summaries.filter((s) => s.deleted), [summaries]);
  const activeSummaries = useMemo(() => summaries.filter((s) => !s.deleted), [summaries]);

  const displayedSummaries = showTrash ? deletedSummaries : activeSummaries;
  const filtered = useMemo(
    () => filterSummaries(displayedSummaries, query),
    [displayedSummaries, query],
  );
  const mostRecentId = mostRecent(activeSummaries)?.id ?? null;

  const handleOpen = async (id: string) => {
    await openProject(id);
    if (useProjectsStore.getState().active?.id === id) onOpened(id);
  };

  const handleCreate = async (name: string) => {
    const project = await createProject(name);
    if (project) {
      setCreating(false);
      await openProject(project.id);
      onOpened(project.id);
    }
  };

  const handleDelete = async (id: string) => {
    await removeProject(id);
  };

  const handleDuplicate = async (id: string) => {
    await useProjectsStore.getState().duplicateProject(id);
  };

  const handleRestore = async (id: string) => {
    await useProjectsStore.getState().restoreProject(id);
  };

  const handleHardDelete = async (id: string) => {
    await useProjectsStore.getState().hardDeleteProject(id);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleOpenFolder = async () => {
    if (folderOpening) return;
    setFolderOpening(true);
    setFolderError(null);
    try {
      const folderProject = await pickLocalLatexProject();
      const adopted = await adoptProject(folderProject);
      if (adopted) onOpened(adopted.id);
    } catch (cause) {
      if (!isFolderPickerCancellation(cause)) {
        setFolderError(errorMessage(cause));
      }
    } finally {
      setFolderOpening(false);
    }
  };

  const handleImportFile = async (file: File) => {
    let project;
    if (file.name.endsWith(".zip")) {
      project = await importProject(file);
    } else {
      const text = await file.text();
      project = await importProject(text);
    }

    // Reset input so the same file can be imported again later.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (project) {
      await openProject(project.id);
      if (useProjectsStore.getState().active?.id === project.id) onOpened(project.id);
    }
  };

  return (
    <div className="od-project-picker">
      <header className="od-project-picker-heading">
        <h2 className="od-h2">Open a project</h2>
        <span className="od-project-count" aria-live="polite">
          {loading && summaries.length === 0
            ? "Loading projects..."
            : `${activeSummaries.length} available ${
                activeSummaries.length === 1 ? "project" : "projects"
              }`}
        </span>
      </header>
      <p className="od-project-picker-intro">
        Projects stay in this browser. Cmd/Ctrl+S saves locally, and folders can be opened or saved
        directly on this computer.
      </p>

      <SearchRow
        value={query}
        onChange={setQuery}
        onNew={() => setCreating(true)}
        onImport={handleImportClick}
        onOpenFolder={() => void handleOpenFolder()}
        creating={creating}
        folderOpening={folderOpening}
        folderAccessSupported={supportsLocalFolderAccess()}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json,application/zip,.zip"
        hidden
        aria-label="Import OpenDraft project"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
        }}
      />
      {creating && (
        <NewProjectForm
          onCancel={() => setCreating(false)}
          onSubmit={handleCreate}
          busy={loading}
        />
      )}
      <FilterPills
        total={activeSummaries.length}
        matchCount={showTrash ? deletedSummaries.length : filtered.length}
        deletedCount={deletedSummaries.length}
        showTrash={showTrash}
        onToggleTrash={() => setShowTrash(!showTrash)}
      />

      {error || folderError ? (
        <ErrorPanel message={folderError ?? error!} />
      ) : loading && summaries.length === 0 ? (
        <LoadingPanel />
      ) : filtered.length === 0 ? (
        <EmptyResults query={query} />
      ) : (
        <ul className="od-card od-project-list" aria-label="Available projects">
          {filtered.map((s) => (
            <li key={s.id}>
              <ProjectListItem
                summary={s}
                active={!showTrash && s.id === mostRecentId}
                onOpen={handleOpen}
                {...(s.persisted
                  ? {
                      onDelete: handleDelete,
                      onDuplicate: handleDuplicate,
                      onRestore: handleRestore,
                      onHardDelete: handleHardDelete,
                    }
                  : {})}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// -- Internals -----------------------------------------------------

function SearchRow({
  value,
  onChange,
  onNew,
  onImport,
  onOpenFolder,
  creating,
  folderOpening,
  folderAccessSupported,
}: {
  value: string;
  onChange: (v: string) => void;
  onNew: () => void;
  onImport: () => void;
  onOpenFolder: () => void;
  creating: boolean;
  folderOpening: boolean;
  folderAccessSupported: boolean;
}) {
  return (
    <div className="od-project-actions">
      <div className="od-project-search">
        <I.search size={14} className="od-project-search-icon" />
        <input
          className="od-input"
          aria-label="Search projects"
          placeholder="Search projects..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value ? (
          <button
            type="button"
            className="od-project-search-clear"
            aria-label="Clear project search"
            title="Clear search"
            onClick={() => onChange("")}
          >
            <I.x size={14} />
          </button>
        ) : null}
      </div>
      {folderAccessSupported ? (
        <Button
          className="od-project-action od-project-action--folder"
          size="lg"
          onClick={onOpenFolder}
          disabled={folderOpening}
          title="Open a LaTeX folder directly from this computer"
        >
          <I.folderOpen size={13} /> {folderOpening ? "Opening..." : "Open folder"}
        </Button>
      ) : null}
      <Button
        className="od-project-action od-project-action--import"
        size="lg"
        onClick={onImport}
        title="Import a previously-exported OpenDraft project (JSON or ZIP)"
      >
        <I.upload size={13} /> Import project
      </Button>
      <Button
        className="od-project-action od-project-action--new"
        variant="primary"
        size="lg"
        onClick={onNew}
        disabled={creating}
      >
        <I.plus size={13} /> New project
      </Button>
    </div>
  );
}

function FilterPills({
  total,
  matchCount,
  deletedCount,
  showTrash,
  onToggleTrash,
}: {
  total: number;
  matchCount: number;
  deletedCount: number;
  showTrash: boolean;
  onToggleTrash: () => void;
}) {
  if (deletedCount === 0) return null;

  return (
    <div className="od-project-filters" role="group" aria-label="Filter projects">
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={!showTrash}
        onClick={() => {
          if (showTrash) onToggleTrash();
        }}
      >
        <Pill tone={!showTrash ? "coral" : "neutral"}>
          All <b style={{ marginLeft: 4 }}>{!showTrash ? matchCount : total}</b>
          {!showTrash && matchCount !== total && (
            <span style={{ opacity: 0.6 }}>&nbsp;of&nbsp;{total}</span>
          )}
        </Pill>
      </Button>

      {deletedCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={showTrash}
          onClick={() => {
            if (!showTrash) onToggleTrash();
          }}
          style={{ marginLeft: 4 }}
        >
          <Pill tone={showTrash ? "warn" : "neutral"} title="Projects in the trash">
            Trash <b style={{ marginLeft: 4 }}>{deletedCount}</b>
          </Pill>
        </Button>
      )}
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="od-card od-card-pad od-project-message" role="status">
      Loading projects...
    </div>
  );
}

function EmptyResults({ query }: { query: string }) {
  return (
    <div className="od-card od-card-pad od-project-message">
      {query ? (
        <>No projects match "{query}".</>
      ) : (
        <>No projects yet. Create one, import an archive, or start from a template.</>
      )}
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="od-card od-card-pad od-project-message od-project-message--error" role="alert">
      Couldn't load projects: {message}
    </div>
  );
}
