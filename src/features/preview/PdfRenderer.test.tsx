import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PdfRenderer } from "./PdfRenderer";
import { useShortcutStore } from "@/store/shortcuts";

const mocks = vi.hoisted(() => ({
  viewerInstances: [] as MockPdfViewer[],
  renderPage: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
}));

const makePage = () => ({
  getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
  render: mocks.renderPage,
});

const fakeDoc = {
  numPages: 3,
  getPage: vi.fn(async () => makePage()),
  destroy: vi.fn(() => Promise.resolve()),
};

class MockEventBus {
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  on(name: string, listener: (event: unknown) => void, options?: { signal?: AbortSignal }) {
    const eventListeners = this.listeners.get(name) ?? new Set();
    eventListeners.add(listener);
    this.listeners.set(name, eventListeners);
    options?.signal?.addEventListener("abort", () => eventListeners.delete(listener), {
      once: true,
    });
  }

  dispatch(name: string, event: unknown) {
    this.listeners.get(name)?.forEach((listener) => listener(event));
  }
}

class MockPdfViewer {
  readonly viewer: HTMLDivElement;
  readonly eventBus: MockEventBus;
  readonly pageViews: Array<{
    div: HTMLDivElement;
    pdfPage: ReturnType<typeof makePage>;
  }> = [];
  cleanup = vi.fn();
  increaseScale = vi.fn((options?: { origin?: number[] }) => {
    this.currentScale = this.scale * 1.1;
    return options;
  });
  decreaseScale = vi.fn((options?: { origin?: number[] }) => {
    this.currentScale = this.scale / 1.1;
    return options;
  });
  updateScale = vi.fn(({ scaleFactor }: { scaleFactor: number }) => {
    this.currentScale = Math.min(25, Math.max(0.1, this.scale * scaleFactor));
  });
  previousPage = vi.fn(() => {
    if (this.pageNumber <= 1) return false;
    this.currentPageNumber = this.pageNumber - 1;
    return true;
  });
  nextPage = vi.fn(() => {
    if (this.pageNumber >= fakeDoc.numPages) return false;
    this.currentPageNumber = this.pageNumber + 1;
    return true;
  });
  scrollPageIntoView = vi.fn(({ pageNumber }: { pageNumber: number }) => {
    this.currentPageNumber = pageNumber;
  });
  private pageNumber = 1;
  private scale = 1;
  private scaleValue = "auto";

  constructor({ viewer, eventBus }: { viewer: HTMLDivElement; eventBus: MockEventBus }) {
    this.viewer = viewer;
    this.eventBus = eventBus;
    this.viewer.classList.add("removePageBorders");
    mocks.viewerInstances.push(this);
  }

  get currentPageNumber() {
    return this.pageNumber;
  }

  set currentPageNumber(value: number) {
    this.pageNumber = value;
    this.eventBus.dispatch("pagechanging", { pageNumber: value });
  }

  get currentScale() {
    return this.scale;
  }

  set currentScale(value: number) {
    this.scale = Math.min(25, Math.max(0.1, value));
    this.scaleValue = String(this.scale);
    this.eventBus.dispatch("scalechanging", { scale: this.scale });
  }

  get currentScaleValue() {
    return this.scaleValue;
  }

  set currentScaleValue(value: string) {
    this.scaleValue = value;
    this.scale =
      value === "page-width" ? 1.25 : value === "page-fit" ? 0.9 : value === "1" ? 1 : 1.05;
    this.eventBus.dispatch("scalechanging", { scale: this.scale, presetValue: value });
  }

  setDocument(pdfDocument?: unknown) {
    this.viewer.replaceChildren();
    this.pageViews.length = 0;
    if (!pdfDocument) return;
    for (let pageNumber = 1; pageNumber <= fakeDoc.numPages; pageNumber += 1) {
      const page = document.createElement("div");
      page.className = "page";
      page.dataset.pageNumber = String(pageNumber);
      Object.defineProperty(page, "getBoundingClientRect", {
        value: () => ({
          left: 10,
          top: 20,
          width: 600,
          height: 800,
          right: 610,
          bottom: 820,
          x: 10,
          y: 20,
          toJSON: () => ({}),
        }),
      });
      const canvas = document.createElement("canvas");
      const textLayer = document.createElement("div");
      textLayer.className = "textLayer";
      const text = document.createElement("span");
      text.textContent = `Selectable page ${pageNumber}`;
      textLayer.append(text);
      page.append(canvas, textLayer);
      this.viewer.append(page);
      this.pageViews.push({ div: page, pdfPage: makePage() });
    }
    this.eventBus.dispatch("pagesinit", {});
  }

  getPageView(index: number) {
    return this.pageViews[index];
  }
}

class MockPdfLinkService {
  setViewer = vi.fn();
  setDocument = vi.fn();
}

vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve(fakeDoc) })),
  GlobalWorkerOptions: { workerSrc: "" },
}));

vi.mock("pdfjs-dist/web/pdf_viewer.mjs", () => ({
  EventBus: MockEventBus,
  PDFLinkService: MockPdfLinkService,
  PDFViewer: MockPdfViewer,
}));

vi.mock("@/lib/polyfills/pdf-worker-entry?worker&url", () => ({
  default:
    "data:text/javascript,globalThis.__pdfWorkerFallbackLoaded=true;globalThis.pdfjsWorker={WorkerMessageHandler:{}}",
}));

