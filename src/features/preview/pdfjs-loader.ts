import type * as PdfjsModule from "pdfjs-dist";
import type * as PdfViewerModule from "pdfjs-dist/web/pdf_viewer.mjs";

let pdfjsCache: typeof PdfjsModule | null = null;
let pdfViewerCache: typeof PdfViewerModule | null = null;

export async function loadPdfjs(): Promise<typeof PdfjsModule> {
  if (pdfjsCache) return pdfjsCache;

  const module = await import("pdfjs-dist");
  const workerUrl = await import("@/lib/polyfills/pdf-worker-entry?worker&url").then(
    (worker) => worker.default,
  );

  if (typeof Worker === "undefined") {
    // Embedded browsers without Worker support require PDF.js to register its
    // message handler on the main thread before loading a document.
    await import(/* @vite-ignore */ workerUrl);
  } else {
    module.GlobalWorkerOptions.workerSrc = workerUrl;
  }

  pdfjsCache = module;
  return module;
}

export async function loadPdfViewer(): Promise<typeof PdfViewerModule> {
  if (pdfViewerCache) return pdfViewerCache;

  const pdfViewer = await import("pdfjs-dist/web/pdf_viewer.mjs");
  pdfViewerCache = pdfViewer;
  return pdfViewerCache;
}
