import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
  type PointerEvent as ReactPointerEvent,
} from "react";

export const MIN_EDITOR_WIDTH = 280;
export const RESIZER_WIDTH = 4;

interface ResizeState {
  pointerId: number;
  startX: number;
  startWidth: number;
  width: number;
  pendingClientX: number | null;
  frameId: number | null;
}

interface UseResizablePanelProps {
  defaultWidth: number;
  minWidth: number;
  direction: "left" | "right";
  getMaxWidth: () => number;
}

export function useResizablePanel({
  defaultWidth,
  minWidth,
  direction,
  getMaxWidth,
}: UseResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const getMaxWidthRef = useRef(getMaxWidth);

  useLayoutEffect(() => {
    getMaxWidthRef.current = getMaxWidth;
  }, [getMaxWidth]);

  const applyWidth = useCallback(
    (nextWidth: number) => {
      const clamped = Math.min(Math.max(minWidth, nextWidth), getMaxWidthRef.current());
      panelRef.current?.style.setProperty("flex", `0 0 ${clamped}px`);
      return clamped;
    },
    [minWidth],
  );

  const finish = useCallback(
    (event?: { pointerId?: number }) => {
      const resize = resizeRef.current;
      if (!resize || (event?.pointerId !== undefined && event.pointerId !== resize.pointerId))
        return;
      if (resize.frameId !== null) cancelAnimationFrame(resize.frameId);
      if (resize.pendingClientX !== null) {
        const delta =
          direction === "left"
            ? resize.pendingClientX - resize.startX
            : resize.startX - resize.pendingClientX;
        resize.width = applyWidth(resize.startWidth + delta);
      }
      setWidth(Math.round(resize.width));
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    [applyWidth, direction],
  );

  const start = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const measuredWidth = panelRef.current?.getBoundingClientRect().width ?? width;
      resizeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: measuredWidth,
        width: measuredWidth,
        pendingClientX: null,
        frameId: null,
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Global listeners keep resizing functional when pointer capture is unavailable.
      }
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      event.preventDefault();
    },
    [width],
  );

  const move = useCallback(
    (event: { pointerId: number; clientX: number }) => {
      const resize = resizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      resize.pendingClientX = event.clientX;
      if (resize.frameId !== null) return;
      resize.frameId = requestAnimationFrame(() => {
        const active = resizeRef.current;
        if (!active || active.pendingClientX === null) return;
        const delta =
          direction === "left"
            ? active.pendingClientX - active.startX
            : active.startX - active.pendingClientX;
        active.width = applyWidth(active.startWidth + delta);
        active.frameId = null;
      });
    },
    [applyWidth, direction],
  );

  useEffect(() => {
    const end = (event: PointerEvent) => finish(event);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [finish, move]);

  useEffect(() => {
    const clamp = () => setWidth((current) => Math.round(applyWidth(current)));
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [applyWidth]);

  useEffect(
    () => () => {
      const resize = resizeRef.current;
      if (resize?.frameId != null) cancelAnimationFrame(resize.frameId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    [],
  );

  const resizeBy = useCallback(
    (delta: number) => setWidth((current) => Math.round(applyWidth(current + delta))),
    [applyWidth],
  );

  return {
    width,
    minWidth,
    maxWidth: getMaxWidth,
    panelRef,
    resizeBy,
    start,
    move,
    finish,
  };
}
