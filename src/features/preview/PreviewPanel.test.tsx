import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreviewPanel } from "./PreviewPanel";
import { useSyncStore } from "./useSyncStore";
import { useCompileStore } from "@/features/compile";
import { useTabsStore } from "@/features/editor";
import type { CompileResult, Project } from "@/domain";
import type { ForwardRecord, SyncTexIndex } from "@/services/synctex";

vi.mock("./PdfRenderer", () => ({
  PdfRenderer: ({
    onCanvasClick,
  }: {
    onCanvasClick?: (page: number, xPt: number, yPt: number) => void;
  }) => (
    <button type="button" onClick={() => onCanvasClick?.(1, 12, 24)}>
      Rendered PDF
    </button>
  ),
}));

// PreviewPanel pulls a lot of upstream state from Zustand stores; we
// reset them between tests so each case starts from a clean slate.

const PROJECT: Project = {
  id: "p-prev",
  name: "Prev",
  entry: "main.tex",
  files: {
    "main.tex": {
      id: "f1",
      path: "main.tex",
      name: "main.tex",
      kind: "tex",
      content: "\\documentclass{article}",
    },
  },
  folders: {},
  createdAt: "2026-05-22T12:00:00Z",
};

beforeEach(() => {
  useCompileStore.setState({
    status: "idle",
    result: null,
    progress: null,
    synctex: null,
  } as never);
  useSyncStore.getState().reset();
  useTabsStore.setState({ openTabs: [], activeTab: null, edits: {} });
});

describe("<PreviewPanel />", () => {
  it("renders the idle 'Run Compile' card when there's no result", () => {
    render(<PreviewPanel project={PROJECT} width={460} />);
    expect(screen.getByRole("button", { name: /run compile/i })).toBeInTheDocument();
  });

  it("renders a compiling card while a compile is in flight", () => {
    useCompileStore.setState({
      ...useCompileStore.getState(),
      status: "compiling",
      progress: { label: "Loading TeX Live", index: 0, total: 3 },
    } as never);
    render(<PreviewPanel project={PROJECT} width={460} />);
    expect(screen.getByText(/loading tex live/i)).toBeInTheDocument();
  });

  it("renders a failure card with a Try again button on compile error", () => {
    useCompileStore.setState({
      ...useCompileStore.getState(),
      status: "error",
      result: {
        status: "error",
        engine: "BusyTeX",
        log: [],
      } satisfies CompileResult,
    } as never);
    render(<PreviewPanel project={PROJECT} width={460} />);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("explains when a successful compile produced no PDF", () => {
    useCompileStore.setState({
      ...useCompileStore.getState(),
      status: "success",
      result: {
        status: "success",
        engine: "Mock",
        log: [],
        durationLabel: "1.2s",
      } satisfies CompileResult,
    } as never);
    render(<PreviewPanel project={PROJECT} width={460} />);
    expect(screen.getByText(/no real pdf was produced/i)).toBeInTheDocument();
  });

  it("marks a previously compiled PDF as outdated after source changes", () => {
    useCompileStore.setState({
      ...useCompileStore.getState(),
      status: "success",
      result: {
        status: "success",
        engine: "BusyTeX",
        log: [],
        pdf: new Uint8Array([37, 80, 68, 70]),
      } satisfies CompileResult,
    } as never);

    render(<PreviewPanel project={PROJECT} width={460} stale />);

    expect(screen.getByText("Outdated")).toBeInTheDocument();
  });

  it("routes canvas clicks through the synctex reverse index into useSyncStore", async () => {
    const reverseHit: ForwardRecord = {
      page: 1,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      path: "main.tex",
      line: 42,
    };
    const stubIndex: SyncTexIndex = {
      pageCount: 1,
      forward: () => [],
      reverse: vi.fn(() => reverseHit),
      pageRecords: () => [],
    };
    useCompileStore.setState({
      ...useCompileStore.getState(),
      status: "success",
      result: {
        status: "success",
        engine: "BusyTeX",
        log: [],
        pdf: new Uint8Array([37, 80, 68, 70]),
      } satisfies CompileResult,
      synctex: stubIndex,
    } as never);
    render(<PreviewPanel project={PROJECT} width={460} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Rendered PDF" }));

    expect(stubIndex.reverse).toHaveBeenCalledWith(1, 12, 24);
    expect(useSyncStore.getState().reverseTarget).toMatchObject({
      path: "main.tex",
      line: 42,
    });
    expect(useSyncStore.getState().reverseTarget?.requestId).toBeGreaterThan(0);
  });
});
