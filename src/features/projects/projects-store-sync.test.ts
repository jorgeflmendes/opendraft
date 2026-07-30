import { afterEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand";
import { makeStokesNotes } from "@/lib/mock/project";
import type { ProjectsState } from "./projects-store-types";
import { installProjectsStoreSync, isProjectsSyncMessage } from "./projects-store-sync";

afterEach(() => vi.unstubAllGlobals());

describe("isProjectsSyncMessage", () => {
  it("accepts the cross-tab project state envelope", () => {
    expect(
      isProjectsSyncMessage({
        clientId: "peer",
        type: "SYNC_PROJECTS",
        summaries: [
          {
            id: "p1",
            name: "Paper",
            description: "A local paper",
            texFileCount: 1,
            fileCount: 1,
            lastOpenedAt: "2026-07-29T00:00:00.000Z",
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects malformed cross-tab state", () => {
    expect(isProjectsSyncMessage(null)).toBe(false);
    expect(
      isProjectsSyncMessage({
        clientId: "peer",
        type: "SYNC_PROJECTS",
        summaries: "not-an-array",
      }),
    ).toBe(false);
    expect(
      isProjectsSyncMessage({
        clientId: "peer",
        type: "SYNC_PROJECTS",
        summaries: [{ id: "incomplete" }],
      }),
    ).toBe(false);
  });

  it("rejects legacy envelopes that attempted to synchronise an active project", () => {
    expect(
      isProjectsSyncMessage({
        clientId: "peer",
        type: "SYNC_PROJECTS",
        state: { summaries: [], active: { id: "another-project" } },
      }),
    ).toBe(false);
  });

  it("mirrors summaries without changing the active editor session or echoing the message", () => {
    class TestBroadcastChannel extends EventTarget {
      static instance: TestBroadcastChannel | null = null;
      posted: unknown[] = [];
      constructor(readonly name: string) {
        super();
        TestBroadcastChannel.instance = this;
      }
      postMessage(value: unknown) {
        this.posted.push(value);
      }
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    const active = makeStokesNotes();
    const store = createStore(() => ({
      summaries: [],
      active,
      loading: false,
      error: null,
    })) as unknown as StoreApi<ProjectsState>;
    const uninstall = installProjectsStoreSync(store);
    const channel = TestBroadcastChannel.instance;
    if (!channel) throw new Error("sync channel was not installed");

    channel.dispatchEvent(
      new MessageEvent("message", {
        data: {
          clientId: "peer",
          type: "SYNC_PROJECTS",
          summaries: [
            {
              id: "remote",
              name: "Remote metadata",
              description: "",
              texFileCount: 1,
              fileCount: 1,
              lastOpenedAt: "2026-07-30T00:00:00.000Z",
            },
          ],
        },
      }),
    );

    expect(store.getState().active).toBe(active);
    expect(store.getState().summaries[0]?.id).toBe("remote");
    expect(channel.posted).toEqual([]);
    uninstall();
  });
});
