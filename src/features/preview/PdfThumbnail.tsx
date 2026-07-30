import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

interface PdfThumbnailProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
}

const THUMBNAIL_WIDTH = 112;

export function PdfThumbnail({ doc, pageNumber }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: "400px 0px" },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;

    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: THUMBNAIL_WIDTH / baseViewport.width });
        const outputScale = Math.max(1, window.devicePixelRatio || 1);
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = Math.ceil(viewport.width * outputScale);
        canvas.height = Math.ceil(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          ...(outputScale === 1 ? {} : { transform: [outputScale, 0, 0, outputScale, 0, 0] }),
        });
        await renderTask.promise;
      } catch (cause) {
        if (
          cancelled ||
          (cause as { name?: string } | null)?.name === "RenderingCancelledException"
        ) {
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, pageNumber, visible]);

  return (
    <canvas
      ref={canvasRef}
      className="od-pdf-thumbnail-canvas"
      aria-label={`PDF page ${pageNumber} thumbnail`}
    />
  );
}
