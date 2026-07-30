import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import { Button, I } from "@/components/primitives";
import { errorMessage } from "@/lib/errors";
import { matchesAnyCombo } from "@/lib/keymap";
import type { PdfRect } from "@/services/synctex";
import { useShortcutBindings } from "@/store/shortcuts";
import { PdfThumbnail } from "./PdfThumbnail";
import { loadPdfjs, loadPdfViewer } from "./pdfjs-loader";

interface PdfRendererProps {
  pdf: Uint8Array;
  highlights?: PdfRect[];
  jumpToPage?: number;
  jumpRequestId?: number;
  onCanvasClick?: (page: number, xPt: number, yPt: number) => void;
}

interface PageView {
  div: HTMLDivElement;
  pdfPage?: PDFPageProxy;
}

interface PageChangingEvent {
  pageNumber: number;
}

interface ScaleChangingEvent {
  scale: number;
  presetValue?: string;
}

const EMPTY_HIGHLIGHTS: readonly PdfRect[] = Object.freeze([]);

function isFormControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function getPageView(viewer: PDFViewer, pageNumber: number): PageView | null {
  return (viewer.getPageView(pageNumber - 1) as PageView | undefined) ?? null;
}

function renderHighlights(viewer: PDFViewer, highlights: readonly PdfRect[]): void {
  const viewerElement = viewer.viewer;
  if (!viewerElement) return;
  viewerElement.querySelectorAll(".od-pdf-overlay").forEach((overlay) => overlay.remove());

  const grouped = new Map<number, PdfRect[]>();
  for (const highlight of highlights) {
    const pageHighlights = grouped.get(highlight.page);
    if (pageHighlights) pageHighlights.push(highlight);
    else grouped.set(highlight.page, [highlight]);
  }

  for (const [pageNumber, pageHighlights] of grouped) {
    const pageView = getPageView(viewer, pageNumber);
    if (!pageView?.pdfPage) continue;

    const viewport = pageView.pdfPage.getViewport({ scale: 1 });
    const overlay = document.createElement("div");
    overlay.className = "od-pdf-overlay";
    overlay.setAttribute("aria-hidden", "true");

    pageHighlights.forEach((highlight) => {
      const marker = document.createElement("span");
      marker.className = "od-pdf-highlight";
      marker.style.left = `${(highlight.x / viewport.width) * 100}%`;
      marker.style.top = `${(highlight.y / viewport.height) * 100}%`;
      marker.style.width = `${(highlight.w / viewport.width) * 100}%`;
      marker.style.height = `${(highlight.h / viewport.height) * 100}%`;
      overlay.append(marker);
    });
    pageView.div.append(overlay);
  }
}

