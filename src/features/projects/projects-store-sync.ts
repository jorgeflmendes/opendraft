import type { StoreApi } from "zustand";
import type { ProjectSummary } from "@/domain";
import type { ProjectsState } from "./projects-store-types";

interface ProjectsSyncMessage {
  clientId: string;
  type: "SYNC_PROJECTS";
  summaries: ProjectSummary[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProjectSummary(value: unknown): value is ProjectSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.texFileCount === "number" &&
    typeof value.fileCount === "number" &&
    typeof value.lastOpenedAt === "string"
  );
}

export function isProjectsSyncMessage(value: unknown): value is ProjectsSyncMessage {
  if (!isRecord(value) || value.type !== "SYNC_PROJECTS" || typeof value.clientId !== "string") {
    return false;
  }
  return Array.isArray(value.summaries) && value.summaries.every(isProjectSummary);
}

export function installProjectsStoreSync(store: StoreApi<ProjectsState>): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => undefined;
  }

  const channel = new BroadcastChannel("opendraft_projects_sync");
  const clientId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36);
  let applyingRemoteState = false;
  const unsubscribe = store.subscribe((state, previous) => {
    if (applyingRemoteState) return;
    if (state.summaries !== previous.summaries) {
      channel.postMessage({
        clientId,
        type: "SYNC_PROJECTS",
        summaries: state.summaries,
      } satisfies ProjectsSyncMessage);
    }
  });

  const receive = (event: MessageEvent<unknown>) => {
    if (!isProjectsSyncMessage(event.data) || event.data.clientId === clientId) return;
    // The editor session is deliberately local to each tab. Synchronising the
    // active project or unsaved edits can write one project's content into
    // another tab. Only project-list metadata is safe to mirror.
    applyingRemoteState = true;
    try {
      store.setState({ summaries: event.data.summaries });
    } finally {
      applyingRemoteState = false;
    }
  };
  channel.addEventListener("message", receive);

  return () => {
    unsubscribe();
    channel.removeEventListener("message", receive);
    channel.close();
  };
}