beforeEach(() => {
  useShortcutStore.getState().resetAll();
  mocks.viewerInstances.length = 0;
  mocks.renderPage.mockClear();
  fakeDoc.getPage.mockClear();
  fakeDoc.destroy.mockClear();
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ({}) as CanvasRenderingContext2D,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe("<PdfRenderer />", () => {
  it("loads the in-page worker fallback when Web Workers are unavailable", async () => {
    vi.stubGlobal("Worker", undefined);
    Reflect.deleteProperty(globalThis, "__pdfWorkerFallbackLoaded");
    try {
      render(<PdfRenderer pdf={new Uint8Array([1, 2, 3])} />);

      await screen.findByText("Page 1 of 3");
      expect(Reflect.get(globalThis, "__pdfWorkerFallbackLoaded")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(globalThis, "__pdfWorkerFallbackLoaded");
    }
  });

  it("delegates page and selectable text rendering to the official PDF.js viewer", async () => {
    render(<PdfRenderer pdf={new Uint8Array([1, 2, 3])} />);

    await screen.findByText("Page 1 of 3");
    expect(document.querySelectorAll(".pdfViewer .page")).toHaveLength(3);
    expect(document.querySelectorAll(".pdfViewer .textLayer")).toHaveLength(3);
    expect(screen.getByText("Selectable page 1")).toBeInTheDocument();
    expect(mocks.viewerInstances[0]?.currentScaleValue).toBe("page-width");
  });

  it("provides standard previous/next navigation and accepts a page number", async () => {
    const user = userEvent.setup();
    render(<PdfRenderer pdf={new Uint8Array([1])} />);

    const pageInput = await screen.findByLabelText("Page number");
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    await user.click(screen.getByLabelText("Next page"));
    expect(pageInput).toHaveValue(2);
    await user.click(screen.getByLabelText("Previous page"));
    expect(pageInput).toHaveValue(1);

    await user.clear(pageInput);
    await user.type(pageInput, "3{Enter}");
    expect(pageInput).toHaveValue(3);
    expect(screen.getByLabelText("Next page")).toBeDisabled();
  });

  it("uses PDF.js zoom presets and accepts exact zoom percentages", async () => {
    const user = userEvent.setup();
    render(<PdfRenderer pdf={new Uint8Array([1])} />);

    const zoomInput = await screen.findByLabelText("Zoom percentage");
    const zoomMode = screen.getByLabelText("Zoom mode");
    expect(zoomMode).toHaveValue("page-width");
    expect(zoomInput).toHaveValue(125);

    await user.selectOptions(zoomMode, "page-fit");
    expect(zoomInput).toHaveValue(90);
    await user.clear(zoomInput);
    await user.type(zoomInput, "175{Enter}");
    expect(zoomInput).toHaveValue(175);
    expect(zoomMode).toHaveValue("custom");

    await user.clear(zoomInput);
    await user.type(zoomInput, "9000{Enter}");
    expect(zoomInput).toHaveValue(2500);
  });

  it("keeps Ctrl/Cmd+wheel anchored at the pointer and supports navigation shortcuts", async () => {
    render(<PdfRenderer pdf={new Uint8Array([1])} />);
    const root = await screen.findByLabelText("Compiled PDF preview");
    const pageInput = screen.getByLabelText("Page number");
    const viewer = mocks.viewerInstances[0]!;

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      clientX: 240,
      clientY: 180,
      deltaY: -100,
    });
    fireEvent(root, wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(viewer.increaseScale).toHaveBeenCalledWith({
      origin: [240, 180],
      drawingDelay: 250,
    });

    fireEvent.keyDown(root, { key: "PageDown" });
    await waitFor(() => expect(pageInput).toHaveValue(2));
    fireEvent.keyDown(root, { key: "End" });
    await waitFor(() => expect(pageInput).toHaveValue(3));
  });

  it("uses customized PDF keyboard shortcuts immediately", async () => {
    useShortcutStore.getState().setBindings("pdf.zoomIn", ["Mod+U"]);
    render(<PdfRenderer pdf={new Uint8Array([1])} />);
    const root = await screen.findByLabelText("Compiled PDF preview");
    const viewer = mocks.viewerInstances[0]!;

    fireEvent.keyDown(root, { ctrlKey: true, key: "u" });
    expect(viewer.increaseScale).toHaveBeenCalledOnce();
    fireEvent.keyDown(root, { ctrlKey: true, key: "=" });
    expect(viewer.increaseScale).toHaveBeenCalledOnce();
  });

  it("maps SyncTeX highlights and reverse clicks through actual PDF page geometry", async () => {
    const onCanvasClick = vi.fn();
    render(
      <PdfRenderer
        pdf={new Uint8Array([1])}
        highlights={[{ page: 1, x: 60, y: 80, w: 120, h: 20 }]}
        onCanvasClick={onCanvasClick}
      />,
    );

    const text = await screen.findByText("Selectable page 1");
    const highlight = document.querySelector(".od-pdf-highlight") as HTMLElement;
    expect(highlight.style.left).toBe("10%");
    expect(highlight.style.top).toBe("10%");
    expect(highlight.style.width).toBe("20%");
    expect(highlight.style.height).toBe("2.5%");

    fireEvent.click(text);
    expect(onCanvasClick).not.toHaveBeenCalled();
    fireEvent.click(text, { ctrlKey: true, clientX: 310, clientY: 420 });
    expect(onCanvasClick).toHaveBeenCalledWith(1, 300, 400);
  });

  it("renders a lazy thumbnail sidebar and marks the current page", async () => {
    const user = userEvent.setup();
    render(<PdfRenderer pdf={new Uint8Array([1])} />);
    await screen.findByText("Page 1 of 3");

    await user.click(screen.getByLabelText("Toggle thumbnails"));
    const firstThumbnail = screen.getByLabelText("Go to PDF page 1");
    expect(firstThumbnail).toHaveAttribute("aria-current", "page");
    await waitFor(() => expect(mocks.renderPage).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Go to PDF page 2"));
    expect(screen.getByLabelText("Go to PDF page 2")).toHaveAttribute("aria-current", "page");
  });
});