export function PdfRenderer({
  pdf,
  highlights,
  jumpToPage,
  jumpRequestId,
  onCanvasClick,
}: PdfRendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const documentRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<PDFViewer | null>(null);
  const highlightsRef = useRef<readonly PdfRect[]>(highlights ?? EMPTY_HIGHLIGHTS);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [scalePreset, setScalePreset] = useState("page-width");
  const [pageDraft, setPageDraft] = useState("1");
  const [zoomDraft, setZoomDraft] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const total = doc?.numPages ?? 0;
  const zoomInShortcut = useShortcutBindings("pdf.zoomIn");
  const zoomOutShortcut = useShortcutBindings("pdf.zoomOut");
  const zoomResetShortcut = useShortcutBindings("pdf.zoomReset");
  const previousPageShortcut = useShortcutBindings("pdf.previousPage");
  const nextPageShortcut = useShortcutBindings("pdf.nextPage");
  const firstPageShortcut = useShortcutBindings("pdf.firstPage");
  const lastPageShortcut = useShortcutBindings("pdf.lastPage");
  highlightsRef.current = highlights ?? EMPTY_HIGHLIGHTS;

  const syncViewerState = useCallback((viewer: PDFViewer) => {
    setCurrentPage(viewer.currentPageNumber);
    setPageDraft(String(viewer.currentPageNumber));
    setScale(viewer.currentScale);
    setZoomDraft(String(Math.round(viewer.currentScale * 100)));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const viewerElement = documentRef.current;
    if (!container || !viewerElement) return;

    const controller = new AbortController();
    let activeDoc: PDFDocumentProxy | null = null;

    void (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const pdfViewerModule = await loadPdfViewer();
        if (controller.signal.aborted) return;

        const data = new Uint8Array(pdf.byteLength);
        data.set(pdf);
        activeDoc = await pdfjs.getDocument({
          data,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
        }).promise;
        if (controller.signal.aborted) {
          await activeDoc.destroy();
          return;
        }

        const eventBus = new pdfViewerModule.EventBus();
        const linkService = new pdfViewerModule.PDFLinkService({ eventBus });
        const viewer = new pdfViewerModule.PDFViewer({
          container,
          viewer: viewerElement,
          eventBus,
          linkService,
          removePageBorders: true,
          supportsPinchToZoom: true,
        });

        eventBus.on(
          "pagesinit",
          () => {
            viewer.currentScaleValue = "page-width";
            setScalePreset("page-width");
            syncViewerState(viewer);
            renderHighlights(viewer, highlightsRef.current);
          },
          { signal: controller.signal },
        );
        eventBus.on(
          "pagechanging",
          (event: PageChangingEvent) => {
            setCurrentPage(event.pageNumber);
            setPageDraft(String(event.pageNumber));
          },
          { signal: controller.signal },
        );
        eventBus.on(
          "scalechanging",
          (event: ScaleChangingEvent) => {
            setScale(event.scale);
            setZoomDraft(String(Math.round(event.scale * 100)));
            setScalePreset(event.presetValue ?? "custom");
          },
          { signal: controller.signal },
        );
        eventBus.on("pagerendered", () => renderHighlights(viewer, highlightsRef.current), {
          signal: controller.signal,
        });

        linkService.setViewer(viewer);
        linkService.setDocument(activeDoc);
        viewer.setDocument(activeDoc);
        viewerRef.current = viewer;
        setDoc(activeDoc);
        setCurrentPage(1);
        setPageDraft("1");
        setError(null);
      } catch (cause) {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      }
    })();

    return () => {
      controller.abort();
      const viewer = viewerRef.current;
      if (viewer) {
        (viewer.setDocument as (document: PDFDocumentProxy | null) => void)(null);
        viewer.cleanup();
      }
      viewerRef.current = null;
      viewerElement.replaceChildren();
      setDoc(null);
      if (activeDoc) void activeDoc.destroy();
    };
  }, [pdf, syncViewerState]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer) renderHighlights(viewer, highlights ?? EMPTY_HIGHLIGHTS);
  }, [highlights, jumpRequestId]);

  const goToPage = useCallback(
    (requestedPage: number) => {
      const viewer = viewerRef.current;
      if (!viewer || !doc) return;
      const pageNumber = Math.min(doc.numPages, Math.max(1, Math.round(requestedPage)));
      viewer.currentPageNumber = pageNumber;
      viewer.scrollPageIntoView({ pageNumber });
      setCurrentPage(pageNumber);
      setPageDraft(String(pageNumber));
    },
    [doc],
  );

  useEffect(() => {
    if (!doc || jumpToPage === undefined || jumpToPage < 1 || jumpToPage > doc.numPages) return;
    goToPage(jumpToPage);
  }, [doc, goToPage, jumpRequestId, jumpToPage]);

  const commitPageDraft = useCallback(() => {
    const parsed = Number.parseInt(pageDraft, 10);
    if (!Number.isFinite(parsed) || !doc) {
      setPageDraft(String(currentPage));
      return;
    }
    goToPage(parsed);
  }, [currentPage, doc, goToPage, pageDraft]);

  const commitZoomDraft = useCallback(() => {
    const viewer = viewerRef.current;
    const parsed = Number.parseFloat(zoomDraft);
    if (!viewer || !Number.isFinite(parsed)) {
      setZoomDraft(String(Math.round(scale * 100)));
      return;
    }
    if (parsed <= 0) {
      setZoomDraft(String(Math.round(scale * 100)));
      return;
    }
    viewer.updateScale({ scaleFactor: parsed / 100 / viewer.currentScale });
    setScalePreset("custom");
    syncViewerState(viewer);
  }, [scale, syncViewerState, zoomDraft]);

  const applyScalePreset = useCallback(
    (preset: string) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      viewer.currentScaleValue = preset;
      setScalePreset(preset);
      syncViewerState(viewer);
    },
    [syncViewerState],
  );

  const zoomIn = useCallback(
    (origin?: number[]) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      viewer.increaseScale(origin ? { origin, drawingDelay: 250 } : undefined);
      syncViewerState(viewer);
    },
    [syncViewerState],
  );

  const zoomOut = useCallback(
    (origin?: number[]) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      viewer.decreaseScale(origin ? { origin, drawingDelay: 250 } : undefined);
      syncViewerState(viewer);
    },
    [syncViewerState],
  );

  const stepPage = useCallback(
    (direction: "previous" | "next") => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      if (direction === "previous") viewer.previousPage();
      else viewer.nextPage();
      syncViewerState(viewer);
    },
    [syncViewerState],
  );

  const handleViewerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      if (matchesAnyCombo(event.nativeEvent, zoomInShortcut)) {
        event.preventDefault();
        zoomIn();
        return;
      }
      if (matchesAnyCombo(event.nativeEvent, zoomOutShortcut)) {
        event.preventDefault();
        zoomOut();
        return;
      }
      if (matchesAnyCombo(event.nativeEvent, zoomResetShortcut)) {
        event.preventDefault();
        applyScalePreset("1");
        return;
      }

      if (isFormControl(event.target) || !doc) return;
      if (matchesAnyCombo(event.nativeEvent, previousPageShortcut)) {
        event.preventDefault();
        stepPage("previous");
      } else if (matchesAnyCombo(event.nativeEvent, nextPageShortcut)) {
        event.preventDefault();
        stepPage("next");
      } else if (matchesAnyCombo(event.nativeEvent, firstPageShortcut)) {
        event.preventDefault();
        goToPage(1);
      } else if (matchesAnyCombo(event.nativeEvent, lastPageShortcut)) {
        event.preventDefault();
        goToPage(doc.numPages);
      }
    },
    [
      applyScalePreset,
      doc,
      firstPageShortcut,
      goToPage,
      lastPageShortcut,
      nextPageShortcut,
      previousPageShortcut,
      stepPage,
      zoomIn,
      zoomInShortcut,
      zoomOut,
      zoomOutShortcut,
      zoomResetShortcut,
    ],
  );

  const handleViewerWheel = useCallback(
    (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const origin = [event.clientX, event.clientY];
      if (event.deltaY < 0) zoomIn(origin);
      else if (event.deltaY > 0) zoomOut(origin);
    },
    [zoomIn, zoomOut],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.addEventListener("wheel", handleViewerWheel, { passive: false });
    return () => root.removeEventListener("wheel", handleViewerWheel);
  }, [handleViewerWheel]);

  const handleDocumentClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if ((!event.ctrlKey && !event.metaKey) || !onCanvasClick) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const pageElement = target.closest<HTMLElement>(".page[data-page-number]");
      if (!pageElement) return;

      const pageNumber = Number.parseInt(pageElement.dataset.pageNumber ?? "", 10);
      const pageView = viewerRef.current ? getPageView(viewerRef.current, pageNumber) : null;
      if (!pageView?.pdfPage) return;

      event.preventDefault();
      const rect = pageElement.getBoundingClientRect();
      const viewport = pageView.pdfPage.getViewport({ scale: 1 });
      onCanvasClick(
        pageNumber,
        ((event.clientX - rect.left) / rect.width) * viewport.width,
        ((event.clientY - rect.top) / rect.height) * viewport.height,
      );
    },
    [onCanvasClick],
  );

  if (error) {
    return (
      <div className="od-preview-empty">
        <h3 className="od-h3">PDF render failed</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="od-pdf-viewer"
      aria-label="Compiled PDF preview"
      tabIndex={0}
      onKeyDown={handleViewerKeyDown}
    >
      <div className="od-pdf-toolbar">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSidebarOpen((open) => !open)}
          title="Thumbnails"
          aria-label="Toggle thumbnails"
          aria-expanded={sidebarOpen}
        >
          <I.sidebar size={13} />
        </Button>
        <span className="od-pdf-toolbar-separator" aria-hidden="true" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => stepPage("previous")}
          disabled={!doc || currentPage <= 1}
          title="Previous page"
          aria-label="Previous page"
        >
          <I.arrowL size={13} />
        </Button>
        <label className="od-pdf-field">
          <span className="od-sr-only">Page number</span>
          <input
            className="od-pdf-input od-pdf-page-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={total || 1}
            value={pageDraft}
            disabled={!doc}
            aria-label="Page number"
            onChange={(event) => setPageDraft(event.target.value)}
            onBlur={commitPageDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitPageDraft();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                setPageDraft(String(currentPage));
                event.currentTarget.blur();
              }
            }}
          />
          <span aria-hidden="true">of</span>
          <span aria-live="polite">{total || "–"}</span>
        </label>
        <span className="od-sr-only" aria-live="polite">
          Page {currentPage} of {total || "unknown"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => stepPage("next")}
          disabled={!doc || currentPage >= total}
          title="Next page"
          aria-label="Next page"
        >
          <I.arrowR size={13} />
        </Button>
        <span className="grow" />
        <select
          className="od-pdf-select"
          aria-label="Zoom mode"
          value={scalePreset}
          disabled={!doc}
          onChange={(event) => applyScalePreset(event.target.value)}
        >
          {scalePreset === "custom" ? <option value="custom">Custom</option> : null}
          <option value="auto">Automatic</option>
          <option value="1">Actual size</option>
          <option value="page-fit">Fit page</option>
          <option value="page-width">Fit width</option>
        </select>
        <span className="od-pdf-toolbar-separator" aria-hidden="true" />
        <Button
          variant="ghost"
          size="sm"
          aria-label="Zoom out"
          onClick={() => zoomOut()}
          disabled={!doc}
        >
          <I.zoomOut size={13} />
        </Button>
        <label className="od-pdf-field">
          <span className="od-sr-only">Zoom percentage</span>
          <input
            className="od-pdf-input od-pdf-zoom-input"
            type="number"
            inputMode="decimal"
            step={5}
            value={zoomDraft}
            disabled={!doc}
            aria-label="Zoom percentage"
            onChange={(event) => setZoomDraft(event.target.value)}
            onBlur={commitZoomDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitZoomDraft();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                setZoomDraft(String(Math.round(scale * 100)));
                event.currentTarget.blur();
              }
            }}
          />
          <span aria-hidden="true">%</span>
        </label>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Zoom in"
          onClick={() => zoomIn()}
          disabled={!doc}
        >
          <I.zoomIn size={13} />
        </Button>
      </div>
      <div className="od-pdf-body">
        {sidebarOpen && doc ? (
          <aside className="od-pdf-sidebar" aria-label="PDF thumbnails">
            {Array.from({ length: doc.numPages }, (_, index) => {
              const pageNumber = index + 1;
              return (
                <button
                  type="button"
                  key={pageNumber}
                  className={`od-pdf-thumbnail${currentPage === pageNumber ? " is-current" : ""}`}
                  aria-label={`Go to PDF page ${pageNumber}`}
                  aria-current={currentPage === pageNumber ? "page" : undefined}
                  onClick={() => goToPage(pageNumber)}
                >
                  <PdfThumbnail doc={doc} pageNumber={pageNumber} />
                  <span>{pageNumber}</span>
                </button>
              );
            })}
          </aside>
        ) : null}
        <div className="od-pdf-stage">
          <div ref={containerRef} className="od-pdf-container">
            <div
              ref={documentRef}
              className="pdfViewer od-pdf-document"
              onClickCapture={handleDocumentClick}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
